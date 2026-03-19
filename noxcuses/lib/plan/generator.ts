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
