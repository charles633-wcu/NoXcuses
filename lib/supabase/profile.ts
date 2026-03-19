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
