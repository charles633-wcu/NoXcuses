'use client'

import { useState } from 'react'
import { useChat } from '@ai-sdk/react'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

const WELCOME_TEXT =
  "Hey! I'm your NoXcuses coach. I'm going to ask you a few questions to build your personalized training plan. Let's start — how old are you? (Under 16 / 16–17 / 18 or older)"

const INITIAL_MESSAGES: UIMessage[] = [
  {
    id: 'welcome',
    role: 'assistant',
    parts: [{ type: 'text', text: WELCOME_TEXT }],
  },
]

export default function OnboardingChat() {
  const [input, setInput] = useState('')

  // ai v6: use transport with DefaultChatTransport for the API URL.
  // sendMessage({ text }) replaces handleSubmit. Messages have 'parts', not 'content'.
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: '/api/onboard' }),
    messages: INITIAL_MESSAGES,
  })

  const isLoading = status === 'streaming' || status === 'submitted'

  const lastAssistant = [...messages].reverse().find((m) => m.role === 'assistant')
  const lastText =
    lastAssistant?.parts
      .filter((p) => p.type === 'text')
      .map((p) => (p as { type: 'text'; text: string }).text)
      .join('') ?? ''
  const planReady = lastText.includes('Your plan is ready!')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!input.trim() || isLoading) return
    sendMessage({ text: input })
    setInput('')
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto space-y-4 pb-4">
        {messages.map((m) => (
          <div
            key={m.id}
            className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm ${
                m.role === 'user'
                  ? 'bg-black text-white rounded-br-sm'
                  : 'bg-gray-100 text-gray-900 rounded-bl-sm'
              }`}
            >
              {m.parts
                .filter((p) => p.type === 'text')
                .map((p, i) => (
                  <span key={i}>{(p as { type: 'text'; text: string }).text}</span>
                ))}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 rounded-2xl rounded-bl-sm px-4 py-3 text-sm text-gray-400">
              Thinking...
            </div>
          </div>
        )}
      </div>

      {planReady && (
        <div className="py-3 flex justify-center">
          <a
            href="/dashboard/plan"
            className="bg-black text-white rounded-xl px-6 py-2 text-sm hover:bg-gray-800"
          >
            View your plan →
          </a>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex gap-2 pt-4 border-t">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Type your message..."
          className="flex-1 border rounded-xl px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-black"
          disabled={isLoading}
        />
        <button
          type="submit"
          disabled={isLoading || !input.trim()}
          className="bg-black text-white rounded-xl px-5 py-2 text-sm hover:bg-gray-800 disabled:opacity-50"
        >
          Send
        </button>
      </form>
    </div>
  )
}
