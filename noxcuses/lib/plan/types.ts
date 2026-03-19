export interface WorkoutPlan {
  program_name: string
  weeks: number
  schedule: Array<{
    day_label: string
    exercises: Array<{
      name: string
      sets: number
      reps: string
      rest_seconds: number
    }>
  }>
  diet: {
    daily_calories: number
    protein_g: number
    carbs_g: number
    fat_g: number
  }
  notes: string
}
