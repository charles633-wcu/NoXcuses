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
