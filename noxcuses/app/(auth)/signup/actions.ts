'use server'

import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export async function signup(formData: FormData) {
  const supabase = await createClient()

  const { error } = await supabase.auth.signUp({
    email: formData.get('email') as string,
    password: formData.get('password') as string,
  })

  if (error) redirect(`/signup?error=${encodeURIComponent(error.message)}`)

  redirect('/login?success=Account+created%2C+please+log+in')
}
