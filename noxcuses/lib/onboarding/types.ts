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
