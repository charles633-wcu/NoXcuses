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
