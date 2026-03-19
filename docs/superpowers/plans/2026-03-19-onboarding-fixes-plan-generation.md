# Onboarding Fixes + Plan Generation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the SUMMARY state's markdown output, implement real plan generation in the PLAN_GENERATION state, and add a plan display page at `/dashboard/plan`.

**Architecture:** Three independent changes: (1) update the SUMMARY system prompt to interpolate draft values and forbid markdown; (2) add an early-return branch in `POST /api/onboard` for `PLAN_GENERATION` that calls a pure `generatePlan()` function, inserts the result into `workouts`, and streams canned messages; (3) add `/dashboard/plan` server component and a "View your plan" button in `OnboardingChat`.

**Tech Stack:** Next.js 16 App Router, Vercel AI SDK v6 (`ai`, `@ai-sdk/react`), Supabase JS v2, TypeScript 5, Vitest

---

## File Map

```
noxcuses/
├── lib/
│   ├── plan/
│   │   ├── types.ts          CREATE — WorkoutPlan interface
│   │   └── generator.ts      CREATE — generatePlan(profile, provider): Promise<WorkoutPlan>
│   └── onboarding/
│       └── state-machine.ts  MODIFY — SUMMARY prompt: interpolate draft values, no markdown
├── app/
│   ├── api/onboard/
│   │   └── route.ts          MODIFY — early-return PLAN_GENERATION branch
│   ├── dashboard/
│   │   ├── chat/
│   │   │   └── OnboardingChat.tsx  MODIFY — detect "Your plan is ready!" → show button
│   │   └── plan/
│   │       └── page.tsx      CREATE — plan display page
└── tests/
    └── plan/
        └── generator.test.ts CREATE — unit tests for generatePlan
```

---

## Task 1: Plan Types

**Files:**
- Create: `lib/plan/types.ts`

No LLM, no DB — pure TypeScript interface.

- [ ] **Step 1: Create types file**

Create `lib/plan/types.ts`:
```typescript
export interface WorkoutPlan {
  program_name: string
  weeks: number
  schedule: Array<{
    day_label: string
    exercises: Array<{
      name: string
      sets: number
      reps: string
      rest_seconds: number
    }>
  }>
  diet: {
    daily_calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  notes: string
}
```

- [ ] **Step 2: Commit**

```bash
cd noxcuses
git add lib/plan/types.ts
git commit -m "feat: add WorkoutPlan type"
```

---

## Task 2: Plan Generator (TDD)

**Files:**
- Create: `tests/plan/generator.test.ts`
- Create: `lib/plan/generator.ts`

`generatePlan` is a pure function — takes a profile and an `AIProvider`, calls `provider.complete()` with a structured JSON prompt, parses and validates the result, throws on failure.

> **Note:** The spec shows a single-argument signature for `generatePlan`. This plan passes `provider` as a second argument for testability (matching the pattern used by `SafetyAgent`). The plan supersedes the spec on this point.

- [ ] **Step 1: Write failing tests**

Create `tests/plan/generator.test.ts`:
```typescript
import { describe, it, expect, vi } from 'vitest'
import { generatePlan } from '@/lib/plan/generator'
import type { AIProvider } from '@/lib/ai/types'

function mockProvider(response: string): AIProvider {
  return {
    complete: vi.fn().mockResolvedValue(response),
    stream: vi.fn(),
  } as unknown as AIProvider
}

const VALID_PLAN = {
  program_name: '3-Day Full Body',
  weeks: 4,
  schedule: [
    {
      day_label: 'Day 1 – Full Body A',
      exercises: [
        { name: 'Squat', sets: 3, reps: '8-10', rest_seconds: 90 },
      ],
    },
  ],
  diet: { daily_calories: 2500, protein_g: 150, carbs_g: 250, fat_g: 70 },
  notes: 'Add weight each week',
}

describe('generatePlan', () => {
  it('returns a WorkoutPlan for a valid JSON response', async () => {
    const provider = mockProvider(JSON.stringify(VALID_PLAN))
    const plan = await generatePlan({ goal: 'muscle_gain', days_per_week: 3 }, provider)
    expect(plan.program_name).toBe('3-Day Full Body')
    expect(plan.schedule).toHaveLength(1)
    expect(plan.diet.daily_calories).toBe(2500)
  })

  it('strips markdown code fences and parses correctly', async () => {
    const fenced = '```json\n' + JSON.stringify(VALID_PLAN) + '\n```'
    const provider = mockProvider(fenced)
    const plan = await generatePlan({ goal: 'muscle_gain' }, provider)
    expect(plan.program_name).toBe('3-Day Full Body')
  })

  it('throws on invalid JSON', async () => {
    const provider = mockProvider('not json at all')
    await expect(generatePlan({ goal: 'muscle_gain' }, provider)).rejects.toThrow('invalid JSON')
  })

  it('throws when schedule is an empty array', async () => {
    const provider = mockProvider(JSON.stringify({ ...VALID_PLAN, schedule: [] }))
    await expect(generatePlan({ goal: 'muscle_gain' }, provider)).rejects.toThrow()
  })

  it('throws when diet is missing', async () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { diet: _diet, ...withoutDiet } = VALID_PLAN
    const provider = mockProvider(JSON.stringify(withoutDiet))
    await expect(generatePlan({ goal: 'muscle_gain' }, provider)).rejects.toThrow()
  })

  it('passes undefined limitations gracefully', async () => {
    const provider = mockProvider(JSON.stringify(VALID_PLAN))
    await expect(
      generatePlan({ goal: 'muscle_gain', limitations: undefined }, provider)
    ).resolves.toBeDefined()
  })
})
```

- [ ] **Step 2: Run tests — expect FAIL**

```bash
cd noxcuses
npm run test:run -- tests/plan/generator.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/plan/generator'`

- [ ] **Step 3: Implement generator**

Create `lib/plan/generator.ts`:
```typescript
import type { AIProvider } from '@/lib/ai/types'
import type { WorkoutPlan } from './types'

type PlanProfile = {
  age_bracket?: string
  goal?: string
  sex?: string
  height_cm?: number
  weight_kg?: number
  training_age?: string
  equipment?: string
  days_per_week?: number
  limitations?: string
}

export async function generatePlan(profile: PlanProfile, provider: AIProvider): Promise<WorkoutPlan> {
  const weeks =
    profile.training_age === 'over_2yr' ? 12
    : profile.training_age === '6mo_2yr' ? 8
    : 4

  const prompt = `You are a science-based bodybuilding coach. Generate a personalized training plan.

User profile:
- Goal: ${profile.goal ?? 'general_fitness'}
- Sex: ${profile.sex ?? 'unspecified'}
- Age bracket: ${profile.age_bracket ?? 'unspecified'}
- Height: ${profile.height_cm ? `${profile.height_cm}cm` : 'unspecified'}
- Weight: ${profile.weight_kg ? `${profile.weight_kg}kg` : 'unspecified'}
- Training experience: ${profile.training_age ?? 'none'}
- Equipment: ${profile.equipment ?? 'bodyweight'}
- Days per week: ${profile.days_per_week ?? 3}
- Limitations: ${profile.limitations ?? 'None'}

Return ONLY valid JSON matching this exact schema — no markdown fences, no explanation:
{
  "program_name": "string",
  "weeks": ${weeks},
  "schedule": [
    {
      "day_label": "string",
      "exercises": [
        { "name": "string", "sets": number, "reps": "string", "rest_seconds": number }
      ]
    }
  ],
  "diet": {
    "daily_calories": number,
    "protein_g": number,
    "carbs_g": number,
    "fat_g": number
  },
  "notes": "string"
}`

  const raw = await provider.complete(
    [{ role: 'user', content: prompt }],
    { temperature: 0.7, model: 'gpt-4o' }
  )

  let parsed: unknown
  try {
    const cleaned = raw.replace(/^```json\n?/, '').replace(/\n?```$/, '').trim()
    parsed = JSON.parse(cleaned)
  } catch {
    throw new Error('Plan generation returned invalid JSON')
  }

  if (
    !parsed ||
    typeof parsed !== 'object' ||
    !Array.isArray((parsed as WorkoutPlan).schedule) ||
    (parsed as WorkoutPlan).schedule.length === 0 ||
    typeof (parsed as WorkoutPlan).diet !== 'object'
  ) {
    throw new Error('Plan generation returned incomplete data')
  }

  return parsed as WorkoutPlan
}
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run -- tests/plan/generator.test.ts
```

Expected: all 6 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/plan/generator.ts tests/plan/generator.test.ts
git commit -m "feat: add plan generator with TDD"
```

---

## Task 3: Fix SUMMARY System Prompt (TDD)

**Files:**
- Modify: `lib/onboarding/state-machine.ts`
- Modify: `tests/onboarding/state-machine.test.ts`

The SUMMARY prompt currently ignores the `draft` parameter and produces markdown. Fix: add label-mapping constants and interpolate `draft` values directly into the prompt text.

- [ ] **Step 1: Add a failing test**

Open `tests/onboarding/state-machine.test.ts` and add this describe block after the existing ones:

```typescript
describe('systemPromptForState — SUMMARY', () => {
  it('contains actual profile values from draft', () => {
    const draft = {
      age_bracket: '18_plus',
      goal: 'muscle_gain',
      sex: 'male',
      height_cm: 175,
      weight_kg: 80,
      training_age: '6mo_2yr',
      equipment: 'full_gym',
      days_per_week: 4,
    }
    const prompt = systemPromptForState('SUMMARY', draft)
    expect(prompt).toContain('Age:')
    expect(prompt).toContain('18 or older')
    expect(prompt).toContain('Muscle gain')
    expect(prompt).toContain('175cm')
    expect(prompt).toContain('80kg')
    expect(prompt).toContain('4 days/week')
  })

  it('does not contain markdown bold syntax', () => {
    const prompt = systemPromptForState('SUMMARY', { age_bracket: '18_plus' })
    expect(prompt).not.toMatch(/\*\*/)
  })

  it('shows None for missing limitations', () => {
    const prompt = systemPromptForState('SUMMARY', {})
    expect(prompt).toContain('Limitations: None')
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:run -- tests/onboarding/state-machine.test.ts
```

Expected: new tests FAIL (prompt currently ignores draft and may contain markdown).

- [ ] **Step 3: Update state-machine.ts**

Open `lib/onboarding/state-machine.ts`. Add these label maps near the top of the file, before `ORDERED_STATES`:

```typescript
const AGE_LABEL: Record<string, string> = {
  under_16: 'Under 16', '16_17': '16–17', '18_plus': '18 or older',
}
const GOAL_LABEL: Record<string, string> = {
  muscle_gain: 'Muscle gain', fat_loss: 'Fat loss',
  recomposition: 'Body recomposition', general_fitness: 'General fitness',
}
const SEX_LABEL: Record<string, string> = {
  male: 'Male', female: 'Female', other: 'Prefer not to say',
}
const TRAINING_LABEL: Record<string, string> = {
  none: 'No prior training', under_6mo: 'Less than 6 months',
  '6mo_2yr': '6 months to 2 years', over_2yr: 'More than 2 years',
}
const EQUIPMENT_LABEL: Record<string, string> = {
  full_gym: 'Full gym', dumbbells: 'Dumbbells only',
  home: 'Home gym', bodyweight: 'Bodyweight only',
}
```

Then replace the `SUMMARY` entry in `statePrompts`.

> **Critical:** Do NOT move `statePrompts` outside `systemPromptForState`. It must remain inside the function body so that `draft` is in scope for template literal interpolation. If `statePrompts` were at module scope, `draft` would be undefined and TypeScript would error.



```typescript
SUMMARY: `${base}

Present the following profile summary to the user EXACTLY as shown below — plain text only, no markdown, no bold, no bullets:

Age: ${AGE_LABEL[draft.age_bracket ?? ''] ?? 'Not provided'}
Goal: ${GOAL_LABEL[draft.goal ?? ''] ?? 'Not provided'}
Sex: ${SEX_LABEL[draft.sex ?? ''] ?? 'Not provided'}
Height: ${draft.height_cm ? `${draft.height_cm}cm` : 'Not provided'} / Weight: ${draft.weight_kg ? `${draft.weight_kg}kg` : 'Not provided'}
Experience: ${TRAINING_LABEL[draft.training_age ?? ''] ?? 'Not provided'}
Equipment: ${EQUIPMENT_LABEL[draft.equipment ?? ''] ?? 'Not provided'}
Schedule: ${draft.days_per_week ? `${draft.days_per_week} days/week` : 'Not provided'}
Limitations: ${draft.limitations ?? 'None'}

After presenting this summary, ask the user to confirm everything looks right before you generate their plan.`,
```

- [ ] **Step 4: Run tests — expect PASS**

```bash
npm run test:run -- tests/onboarding/state-machine.test.ts
```

Expected: all tests PASS (including the 3 new ones and all existing ones).

- [ ] **Step 5: Commit**

```bash
git add lib/onboarding/state-machine.ts tests/onboarding/state-machine.test.ts
git commit -m "fix: SUMMARY prompt uses plain-text format with interpolated draft values"
```

---

## Task 4: Update /api/onboard Route

**Files:**
- Modify: `app/api/onboard/route.ts`

Add an early-return branch for `PLAN_GENERATION` at the top of the POST handler, **before** the `streamText` block. This branch returns its own response immediately — the existing `streamText` + `onFinish` code is never reached for this state.

- [ ] **Step 1: Add the import**

At the top of `app/api/onboard/route.ts`, add this import after the existing imports:

```typescript
import { generatePlan } from '@/lib/plan/generator'
```

- [ ] **Step 2: Add the PLAN_GENERATION early-return branch**

In the POST handler, locate the comment `// 6. Stream response`. Insert the following block **immediately before** that comment:

```typescript
  // PLAN_GENERATION: skip streamText entirely — generate plan, insert, stream canned messages
  if (currentState === 'PLAN_GENERATION') {
    const planStream = createUIMessageStream({
      execute: async ({ writer }) => {
        const id1 = crypto.randomUUID()
        writer.write({ type: 'text-start', id: id1 })
        writer.write({ type: 'text-delta', id: id1, delta: 'One moment, building your plan...' })
        writer.write({ type: 'text-end', id: id1 })

        let plan
        try {
          plan = await generatePlan(profile, provider)
        } catch {
          const id2 = crypto.randomUUID()
          writer.write({ type: 'text-start', id: id2 })
          writer.write({ type: 'text-delta', id: id2, delta: 'Something went wrong building your plan. Please try again.' })
          writer.write({ type: 'text-end', id: id2 })
          return
        }

        try {
          const { error } = await supabase
            .from('workouts')
            .insert({ user_id: user.id, plan_data: plan, status: 'active' })
          if (error) throw new Error(error.message)
        } catch {
          const id2 = crypto.randomUUID()
          writer.write({ type: 'text-start', id: id2 })
          writer.write({ type: 'text-delta', id: id2, delta: 'Something went wrong saving your plan. Please try again.' })
          writer.write({ type: 'text-end', id: id2 })
          return
        }

        await updateProfile(user.id, {
          onboarding_state: 'COMPLETE',
          onboarding_complete: true,
        })

        const id2 = crypto.randomUUID()
        writer.write({ type: 'text-start', id: id2 })
        writer.write({ type: 'text-delta', id: id2, delta: 'Your plan is ready!' })
        writer.write({ type: 'text-end', id: id2 })
      },
    })
    return createUIMessageStreamResponse({ stream: planStream })
  }
```

- [ ] **Step 3: Verify the existing onFinish still handles other states correctly**

No change needed to the existing `streamText` block. The `onFinish` callback checks `currentState === 'PLAN_GENERATION'` at lines 141–146 — that code is now unreachable for `PLAN_GENERATION` because the early return above fires first. It remains harmless for other states.

- [ ] **Step 4: Commit**

```bash
git add app/api/onboard/route.ts
git commit -m "feat: implement plan generation in PLAN_GENERATION onboarding state"
```

---

## Task 5: OnboardingChat — "View Plan" Button

**Files:**
- Modify: `app/dashboard/chat/OnboardingChat.tsx`

After each render, check the last assistant message for "Your plan is ready!". If found, render a button below the messages list.

- [ ] **Step 1: Add the plan-ready detection and button**

Open `app/dashboard/chat/OnboardingChat.tsx`. After the `const isLoading = ...` line, add:

```typescript
  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const lastText =
    lastAssistant?.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('') ?? ''
  const planReady = lastText.includes('Your plan is ready!')
```

Then, inside the outer `<div className="flex flex-col h-full">`, add this block immediately after the messages scroll container (after the closing `</div>` of the `flex-1 overflow-y-auto` div, before the `<form>`):

```tsx
      {planReady && (
        <div className="py-3 flex justify-center">
          <a
            href="/dashboard/plan"
            className="bg-black text-white rounded-xl px-6 py-2 text-sm hover:bg-gray-800"
          >
            View your plan →
          </a>
        </div>
      )}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/chat/OnboardingChat.tsx
git commit -m "feat: show view-plan button after plan generation completes"
```

---

## Task 6: Plan Display Page

**Files:**
- Create: `app/dashboard/plan/page.tsx`

Server component. Auth check → fetch active workout → render or redirect.

- [ ] **Step 1: Create the page**

Create `app/dashboard/plan/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { WorkoutPlan } from '@/lib/plan/types'

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: workout } = await supabase
    .from('workouts')
    .select('plan_data')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (!workout) redirect('/dashboard/chat')

  let plan: WorkoutPlan
  try {
    const data = workout.plan_data as unknown
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray((data as WorkoutPlan).schedule) ||
      typeof (data as WorkoutPlan).diet !== 'object'
    ) {
      throw new Error('Malformed plan data')
    }
    plan = data as WorkoutPlan
  } catch {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">
          Your plan data looks corrupted.{' '}
          <a href="/dashboard/chat" className="underline">
            Regenerate your plan
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{plan.program_name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {plan.weeks} weeks · {plan.schedule.length} training days/week
          </p>
        </div>

        {/* Diet targets */}
        <div className="grid grid-cols-4 gap-3">
          {(
            [
              { label: 'Calories', value: String(plan.diet.daily_calories) },
              { label: 'Protein', value: `${plan.diet.protein_g}g` },
              { label: 'Carbs', value: `${plan.diet.carbs_g}g` },
              { label: 'Fat', value: `${plan.diet.fat_g}g` },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} className="border rounded-xl p-3 text-center">
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          {plan.schedule.map((day, i) => (
            <div key={i} className="border rounded-xl p-4">
              <h2 className="font-semibold mb-3">{day.day_label}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-left text-xs">
                    <th className="pb-2 font-normal">Exercise</th>
                    <th className="pb-2 font-normal">Sets</th>
                    <th className="pb-2 font-normal">Reps</th>
                    <th className="pb-2 font-normal">Rest</th>
                  </tr>
                </thead>
                <tbody>
                  {day.exercises.map((ex, j) => (
                    <tr key={j} className="border-t">
                      <td className="py-1.5 pr-4">{ex.name}</td>
                      <td className="py-1.5">{ex.sets}</td>
                      <td className="py-1.5">{ex.reps}</td>
                      <td className="py-1.5">{ex.rest_seconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Notes */}
        {plan.notes && (
          <div className="border rounded-xl p-4">
            <h2 className="font-semibold mb-1 text-sm">Notes</h2>
            <p className="text-sm text-gray-700">{plan.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add app/dashboard/plan/page.tsx
git commit -m "feat: add plan display page"
```

---

## Task 7: Build + Smoke Test

- [ ] **Step 1: Run all unit tests**

```bash
cd noxcuses
npm run test:run
```

Expected: all tests pass (state machine, safety agent, AI provider, generator — 20+ tests).

- [ ] **Step 2: TypeScript build check**

```bash
npm run build
```

Expected: 0 errors, clean output.

- [ ] **Step 3: Start dev server**

```bash
npm run dev
```

Make sure `noxcuses/.env.local` has `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` set.

- [ ] **Step 4: Smoke test — SUMMARY format**

1. Create a new account (or reset `onboarding_state` to `WELCOME` in Supabase for an existing user)
2. Complete all questions up to the confirmation step
3. Verify the SUMMARY response shows plain text like:
   ```
   Age: 18 or older
   Goal: Muscle gain
   ...
   ```
   — no `**bold**`, no `- bullets`

- [ ] **Step 5: Smoke test — plan generation**

1. Confirm the summary ("looks good")
2. The next response should say "One moment, building your plan..."
3. After ~10 seconds: "Your plan is ready!"
4. A "View your plan →" button appears below the message
5. Click it — lands on `/dashboard/plan` with the full program rendered

- [ ] **Step 6: Smoke test — plan page redirect**

1. Log in with a brand-new account (no plan yet)
2. Navigate directly to `/dashboard/plan`
3. Expected: redirect to `/dashboard/chat` (onboarding starts)

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "chore: onboarding fixes and plan generation verified"
```
