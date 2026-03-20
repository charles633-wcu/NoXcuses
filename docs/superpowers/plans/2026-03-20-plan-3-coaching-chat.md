# Plan 3 — Coaching Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the CoachingChat "coming soon" placeholder with a working stateless AI coaching chat that injects full user profile + workout plan context on every request.

**Architecture:** Four new/modified files — `lib/coaching/prompts.ts` (static persona string), `lib/coaching/context.ts` (pure context builder function), `app/api/chat/route.ts` (stateless POST handler), `app/dashboard/chat/CoachingChat.tsx` (UI replacing placeholder). No message persistence — history is client-side only.

**Tech Stack:** Next.js 16 App Router, Vercel AI SDK v6 (`ai`, `@ai-sdk/react`, `@ai-sdk/openai`), Supabase JS v2, Vitest, TypeScript 5

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `noxcuses/lib/coaching/prompts.ts` | Create | Static `COACH_PERSONA` string constant |
| `noxcuses/lib/coaching/context.ts` | Create | `buildCoachingContext(profile, plan)` pure function |
| `noxcuses/tests/coaching/context.test.ts` | Create | Unit tests for context builder |
| `noxcuses/app/api/chat/route.ts` | Create | Stateless POST handler — auth, fetch, build context, stream |
| `noxcuses/app/dashboard/chat/CoachingChat.tsx` | Modify | Replace "coming soon" with working chat UI |

**Key references (read before implementing):**
- `noxcuses/app/api/onboard/route.ts` — existing route pattern (`createOpenAI`, `convertToModelMessages`, auth pattern)
- `noxcuses/app/dashboard/chat/OnboardingChat.tsx` — existing UI pattern (`useChat`, `DefaultChatTransport`, `INITIAL_MESSAGES`, message bubble rendering)
- `noxcuses/lib/supabase/profile.ts` — `Profile` type and `getOrCreateProfile`
- `noxcuses/lib/plan/types.ts` — `WorkoutPlan` interface

---

## Task 1: Coach Persona Constant

**Files:**
- Create: `noxcuses/lib/coaching/prompts.ts`

No test needed — it's a plain string constant with no logic.

- [ ] **Step 1: Create `noxcuses/lib/coaching/prompts.ts`**

```typescript
export const COACH_PERSONA = `You are NoXcuses, a science-based bodybuilding and fitness coach.

Tone: Direct, encouraging, and evidence-based. Be concise — give clear, actionable answers.

Scope: You help with workout programming, nutrition, sleep, and recovery. You answer broad fitness questions using the user's profile and current plan as context.

Do NOT: Diagnose injuries, provide medical advice, or recommend supplements without context. If a user describes a potential injury, advise them to consult a medical professional.`
```

- [ ] **Step 2: Verify it compiles**

```bash
cd noxcuses && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add noxcuses/lib/coaching/prompts.ts
git commit -m "feat: add COACH_PERSONA constant"
```

---

## Task 2: Context Builder (TDD)

**Files:**
- Create: `noxcuses/lib/coaching/context.ts`
- Create: `noxcuses/tests/coaching/context.test.ts`

`buildCoachingContext(profile, plan)` is a pure function — no async, no external calls. Test it thoroughly before implementing.

- [ ] **Step 1: Write the failing tests**

Create `noxcuses/tests/coaching/context.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { buildCoachingContext } from '@/lib/coaching/context'
import type { WorkoutPlan } from '@/lib/plan/types'

const VALID_PLAN: WorkoutPlan = {
  program_name: '4-Day Upper/Lower',
  weeks: 8,
  schedule: [
    {
      day_label: 'Day 1 – Upper Push',
      exercises: [{ name: 'Bench Press', sets: 4, reps: '6-8', rest_seconds: 180 }],
    },
  ],
  diet: { daily_calories: 2800, protein_g: 180, carbs_g: 320, fat_g: 80 },
  notes: 'Add 2.5kg/week on compounds',
}

describe('buildCoachingContext', () => {
  it('includes COACH_PERSONA text', () => {
    const result = buildCoachingContext({}, null)
    expect(result).toContain('NoXcuses')
  })

  it('renders profile fields with label maps', () => {
    const result = buildCoachingContext(
      { goal: 'muscle_gain', sex: 'male', training_age: 'over_2yr' },
      null
    )
    expect(result).toContain('Muscle gain')
    expect(result).toContain('Male')
    expect(result).toContain('Over 2 years')
  })

  it('renders "Not provided" for missing optional fields', () => {
    const result = buildCoachingContext({}, null)
    expect(result).toContain('Not provided')
  })

  it('renders "None" for null limitations', () => {
    const result = buildCoachingContext({ limitations: null }, null)
    expect(result).toContain('Limitations: None')
  })

  it('renders "None" for undefined limitations', () => {
    const result = buildCoachingContext({ limitations: undefined }, null)
    expect(result).toContain('Limitations: None')
  })

  it('renders no-plan message when plan is null', () => {
    const result = buildCoachingContext({}, null)
    expect(result).toContain('User has not yet generated a workout plan.')
  })

  it('renders plan name and weeks when plan is provided', () => {
    const result = buildCoachingContext({}, VALID_PLAN)
    expect(result).toContain('4-Day Upper/Lower')
    expect(result).toContain('8 weeks')
  })

  it('renders day labels and exercise details when plan is provided', () => {
    const result = buildCoachingContext({}, VALID_PLAN)
    expect(result).toContain('Day 1 – Upper Push')
    expect(result).toContain('Bench Press')
    expect(result).toContain('4 sets × 6-8 reps')
    expect(result).toContain('180s rest')
  })

  it('renders diet targets when plan is provided', () => {
    const result = buildCoachingContext({}, VALID_PLAN)
    expect(result).toContain('2800 kcal')
    expect(result).toContain('Protein: 180g')
    expect(result).toContain('Carbs: 320g')
    expect(result).toContain('Fat: 80g')
  })

  it('renders notes when plan is provided', () => {
    const result = buildCoachingContext({}, VALID_PLAN)
    expect(result).toContain('Add 2.5kg/week on compounds')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
cd noxcuses && npm run test:run -- tests/coaching/context.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/coaching/context'`

- [ ] **Step 3: Implement `noxcuses/lib/coaching/context.ts`**

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

const GOAL_LABEL: Record<string, string> = {
  muscle_gain: 'Muscle gain',
  fat_loss: 'Fat loss',
  recomposition: 'Recomposition',
  general_fitness: 'General fitness',
}

const AGE_LABEL: Record<string, string> = {
  '16_17': '16–17',
  '18_plus': '18+',
}

const SEX_LABEL: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
}

const TRAINING_LABEL: Record<string, string> = {
  none: 'Beginner (no experience)',
  under_6mo: 'Under 6 months',
  '6mo_2yr': '6–24 months',
  over_2yr: 'Over 2 years',
}

const EQUIPMENT_LABEL: Record<string, string> = {
  full_gym: 'Full gym',
  dumbbells: 'Dumbbells only',
  home: 'Home gym',
  bodyweight: 'Bodyweight only',
}

export function buildCoachingContext(
  profile: CoachingProfile,
  plan: WorkoutPlan | null
): string {
  const profileBlock = [
    'User Profile:',
    `- Goal: ${GOAL_LABEL[profile.goal ?? ''] ?? 'Not provided'}`,
    `- Age: ${AGE_LABEL[profile.age_bracket ?? ''] ?? 'Not provided'}`,
    `- Sex: ${SEX_LABEL[profile.sex ?? ''] ?? 'Not provided'}`,
    profile.height_cm && profile.weight_kg
      ? `- Height / Weight: ${profile.height_cm}cm / ${profile.weight_kg}kg`
      : '- Height / Weight: Not provided',
    `- Experience: ${TRAINING_LABEL[profile.training_age ?? ''] ?? 'Not provided'}`,
    `- Equipment: ${EQUIPMENT_LABEL[profile.equipment ?? ''] ?? 'Not provided'}`,
    `- Schedule: ${profile.days_per_week ? `${profile.days_per_week} days/week` : 'Not provided'}`,
    `- Limitations: ${profile.limitations ?? 'None'}`,
  ].join('\n')

  let planBlock: string
  if (!plan) {
    planBlock = 'Current Workout Plan: User has not yet generated a workout plan.'
  } else {
    const dayLines = plan.schedule
      .map((day) => {
        const exercises = day.exercises
          .map((e) => `  - ${e.name}: ${e.sets} sets × ${e.reps} reps, ${e.rest_seconds}s rest`)
          .join('\n')
        return `${day.day_label}:\n${exercises}`
      })
      .join('\n\n')

    planBlock = [
      `Current Workout Plan: ${plan.program_name} (${plan.weeks} weeks)`,
      '',
      dayLines,
      '',
      `Diet Targets: ${plan.diet.daily_calories} kcal | Protein: ${plan.diet.protein_g}g | Carbs: ${plan.diet.carbs_g}g | Fat: ${plan.diet.fat_g}g`,
      '',
      `Notes: ${plan.notes}`,
    ].join('\n')
  }

  return [COACH_PERSONA, '', profileBlock, '', planBlock].join('\n')
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd noxcuses && npm run test:run -- tests/coaching/context.test.ts
```

Expected: 10 tests PASS

- [ ] **Step 5: Run full test suite to verify no regressions**

```bash
cd noxcuses && npm run test:run
```

Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add noxcuses/lib/coaching/context.ts noxcuses/tests/coaching/context.test.ts
git commit -m "feat: add buildCoachingContext with TDD"
```

---

## Task 3: `/api/chat` Route

**Files:**
- Create: `noxcuses/app/api/chat/route.ts`

No unit test — this is a Next.js route that uses Supabase and AI SDK together. Verify with TypeScript check + manual smoke test after CoachingChat is wired up.

Key patterns to follow from `noxcuses/app/api/onboard/route.ts`:
- `createOpenAI({ apiKey: process.env.OPENAI_API_KEY })` — name the instance `openaiProvider` (not `openai`) to avoid shadowing the import
- Auth: `supabase.auth.getUser()` → 401 if no user
- `convertToModelMessages` is **async** — always `await` it
- `streamText` + `.toUIMessageStreamResponse()` — use for simple stateless streaming (no `onFinish` needed here)

Supabase JSONB note: `plan_data` is automatically parsed by Supabase JS — cast directly as `WorkoutPlan`, do NOT call `JSON.parse()` on it.

- [ ] **Step 1: Create `noxcuses/app/api/chat/route.ts`**

```typescript
import { streamText, convertToModelMessages } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { buildCoachingContext } from '@/lib/coaching/context'
import type { WorkoutPlan } from '@/lib/plan/types'

const openaiProvider = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })

export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Parse request
  const { messages } = await req.json()

  // 3. Fetch profile — Profile satisfies CoachingProfile structurally, pass directly
  let profile
  try {
    profile = await getOrCreateProfile(user.id)
  } catch {
    return new Response('Failed to load profile', { status: 500 })
  }

  // 4. Fetch most recent active workout
  // plan_data is JSONB — Supabase auto-parses it, cast directly, do NOT JSON.parse
  const { data: workoutRow } = await supabase
    .from('workouts')
    .select('plan_data')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  const plan = workoutRow ? (workoutRow.plan_data as WorkoutPlan) : null

  // 5. Build context and stream
  const context = buildCoachingContext(profile, plan)

  const result = streamText({
    model: openaiProvider('gpt-4o'),
    system: context,
    messages: await convertToModelMessages(messages),
  })

  return result.toUIMessageStreamResponse()
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd noxcuses && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add noxcuses/app/api/chat/route.ts
git commit -m "feat: add /api/chat stateless coaching route"
```

---

## Task 4: CoachingChat UI

**Files:**
- Modify: `noxcuses/app/dashboard/chat/CoachingChat.tsx`

Replace the "coming soon" placeholder entirely. Mirror the `OnboardingChat.tsx` pattern exactly — same layout, same bubble styling, same `useChat` + `DefaultChatTransport` wiring. Add `INITIAL_MESSAGES` with the welcome message.

No unit test — UI component. Verified via `tsc --noEmit` + manual browser check.

- [ ] **Step 1: Replace `noxcuses/app/dashboard/chat/CoachingChat.tsx`**

```typescript
'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

const INITIAL_MESSAGES: UIMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    parts: [{ type: 'text', text: "Hey! I'm your NoXcuses coach. How can I help you today?" }],
  },
]

export default function CoachingChat() {
  const [input, setInput] = useState('')

  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/chat' }),
    messages: INITIAL_MESSAGES,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                m.role === 'user'
                  ? 'bg-black text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}
            >
              {m.parts
                .filter((p) => p.type === 'text')
                .map((p, i) => (
                  <span key={i}>{(p as { type: 'text'; text: string }).text}</span>
                ))}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-black text-white rounded-xl px-5 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd noxcuses && npx tsc --noEmit
```

Expected: no errors.

- [ ] **Step 3: Run full test suite**

```bash
cd noxcuses && npm run test:run
```

Expected: all tests PASS (no regressions).

- [ ] **Step 4: Commit**

```bash
git add noxcuses/app/dashboard/chat/CoachingChat.tsx
git commit -m "feat: replace CoachingChat placeholder with working chat UI"
```

---

## Verification Checklist

After all tasks are complete:

- [ ] `npm run test:run` — all tests pass (at minimum 10 new context tests)
- [ ] `npx tsc --noEmit` — no TypeScript errors
- [ ] `npm run build` — production build succeeds
- [ ] Manual: visit `/dashboard/chat` after onboarding — see welcome message "Hey! I'm your NoXcuses coach..."
- [ ] Manual: send a message — coach responds with knowledge of your profile and plan
- [ ] Manual: visit `/dashboard/chat` before onboarding completes — coach responds without plan context (no crash)
