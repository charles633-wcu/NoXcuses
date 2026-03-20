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
