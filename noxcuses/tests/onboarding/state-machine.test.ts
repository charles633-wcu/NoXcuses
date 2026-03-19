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
