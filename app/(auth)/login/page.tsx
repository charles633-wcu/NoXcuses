import { login } from './actions'

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ success?: string; error?: string }> }) {
  const { success } = await searchParams
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold mb-6">Log in</h1>
        {success && (
          <p className="mb-4 text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-4 py-2">
            {success}
          </p>
        )}
        <form action={login} className="flex flex-col gap-4">
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
            placeholder="Password"
            required
            className="border rounded-lg px-4 py-2"
          />
          <button
            type="submit"
            className="bg-black text-white rounded-lg px-4 py-2 hover:bg-gray-800"
          >
            Log in
          </button>
        </form>
        <p className="mt-4 text-sm text-gray-600">
          No account? <a href="/signup" className="underline">Sign up</a>
        </p>
      </div>
    </main>
  )
}
