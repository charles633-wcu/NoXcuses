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
import { generatePlan } from '@/lib/plan/generator'

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
