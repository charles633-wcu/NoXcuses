import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  return (
    <div className="min-h-screen flex">
      <aside className="w-48 border-r p-4 flex flex-col gap-2">
        <span className="font-bold text-lg mb-4">NoXcuses</span>
        <a href="/dashboard/chat" className="hover:underline">Chat</a>
        <a href="/dashboard/plan" className="hover:underline">My Plan</a>
        <a href="/dashboard/chat?intent=log" className="hover:underline">Log Workout</a>
        <a href="/dashboard/progress" className="hover:underline">Progress</a>
        <a href="/dashboard/nutrition" className="hover:underline">Nutrition</a>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  )
}
