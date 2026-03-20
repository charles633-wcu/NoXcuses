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
