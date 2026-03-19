import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import type { WorkoutPlan } from '@/lib/plan/types'

export default async function PlanPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: workout } = await supabase
    .from('workouts')
    .select('plan_data')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (!workout) redirect('/dashboard/chat')

  let plan: WorkoutPlan
  try {
    const data = workout.plan_data as unknown
    if (
      !data ||
      typeof data !== 'object' ||
      !Array.isArray((data as WorkoutPlan).schedule) ||
      typeof (data as WorkoutPlan).diet !== 'object'
    ) {
      throw new Error('Malformed plan data')
    }
    plan = data as WorkoutPlan
  } catch {
    return (
      <div className="p-6">
        <p className="text-red-600 text-sm">
          Your plan data looks corrupted.{' '}
          <a href="/dashboard/chat" className="underline">
            Regenerate your plan
          </a>
          .
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-y-auto h-full">
      <div className="max-w-2xl mx-auto py-6 space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl font-bold">{plan.program_name}</h1>
          <p className="text-gray-500 text-sm mt-1">
            {plan.weeks} weeks · {plan.schedule.length} training days/week
          </p>
        </div>

        {/* Diet targets */}
        <div className="grid grid-cols-4 gap-3">
          {(
            [
              { label: 'Calories', value: String(plan.diet.daily_calories) },
              { label: 'Protein', value: `${plan.diet.protein_g}g` },
              { label: 'Carbs', value: `${plan.diet.carbs_g}g` },
              { label: 'Fat', value: `${plan.diet.fat_g}g` },
            ] as const
          ).map(({ label, value }) => (
            <div key={label} className="border rounded-xl p-3 text-center">
              <div className="text-lg font-semibold">{value}</div>
              <div className="text-xs text-gray-500 mt-0.5">{label}</div>
            </div>
          ))}
        </div>

        {/* Schedule */}
        <div className="space-y-4">
          {plan.schedule.map((day, i) => (
            <div key={i} className="border rounded-xl p-4">
              <h2 className="font-semibold mb-3">{day.day_label}</h2>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-gray-400 text-left text-xs">
                    <th className="pb-2 font-normal">Exercise</th>
                    <th className="pb-2 font-normal">Sets</th>
                    <th className="pb-2 font-normal">Reps</th>
                    <th className="pb-2 font-normal">Rest</th>
                  </tr>
                </thead>
                <tbody>
                  {day.exercises.map((ex, j) => (
                    <tr key={j} className="border-t">
                      <td className="py-1.5 pr-4">{ex.name}</td>
                      <td className="py-1.5">{ex.sets}</td>
                      <td className="py-1.5">{ex.reps}</td>
                      <td className="py-1.5">{ex.rest_seconds}s</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
        </div>

        {/* Notes */}
        {plan.notes && (
          <div className="border rounded-xl p-4">
            <h2 className="font-semibold mb-1 text-sm">Notes</h2>
            <p className="text-sm text-gray-700">{plan.notes}</p>
          </div>
        )}
      </div>
    </div>
  )
}
