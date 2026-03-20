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
