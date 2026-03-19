export default function LandingPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <h1 className="text-4xl font-bold mb-4">NoXcuses</h1>
      <p className="text-gray-600 mb-8">Your science-based bodybuilding coach.</p>
      <div className="flex gap-4">
        <a href="/login" className="px-6 py-2 bg-black text-white rounded-lg hover:bg-gray-800">
          Log in
        </a>
        <a href="/signup" className="px-6 py-2 border border-black rounded-lg hover:bg-gray-50">
          Sign up
        </a>
      </div>
    </main>
  )
}
