# Onboarding Fixes + Plan Generation

**Date:** 2026-03-19
**Branch:** plan-1-foundation (continue here, or new branch)

## Problem Statement

Two issues found after completing the onboarding flow end-to-end:

1. **Summary markdown** — The SUMMARY state's AI response uses markdown formatting (`**bold**`, bullets). The chat UI renders raw text via `<span>`, so markdown shows literally. The summary should read as plain labeled fields: `Age: X`, `Sex: Y`, etc.

2. **No plan generated** — The PLAN_GENERATION state streams "building your plan now..." but never actually generates anything. The state advances and `onboarding_complete` is set to `true`, leaving the user with a "coming soon" coaching screen and no plan.

---

## Design

### Fix 1: Summary Plain-Text Format

Update `systemPromptForState` for the `SUMMARY` state in `lib/onboarding/state-machine.ts`.

**Root bug:** the SUMMARY prompt doesn't prohibit markdown AND doesn't use the actual profile values from `draft`. The function receives `draft: ProfileDraft` but ignores it for SUMMARY. Fix both:

1. Interpolate the actual stored values from `draft` directly into the system prompt so the LLM isn't recalling from chat history
2. Instruct the AI to output plain labeled text — no markdown, no bullets, no bold

Required output format:
```
Age: 18+
Goal: Muscle gain
Sex: Male
Height: 175cm / Weight: 80kg
Experience: 6–24 months
Equipment: Full gym
Schedule: 4 days/week
Limitations: None
```

The prompt should include the `draft` values inline (e.g., `Age: ${draft.age_bracket}`) and instruct the AI to present them exactly as shown above. Use `draft.limitations ?? 'None'` — the field is `string | undefined` in `ProfileDraft`.

---

### Fix 2: Plan Generation (Inline Streaming)

When `currentState === 'PLAN_GENERATION'`, add an early-return branch at the top of the POST handler — **before** the `streamText` block — that builds and returns the plan generation response directly. This branch must `return` its response immediately, so the existing `streamText` block (and its `onFinish` callback, which also checks for `PLAN_GENERATION`) is never reached. The `onFinish` callback must not run for this state.

Handle the full response manually inside `createUIMessageStream`:

```
execute: async ({ writer }) => {
  1. Write canned "One moment, building your plan..." to stream
  2. Call generatePlan(profile) — may throw
  3. If generatePlan succeeds:
     - INSERT into workouts table (status: 'active') — may throw
     - If INSERT succeeds:
       - Advance state to COMPLETE, set onboarding_complete: true
       - Write "Your plan is ready!" to stream
     - If INSERT fails:
       - Write "Something went wrong saving your plan. Please try again." to stream
       - Do NOT advance state (user stays in PLAN_GENERATION)
  4. If generatePlan throws:
     - Write "Something went wrong building your plan. Please try again." to stream
     - Do NOT advance state
}
```

**Important:** state advancement (`onboarding_complete: true`, `onboarding_state: COMPLETE`) happens only after a confirmed successful INSERT. The `onFinish` callback is not involved — the existing `onFinish` logic only runs when `streamText` is used, which we're bypassing for this state.

---

### Plan Data Structure

Stored in `workouts.plan_data` (JSONB). This schema **supersedes** the `WorkoutPlan` definition in `docs/superpowers/specs/2026-03-18-noxcuses-design.md`, which used camelCase and included `youtubeUrl`/`cues` fields that require the exercises table to be populated (out of scope here).

```typescript
// lib/plan/types.ts
export interface WorkoutPlan {
  program_name: string        // e.g. "4-Day Upper/Lower Split"
  weeks: number               // AI determines based on training_age: none/under_6mo → 4, 6mo_2yr → 8, over_2yr → 12
  schedule: Array<{
    day_label: string         // e.g. "Day 1 – Upper Push"
    exercises: Array<{
      name: string
      sets: number
      reps: string            // e.g. "6-8" or "12"
      rest_seconds: number
    }>
  }>
  diet: {
    daily_calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  notes: string               // e.g. "Add 2.5kg/week on compounds"
}
```

---

### `generatePlan` Function

**Location:** `lib/plan/generator.ts`

**Signature:**
```typescript
export async function generatePlan(profile: {
  age_bracket?: string
  goal?: string
  sex?: string
  height_cm?: number
  weight_kg?: number
  training_age?: string
  equipment?: string
  days_per_week?: number
  limitations?: string | null
}): Promise<WorkoutPlan>
```

Takes only user-facing profile fields — no internal state fields (`id`, `user_id`, `onboarding_state`, `onboarding_complete`).

Uses `provider.complete()` (non-streaming) with a structured JSON prompt. The prompt instructs the AI to return ONLY valid JSON matching the `WorkoutPlan` schema — no extra text, no markdown fencing.

`limitations: null` or `undefined` → prompt treats as "No physical limitations".

After parsing, throws if the returned value is missing `schedule` or `diet` (basic shape check before returning — prevents malformed data reaching the DB).

**The route does the INSERT**, not `generatePlan`. `generatePlan` is a pure function that returns `WorkoutPlan`. This keeps it testable.

---

### Fix 3: "View Plan" Link in Chat

`OnboardingChat.tsx` checks the last assistant message after each render. Detection logic:

```typescript
const lastAssistant = [...messages].reverse().find(m => m.role === 'assistant')
const lastText = lastAssistant?.parts
  .filter(p => p.type === 'text')
  .map(p => (p as { type: 'text'; text: string }).text)
  .join('') ?? ''
const planReady = lastText.includes('Your plan is ready!')
```

If `planReady` is true, render a styled "View your plan →" button (an `<a>` tag linking to `/dashboard/plan`) below the last message bubble.

**Use `m.parts`, not `m.content`** — `UIMessage` in AI SDK v6 has no `content` field.

---

### New: `/dashboard/plan` Page

Server component at `app/dashboard/plan/page.tsx`:

- Auth check — redirect to `/login` if no user
- Fetch most recent `workouts` row where `user_id = user.id` and `status = 'active'`
- If no row found: redirect to `/dashboard/chat`
- Parse `plan_data` — wrap in try/catch; if malformed or missing required fields (`schedule`, `diet`), render an error state: "Your plan data looks corrupted. Please regenerate." (with a button linking back to `/dashboard/chat`)
- Renders:
  - **Header**: `program_name` + `weeks` weeks
  - **Diet targets**: one row — Calories / Protein / Carbs / Fat
  - **Schedule**: one card per `schedule` entry, listing exercises as `sets × reps, rest Xs`
  - **Notes**: text block at bottom

---

### Sidebar

The "My Plan" link (`/dashboard/plan`) already exists in `app/dashboard/layout.tsx` — no change needed.

---

## Files Changed

| File | Change |
|------|--------|
| `lib/onboarding/state-machine.ts` | Update SUMMARY prompt: interpolate `draft` values, plain-text format, no markdown |
| `lib/plan/types.ts` | **New** — `WorkoutPlan` interface (supersedes old design spec schema) |
| `lib/plan/generator.ts` | **New** — `generatePlan(profile)` pure function, returns `WorkoutPlan` |
| `app/api/onboard/route.ts` | PLAN_GENERATION: bypass streamText, call generatePlan, INSERT, stream canned messages, advance state only on success |
| `app/dashboard/chat/OnboardingChat.tsx` | Detect "Your plan is ready!" via parts join → render "View your plan →" button |
| `app/dashboard/plan/page.tsx` | **New** — plan display page with malformed-data fallback |

---

## Out of Scope

- Exercise YouTube links (exercises table is empty; Plan 3 will add a curated library)
- Progress photo upload
- Coaching chat
- Plan editing or regeneration
- Adding the sidebar Plan link (already exists)
