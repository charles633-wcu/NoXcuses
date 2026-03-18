import { signup } from './actions'

export default function SignupPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Create account</h1>
        <form action={signup} className="flex flex-col gap-4">
          <input
            name="email"
            type="email"
            placeholder="Email"
            required
            className="border rounded-lg px-4 py-2"
          />
          <input
            name="password"
            type="password"
            placeholder="Password (min 6 chars)"
            minLength={6}
            required
            className="border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800"
          >
            Sign up
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          Already have an account? <a href="/login" className="underline">Log in</a>
        </p>
      </div>
    </main>
  )
}
