# Plan 3 — Coaching Chat

**Date:** 2026-03-19
**Branch:** plan-1-foundation (continue here)

---

## Overview

Replace the `CoachingChat.tsx` "coming soon" placeholder with a working AI coaching chat. The Head Coach receives rich context (profile + workout plan) on every request and responds to broad fitness questions (workout, nutrition, sleep, recovery). Stateless — no message persistence. Modular context builder makes it straightforward to extend with additional agents later.

---

## Architecture

Four new files:

| File | Responsibility |
|------|---------------|
| `lib/coaching/prompts.ts` | Static `COACH_PERSONA` constant — persona, tone, rules |
| `lib/coaching/context.ts` | `buildCoachingContext(profile, plan)` — assembles system prompt string |
| `app/api/chat/route.ts` | POST handler — auth, fetch data, build context, stream response |
| `app/dashboard/chat/CoachingChat.tsx` | Chat UI — replaces "coming soon" placeholder |

---

## Section 1: Persona + Prompts

`lib/coaching/prompts.ts` exports a single constant:

```typescript
export const COACH_PERSONA = `
You are NoXcuses, a science-based bodybuilding and fitness coach.
...
`
```

Covers: tone (direct, encouraging, evidence-based), scope (workout programming, nutrition, sleep, recovery), what to avoid (diagnosing injuries, medical advice).

---

## Section 2: Context Builder

`lib/coaching/context.ts`:

```typescript
import { COACH_PERSONA } from './prompts'
import type { WorkoutPlan } from '@/lib/plan/types'

type CoachingProfile = {
  goal?: string
  age_bracket?: string
  sex?: string
  height_cm?: number
  weight_kg?: number
  training_age?: string
  equipment?: string
  days_per_week?: number
  limitations?: string | null
}

export function buildCoachingContext(
  profile: CoachingProfile,
  plan: WorkoutPlan | null
): string
```

Returns a single string: `COACH_PERSONA` + formatted profile block + formatted plan block.

**Profile block** — labeled fields (same label maps as onboarding state machine):
```
User Profile:
- Goal: Muscle gain
- Age: 25-35
- Sex: Male
- Height: 175cm / Weight: 80kg
- Experience: 6–24 months
- Equipment: Full gym
- Schedule: 4 days/week
- Limitations: None
```

**Plan block** — if plan exists:
```
Current Workout Plan: 4-Day Upper/Lower Split (8 weeks)

Day 1 – Upper Push:
  - Bench Press: 4 sets × 6-8 reps, 180s rest
  - ...

Diet Targets: 2800 kcal | Protein: 180g | Carbs: 320g | Fat: 80g

Notes: Add 2.5kg/week on compounds when top of rep range hit.
```

If no plan: `"User has not yet generated a workout plan."`

---

## Section 3: CoachingChat UI

`app/dashboard/chat/CoachingChat.tsx` — replaces the "coming soon" placeholder.

Uses `useChat` from `@ai-sdk/react` with `DefaultChatTransport({ api: '/api/chat' })`.

Canned welcome message via `INITIAL_MESSAGES` (same pattern as `OnboardingChat`):

```typescript
// UIMessage imported from 'ai' — same as OnboardingChat
import type { UIMessage } from 'ai'

const INITIAL_MESSAGES: UIMessage[] = [{
  id: 'welcome',
  role: 'assistant',
  parts: [{ type: 'text', text: "Hey! I'm your NoXcuses coach. How can I help you today?" }],
}]
```

Layout: full-height scroll area, message bubbles (user right, assistant left), loading indicator, text input + send button. Plain text rendering via `<span>` — no markdown. Message history is client-side only — refreshing resets to the welcome message.

---

## Section 4: `/api/chat` Route

`app/api/chat/route.ts`:

```typescript
import { createOpenAI } from '@ai-sdk/openai'
import { streamText, convertToModelMessages } from 'ai'
import { buildCoachingContext } from '@/lib/coaching/context'
import type { WorkoutPlan } from '@/lib/plan/types'

const openai = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  // 1. Auth check — return 401 if no user
  // 2. Parse messages from request body
  // 3. Fetch profile from DB via getOrCreateProfile — pass the Profile directly to
  //    buildCoachingContext (Profile satisfies CoachingProfile structurally; no transformation needed)
  // 4. Fetch most recent active workout:
  //    .from('workouts').select('plan_data')
  //    .eq('user_id', user.id).eq('status', 'active')
  //    .order('generated_at', { ascending: false }).limit(1).single()
  //    If error or no row, plan = null
  // 5. Assign plan_data: Supabase JS auto-parses JSONB — assign as WorkoutPlan directly,
  //    do NOT JSON.parse. Cast: `row.plan_data as WorkoutPlan`
  // 6. Build context: buildCoachingContext(profile, plan)
  // 7. Stream response:
  // Note: name the createOpenAI instance something other than `openai` (e.g. `openaiProvider`)
  // to avoid shadowing the import identifier.
  const result = streamText({
    model: openaiProvider('gpt-4o'),
    system: context,
    messages: await convertToModelMessages(messages),
  })
  return result.toUIMessageStreamResponse()
}
```

Stateless — no `onFinish`, no DB writes.

---

## Section 5: Error Handling

- No user → 401
- Profile fetch fails → 500
- Workout fetch fails → plan treated as `null` (coach responds without plan context)
- `buildCoachingContext` never throws — all fields optional, nulls handled with defaults

---

## Files Changed

| File | Change |
|------|--------|
| `lib/coaching/prompts.ts` | **New** — `COACH_PERSONA` constant |
| `lib/coaching/context.ts` | **New** — `buildCoachingContext(profile, plan)` |
| `lib/coaching/context.test.ts` | **New** — unit tests for context builder |
| `app/api/chat/route.ts` | **New** — POST handler |
| `app/dashboard/chat/CoachingChat.tsx` | **Replace** "coming soon" with working chat UI |

---

## Out of Scope

- Message history persistence (DB)
- Research agent / plan regeneration from chat
- Exercise YouTube links or cues
- Safety pre-flight for coaching messages
- Markdown rendering in chat bubbles
