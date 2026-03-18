# Onboarding Chat Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the full onboarding chat flow — state machine, `/api/onboard` streaming route, and the chat UI — so a new user can sign up, answer guided questions, and have their profile saved, completing onboarding end-to-end.

**Architecture:** The onboarding flow is a guardrailed chat driven by a state machine. Each user message hits `POST /api/onboard`, which runs a safety check, then calls the LLM with a state-specific system prompt using `streamText`. On stream finish, a quick extraction call saves the collected profile field to Supabase and advances `onboarding_state`. The client uses `useChat` from `@ai-sdk/react`. When `onboarding_complete = true`, the dashboard chat page shows the coaching placeholder.

**Tech Stack:** Next.js 14 App Router, Vercel AI SDK (`ai` v6, `@ai-sdk/openai`, `@ai-sdk/react`), `useChat`, `streamText`, `createUIMessageStream`, `convertToModelMessages`, Supabase JS v2, TypeScript 5, Vitest

**API notes (ai v6) — read carefully before implementing:**
- `createUIMessageStream` execute receives `{ writer }` (object), NOT `writer` directly — always destructure: `execute: async ({ writer }) => { ... }`
- Fixed/canned responses: `writer.write({ type: 'text-start', id })` then `writer.write({ type: 'text-delta', id, delta: text })` then `writer.write({ type: 'text-end', id })`
- Streaming LLM responses: `writer.merge(result.toUIMessageStream())` inside execute
- `convertToModelMessages` is **async** — always `await` it before passing to `streamText`
- `UIMessage` has NO `content` field — text lives in `parts` as `{ type: 'text', text: string }`
- To extract user text from a message: filter `parts` by `type === 'text'` and join `.text` values
- `useChat` option is `messages` (not `initialMessages`) for setting initial messages
- `useChat` returns `sendMessage({ text })` (not `handleSubmit`/`handleInputChange`) — manage `input` state manually with `useState`
- `useChat` is imported from `@ai-sdk/react`, NOT `ai/react`

---

## File Map

```
noxcuses/
├── app/
│   ├── api/
│   │   └── onboard/
│   │       └── route.ts              # POST /api/onboard — streaming onboarding handler
│   └── dashboard/
│       ├── chat/
│       │   ├── page.tsx              # Server component: routes to onboarding or coaching
│       │   ├── OnboardingChat.tsx    # Client component: useChat → /api/onboard
│       │   └── CoachingChat.tsx      # Client component: placeholder for Plan 4
│       └── layout.tsx                # Modify: h-screen + overflow-hidden for full-height chat
├── lib/
│   ├── onboarding/
│   │   ├── types.ts                  # OnboardingState type, ProfileDraft interface
│   │   └── state-machine.ts          # nextState(), systemPromptForState(), extractAgeBracket()
│   └── supabase/
│       └── profile.ts                # getOrCreateProfile(), updateProfile()
└── tests/
    └── onboarding/
        └── state-machine.test.ts     # Unit tests for state machine (no LLM)
```

---

## Task 1: Install AI SDK Packages

**Files:**
- Modify: `package.json` (via npm install)

Two packages are needed: `@ai-sdk/openai` for the LLM model, `@ai-sdk/react` for the `useChat` hook.

- [ ] **Step 1: Install**

```bash
cd noxcuses
npm install @ai-sdk/openai @ai-sdk/react
```

Expected: installs cleanly, no vulnerabilities.

- [ ] **Step 2: Commit**

```bash
git add package.json package-lock.json
git commit -m "feat: add @ai-sdk/openai and @ai-sdk/react"
```

---

## Task 2: Onboarding State Machine (TDD)

**Files:**
- Create: `lib/onboarding/types.ts`
- Create: `lib/onboarding/state-machine.ts`
- Create: `tests/onboarding/state-machine.test.ts`

The state machine is **pure TypeScript** — no LLM calls, no database, fully testable. It knows:
1. The linear progression of states
2. The system prompt to use for each state
3. How to deterministically detect `under_16` from a string value

- [ ] **Step 1: Write failing tests**

Create `tests/onboarding/state-machine.test.ts`:
```typescript
import { describe, it, expect } from 'vitest'
import {
  nextState,
  systemPromptForState,
  extractAgeBracket,
  ORDERED_STATES,
} from '@/lib/onboarding/state-machine'
import type { OnboardingState } from '@/lib/onboarding/types'

describe('ORDERED_STATES', () => {
  it('starts with WELCOME and ends with COMPLETE', () => {
    expect(ORDERED_STATES[0]).toBe('WELCOME')
    expect(ORDERED_STATES[ORDERED_STATES.length - 1]).toBe('COMPLETE')
  })

  it('contains all 13 required states', () => {
    expect(ORDERED_STATES).toHaveLength(13)
  })
})

describe('nextState', () => {
  it('WELCOME → AGE_BRACKET', () => {
    expect(nextState('WELCOME')).toBe('AGE_BRACKET')
  })

  it('AGE_BRACKET → GOAL', () => {
    expect(nextState('AGE_BRACKET')).toBe('GOAL')
  })

  it('PHOTO_OFFER → SUMMARY', () => {
    expect(nextState('PHOTO_OFFER')).toBe('SUMMARY')
  })

  it('SUMMARY → PLAN_GENERATION', () => {
    expect(nextState('SUMMARY')).toBe('PLAN_GENERATION')
  })

  it('PLAN_GENERATION → COMPLETE', () => {
    expect(nextState('PLAN_GENERATION')).toBe('COMPLETE')
  })

  it('COMPLETE returns COMPLETE (no-op)', () => {
    expect(nextState('COMPLETE')).toBe('COMPLETE')
  })
})

describe('systemPromptForState', () => {
  it('returns a non-empty string for every state', () => {
    const states: OnboardingState[] = [
      'WELCOME', 'AGE_BRACKET', 'GOAL', 'SEX', 'HEIGHT_WEIGHT',
      'TRAINING_AGE', 'EQUIPMENT', 'SCHEDULE', 'LIMITATIONS',
      'PHOTO_OFFER', 'SUMMARY', 'PLAN_GENERATION', 'COMPLETE',
    ]
    states.forEach(state => {
      const prompt = systemPromptForState(state, {})
      expect(typeof prompt).toBe('string')
      expect(prompt.length).toBeGreaterThan(20)
    })
  })

  it('WELCOME prompt mentions coaching or fitness', () => {
    const prompt = systemPromptForState('WELCOME', {})
    expect(prompt.toLowerCase()).toMatch(/coach|bodybuilding|fitness/)
  })

  it('AGE_BRACKET prompt mentions age', () => {
    const prompt = systemPromptForState('AGE_BRACKET', {})
    expect(prompt.toLowerCase()).toContain('age')
  })
})

describe('extractAgeBracket', () => {
  it('returns under_16 for "under_16"', () => {
    expect(extractAgeBracket('under_16')).toBe('under_16')
  })

  it('returns 16_17 for "16_17"', () => {
    expect(extractAgeBracket('16_17')).toBe('16_17')
  })

  it('returns 18_plus for "18_plus"', () => {
    expect(extractAgeBracket('18_plus')).toBe('18_plus')
  })

  it('returns null for unrecognized input', () => {
    expect(extractAgeBracket('maybe')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test — expect FAIL**

```bash
npm run test:run -- tests/onboarding/state-machine.test.ts
```

Expected: FAIL — `Cannot find module '@/lib/onboarding/state-machine'`

- [ ] **Step 3: Create types**

Create `lib/onboarding/types.ts`:
```typescript
export type OnboardingState =
  | 'WELCOME'
  | 'AGE_BRACKET'
  | 'GOAL'
  | 'SEX'
  | 'HEIGHT_WEIGHT'
  | 'TRAINING_AGE'
  | 'EQUIPMENT'
  | 'SCHEDULE'
  | 'LIMITATIONS'
  | 'PHOTO_OFFER'
  | 'SUMMARY'
  | 'PLAN_GENERATION'
  | 'COMPLETE'

export interface ProfileDraft {
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

// Minimal type for UIMessage parts (avoids importing from ai in shared types)
export type UIMessagePart = { type: string; [key: string]: unknown }
```

- [ ] **Step 4: Implement state machine**

Create `lib/onboarding/state-machine.ts`:
```typescript
import type { OnboardingState, ProfileDraft } from './types'

export const ORDERED_STATES: OnboardingState[] = [
  'WELCOME',
  'AGE_BRACKET',
  'GOAL',
  'SEX',
  'HEIGHT_WEIGHT',
  'TRAINING_AGE',
  'EQUIPMENT',
  'SCHEDULE',
  'LIMITATIONS',
  'PHOTO_OFFER',
  'SUMMARY',
  'PLAN_GENERATION',
  'COMPLETE',
]

export function nextState(current: OnboardingState): OnboardingState {
  const idx = ORDERED_STATES.indexOf(current)
  if (idx === -1 || idx === ORDERED_STATES.length - 1) return 'COMPLETE'
  return ORDERED_STATES[idx + 1]
}

export function extractAgeBracket(value: string): 'under_16' | '16_17' | '18_plus' | null {
  if (value === 'under_16') return 'under_16'
  if (value === '16_17') return '16_17'
  if (value === '18_plus') return '18_plus'
  return null
}

export function systemPromptForState(state: OnboardingState, draft: ProfileDraft): string {
  const base = `You are NoXcuses, a friendly science-based bodybuilding coach. You are onboarding a new user.
Keep responses short (2-4 sentences). Be warm and encouraging.
Do not give workout advice yet — you are still gathering information.
If the user goes off-topic, gently redirect them back to the question at hand.`

  const statePrompts: Record<OnboardingState, string> = {
    WELCOME: `${base}

Introduce yourself briefly and ask the user their age bracket.
Present exactly three options: Under 16 / 16–17 / 18 or older.`,

    AGE_BRACKET: `${base}

You are confirming the user's age bracket.
If the user says they are under 16, respond ONLY with:
"This app is designed for users 16 and older. We hope to see you back soon!"
Otherwise, acknowledge their age and ask about their primary fitness goal.`,

    GOAL: `${base}

Ask the user about their primary fitness goal. Options:
- Muscle gain (build size and strength)
- Fat loss (lose weight while preserving muscle)
- Body recomposition (lose fat and gain muscle simultaneously)
- General fitness (get healthier and more active)
Acknowledge their response warmly.`,

    SEX: `${base}

Ask the user their biological sex for accurate calorie and program calculations.
Options: male, female, or prefer not to say.
Explain briefly that it affects hormonal training response.`,

    HEIGHT_WEIGHT: `${base}

Ask the user their height and current weight.
Accept metric (cm, kg) or imperial (ft/in, lbs) — note that you'll convert to metric.
If values seem outside normal range (height 100–250cm, weight 30–300kg), ask to confirm.`,

    TRAINING_AGE: `${base}

Ask how long they have been training consistently with a structured program. Options:
- Never trained before
- Less than 6 months
- 6 months to 2 years
- More than 2 years
Reassure them that all levels are welcome.`,

    EQUIPMENT: `${base}

Ask what equipment they have access to. Options:
- Full gym (barbells, cables, machines)
- Dumbbells only
- Home gym (mixed equipment)
- Bodyweight only (no equipment)`,

    SCHEDULE: `${base}

Ask how many days per week they can commit to training.
Valid: 1–7 days. Suggest 3–4 for beginners.
Be realistic — consistency beats perfection.`,

    LIMITATIONS: `${base}

Ask if they have any injuries or physical limitations to work around.
Remind them this is NOT a medical question — just movements to avoid.
This is optional — if they have none, that's great.`,

    PHOTO_OFFER: `${base}

Offer to let the user upload a baseline progress photo.
Photos are private, never shared, and help track visual progress.
Make clear this is completely optional.`,

    SUMMARY: `${base}

Present a clear summary of everything collected:
age bracket, goal, sex, height and weight, training experience, equipment, schedule, and limitations.
Ask them to confirm everything looks right before you generate their plan.`,

    PLAN_GENERATION: `${base}

The user has confirmed their information.
Tell them: "Perfect! I'm building your personalized training plan now. This usually takes about 30 seconds."
Be enthusiastic — this is a big moment.`,

    COMPLETE: `${base}

Onboarding is complete. Welcome the user to their dashboard and let them know their plan is ready.`,
  }

  return statePrompts[state] ?? base
}
```

- [ ] **Step 5: Run tests — expect PASS**

```bash
npm run test:run -- tests/onboarding/state-machine.test.ts
```

Expected: all tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/onboarding/ tests/onboarding/
git commit -m "feat: add onboarding state machine with TDD"
```

---

## Task 3: Profile Helpers

**Files:**
- Create: `lib/supabase/profile.ts`

Thin wrappers around Supabase for profile read/write.

- [ ] **Step 1: Create profile helpers**

Create `lib/supabase/profile.ts`:
```typescript
import { createClient } from '@/lib/supabase/server'
import type { OnboardingState, ProfileDraft } from '@/lib/onboarding/types'

export interface Profile extends ProfileDraft {
  id: string
  user_id: string
  onboarding_state: OnboardingState
  onboarding_complete: boolean
}

export async function getOrCreateProfile(userId: string): Promise<Profile> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from('profiles')
    .select('*')
    .eq('user_id', userId)
    .single()

  if (existing) return existing as Profile

  const { data: created, error } = await supabase
    .from('profiles')
    .insert({ user_id: userId, onboarding_state: 'WELCOME', onboarding_complete: false })
    .select()
    .single()

  if (error) throw new Error(`Failed to create profile: ${error.message}`)
  return created as Profile
}

export async function updateProfile(
  userId: string,
  update: Partial<ProfileDraft> & { onboarding_state?: OnboardingState; onboarding_complete?: boolean }
): Promise<void> {
  const supabase = await createClient()

  const { error } = await supabase
    .from('profiles')
    .update({ ...update, updated_at: new Date().toISOString() })
    .eq('user_id', userId)

  if (error) throw new Error(`Failed to update profile: ${error.message}`)
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/supabase/profile.ts
git commit -m "feat: add profile helpers for onboarding state persistence"
```

---

## Task 4: /api/onboard Route

**Files:**
- Create: `app/api/onboard/route.ts`

This is the core of the onboarding flow. It:
1. Authenticates the user
2. Fetches profile + current `onboarding_state` from DB
3. Runs the Safety agent on the last user message
4. For `WELCOME` and `AGE_BRACKET` states: checks if user indicated under-16 (deterministic LLM extraction)
5. Streams the LLM response using `streamText` + `createUIMessageStream`
6. On stream finish: makes a quick extraction call, saves field to profile, advances state

**Key `ai` v6 patterns used here:**
- `convertToModelMessages(messages)` — converts `useChat` UIMessages to `ModelMessage[]` for `streamText`
- `createUIMessageStream({ execute })` + `createUIMessageStreamResponse({ stream })` — wraps streaming
- `writer.merge(result.toUIMessageStream())` — pipes `streamText` output into the UI message stream
- For fixed/canned responses (safety veto, age gate): `writer.write({ type, id, delta })` manually

- [ ] **Step 1: Create the route**

Create `app/api/onboard/route.ts`:
```typescript
import {
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
} from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createClient } from '@/lib/supabase/server'
import { getOrCreateProfile, updateProfile } from '@/lib/supabase/profile'
import { SafetyAgent } from '@/lib/agents/safety'
import { getProvider } from '@/lib/ai/provider'
import {
  nextState,
  systemPromptForState,
} from '@/lib/onboarding/state-machine'
import type { OnboardingState, ProfileDraft, UIMessagePart } from '@/lib/onboarding/types'

const UNDER_16_MESSAGE =
  "This app is designed for users 16 and older. We hope to see you back soon!"

// Maps each onboarding state to the profile field it collects
const STATE_FIELD_MAP: Partial<Record<OnboardingState, keyof ProfileDraft>> = {
  AGE_BRACKET: 'age_bracket',
  GOAL: 'goal',
  SEX: 'sex',
  TRAINING_AGE: 'training_age',
  EQUIPMENT: 'equipment',
}

// Extracts plain text from a UIMessage's parts array
function textFromParts(parts: UIMessagePart[]): string {
  return parts
    .filter((p) => p.type === 'text')
    .map((p) => (p as { type: 'text'; text: string }).text)
    .join('')
}

// Returns an extraction prompt for the given state, or null if no extraction needed
function extractionPrompt(state: OnboardingState, text: string): string | null {
  const extractors: Partial<Record<OnboardingState, string>> = {
    AGE_BRACKET: `From this text, extract the age bracket. Respond ONLY with JSON: {"value": "under_16" | "16_17" | "18_plus" | null}\n\nText: ${text}`,
    GOAL: `From this text, extract the fitness goal. Respond ONLY with JSON: {"value": "muscle_gain" | "fat_loss" | "recomposition" | "general_fitness" | null}\n\nText: ${text}`,
    SEX: `From this text, extract the biological sex. Respond ONLY with JSON: {"value": "male" | "female" | "other" | null}\n\nText: ${text}`,
    HEIGHT_WEIGHT: `From this text, extract height in cm and weight in kg (convert imperial if needed). Respond ONLY with JSON: {"height_cm": number | null, "weight_kg": number | null}\n\nText: ${text}`,
    TRAINING_AGE: `From this text, extract training experience. Respond ONLY with JSON: {"value": "none" | "under_6mo" | "6mo_2yr" | "over_2yr" | null}\n\nText: ${text}`,
    EQUIPMENT: `From this text, extract equipment access. Respond ONLY with JSON: {"value": "full_gym" | "dumbbells" | "home" | "bodyweight" | null}\n\nText: ${text}`,
    SCHEDULE: `From this text, extract days per week (1-7). Respond ONLY with JSON: {"value": number | null}\n\nText: ${text}`,
    LIMITATIONS: `From this text, extract any physical limitations or injuries (max 500 chars). Respond ONLY with JSON: {"value": string | null}\n\nText: ${text}`,
  }
  return extractors[state] ?? null
}

// Returns a proper AI SDK streaming response with a fixed canned text.
// NOTE: execute receives { writer }, not writer directly.
function cannedResponse(text: string): Response {
  const stream = createUIMessageStream({
    execute: ({ writer }) => {
      const id = crypto.randomUUID()
      writer.write({ type: 'text-start', id })
      writer.write({ type: 'text-delta', id, delta: text })
      writer.write({ type: 'text-end', id })
    },
  })
  return createUIMessageStreamResponse({ stream })
}

export async function POST(req: Request) {
  // 1. Auth
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return new Response('Unauthorized', { status: 401 })

  // 2. Parse request
  // messages are UIMessage[] from useChat — text lives in parts, not content
  const { messages } = await req.json()
  const lastMsg = [...messages].reverse().find((m: { role: string }) => m.role === 'user') as
    | { role: string; parts: UIMessagePart[] }
    | undefined
  const lastUserMessage = lastMsg ? textFromParts(lastMsg.parts ?? []) : ''

  // 3. Safety check (pre-flight, no LLM streaming yet)
  const provider = getProvider()
  const safetyAgent = new SafetyAgent(provider)
  const safetyResult = await safetyAgent.check(lastUserMessage)
  if (!safetyResult.safe) {
    return cannedResponse(safetyResult.vetoMessage!)
  }

  // 4. Fetch current state
  const profile = await getOrCreateProfile(user.id)
  const currentState = profile.onboarding_state

  // 5. Age gate — deterministic check for WELCOME and AGE_BRACKET states
  if (currentState === 'WELCOME' || currentState === 'AGE_BRACKET') {
    const extraction = await provider.complete(
      [{ role: 'user', content: lastUserMessage }],
      {
        systemPrompt: `Does this message indicate the user is under 16 years old? Respond ONLY with exactly: yes or no`,
        temperature: 0,
        model: 'gpt-4o-mini',
      }
    )
    if (extraction.trim().toLowerCase() === 'yes') {
      return cannedResponse(UNDER_16_MESSAGE)
    }
  }

  // 6. Stream response
  // NOTE: convertToModelMessages is async — must await before passing to streamText
  const openaiModel = createOpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const modelMessages = await convertToModelMessages(messages)

  const stream = createUIMessageStream({
    // NOTE: execute receives { writer }, not writer directly
    execute: async ({ writer }) => {
      const result = streamText({
        model: openaiModel('gpt-4o'),
        system: systemPromptForState(currentState, profile),
        messages: modelMessages,
        onFinish: async ({ text }) => {
          try {
            const prompt = extractionPrompt(currentState, text)
            if (prompt) {
              const raw = await provider.complete(
                [{ role: 'user', content: prompt }],
                { temperature: 0, model: 'gpt-4o-mini' }
              )
              const parsed = JSON.parse(raw)
              const profileUpdate: Partial<ProfileDraft> = {}
              const field = STATE_FIELD_MAP[currentState]

              if (currentState === 'HEIGHT_WEIGHT') {
                if (parsed.height_cm) profileUpdate.height_cm = Number(parsed.height_cm)
                if (parsed.weight_kg) profileUpdate.weight_kg = Number(parsed.weight_kg)
              } else if (currentState === 'SCHEDULE') {
                if (parsed.value) profileUpdate.days_per_week = Number(parsed.value)
              } else if (field && parsed.value != null) {
                (profileUpdate as Record<string, unknown>)[field] = parsed.value
              }

              const isComplete = currentState === 'PLAN_GENERATION'
              await updateProfile(user.id, {
                ...profileUpdate,
                onboarding_state: nextState(currentState),
                ...(isComplete ? { onboarding_complete: true } : {}),
              })
            } else {
              // States with no field extraction (WELCOME, PHOTO_OFFER, SUMMARY, etc.) still advance
              const isComplete = currentState === 'PLAN_GENERATION'
              await updateProfile(user.id, {
                onboarding_state: nextState(currentState),
                ...(isComplete ? { onboarding_complete: true } : {}),
              })
            }
          } catch {
            // Extraction failure is non-fatal — still advance state
            await updateProfile(user.id, { onboarding_state: nextState(currentState) })
          }
        },
      })

      writer.merge(result.toUIMessageStream())
    },
  })

  return createUIMessageStreamResponse({ stream })
}
```

**Note:** `UIMessagePart` is defined in `lib/onboarding/types.ts` (already included in Task 2). No additional action needed.

- [ ] **Step 2: Commit**

```bash
git add app/api/onboard/
git commit -m "feat: add /api/onboard streaming route with state machine and safety"
```

---

## Task 5: Chat UI

**Files:**
- Create: `app/dashboard/chat/page.tsx`
- Create: `app/dashboard/chat/OnboardingChat.tsx`
- Create: `app/dashboard/chat/CoachingChat.tsx`
- Modify: `app/dashboard/layout.tsx`

- [ ] **Step 1: Create OnboardingChat**

Create `app/dashboard/chat/OnboardingChat.tsx`:
```typescript
'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'

const WELCOME_TEXT =
  "Hey! I'm your NoXcuses coach. I'm going to ask you a few questions to build your personalized training plan. Let's start — how old are you? (Under 16 / 16–17 / 18 or older)"

export default function OnboardingChat() {
  const [input, setInput] = useState('')

  // In ai v6, useChat uses sendMessage({ text }) — there is no handleSubmit/handleInputChange.
  // The 'messages' option sets initial messages. UIMessage has 'parts', not 'content'.
  const { messages, sendMessage, status } = useChat({
    api: '/api/onboard',
    messages: [
      {
        id: 'welcome',
        role: 'assistant' as const,
        parts: [{ type: 'text' as const, text: WELCOME_TEXT }],
      },
    ],
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

- [ ] **Step 2: Create CoachingChat placeholder**

Create `app/dashboard/chat/CoachingChat.tsx`:
```typescript
'use client'

export default function CoachingChat() {
  return (
    <div className="flex flex-col items-center justify-center h-full text-gray-500">
      <p className="text-lg font-medium">Your plan is ready!</p>
      <p className="text-sm mt-1">Coaching chat coming soon.</p>
    </div>
  )
}
```

- [ ] **Step 3: Create the chat page**

Create `app/dashboard/chat/page.tsx`:
```typescript
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { getOrCreateProfile } from '@/lib/supabase/profile'
import OnboardingChat from './OnboardingChat'
import CoachingChat from './CoachingChat'

export default async function ChatPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const profile = await getOrCreateProfile(user.id)

  if (!profile.onboarding_complete) {
    return (
      <div className="h-full flex flex-col">
        <div className="mb-4 shrink-0">
          <h2 className="text-lg font-semibold">Getting started</h2>
          <p className="text-sm text-gray-500">Answer a few questions to get your plan.</p>
        </div>
        <div className="flex-1 min-h-0">
          <OnboardingChat />
        </div>
      </div>
    )
  }

  return <CoachingChat />
}
```

- [ ] **Step 4: Update dashboard layout for full-height chat**

Read `app/dashboard/layout.tsx`, then make these two targeted changes:

Change the outer `<div>` from:
```
<div className="min-h-screen flex">
```
to:
```
<div className="h-screen flex overflow-hidden">
```

Change `<main>` from:
```
<main className="flex-1 p-6">{children}</main>
```
to:
```
<main className="flex-1 p-6 overflow-hidden flex flex-col">{children}</main>
```

- [ ] **Step 5: Commit**

```bash
git add app/dashboard/chat/ app/dashboard/layout.tsx
git commit -m "feat: add chat UI with onboarding and coaching views"
```

---

## Task 6: Build + Smoke Test

- [ ] **Step 1: Run all unit tests**

```bash
npm run test:run
```

Expected: all tests pass (10+ tests across safety, AIProvider, and state machine).

- [ ] **Step 2: Build**

```bash
npm run build
```

Expected: 0 TypeScript errors, clean build output.

- [ ] **Step 3: Start dev server and test full onboarding flow**

```bash
npm run dev
```

You need a valid `.env.local` with `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `OPENAI_API_KEY` set.

1. Go to `http://localhost:3000/signup` → create a new account
2. You should land at `/dashboard/chat` with the welcome message visible
3. Answer all questions — age, goal, sex, height/weight, training experience, equipment, schedule, limitations, photo offer
4. Coach shows summary → confirm it
5. Coach says "Building your plan..."
6. Reload `/dashboard/chat` → should show `CoachingChat` (onboarding complete)

Check Supabase Table Editor to confirm `profiles` row has all fields populated and `onboarding_complete = true`.

- [ ] **Step 4: Test age gate**

1. Create a new account (different email)
2. When the welcome message asks your age, respond "I'm 14" or "under 16"
3. Expected: coach replies ONLY with "This app is designed for users 16 and older..." — no further questions

- [ ] **Step 5: Test safety guard**

1. In the onboarding chat, type "I want to eat 500 calories a day"
2. Expected: safety veto message returned, no LLM response

- [ ] **Step 6: Final commit**

```bash
git add -A
git commit -m "chore: plan 2 complete — onboarding chat verified"
```

---

## What's Next

Plan 3 builds workout plan generation:
- Head Coach orchestration layer
- Exercise agent (with YouTube links from `exercises` table)
- Diet agent (macro targets)
- `POST /api/plan` route that generates and saves a `WorkoutPlan` to the `workouts` table
- Workout card component rendered inline in chat
