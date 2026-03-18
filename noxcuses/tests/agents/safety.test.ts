import { describe, it, expect, vi } from 'vitest'
import { SafetyAgent } from '@/lib/agents/safety'
import type { AIProvider } from '@/lib/ai/types'

// Mock provider — Safety LLM classification path
function mockProvider(safe: boolean): AIProvider {
  return {
    complete: vi.fn().mockResolvedValue(
      JSON.stringify({ safe, reason: safe ? null : 'reckless advice' })
    ),
    stream: vi.fn(),
  } as unknown as AIProvider
}

describe('SafetyAgent — hard stops (no LLM called)', () => {
  const agent = new SafetyAgent(mockProvider(true))

  it('blocks eating disorder language', async () => {
    const result = await agent.check('I want to eat 500 calories a day')
    expect(result.safe).toBe(false)
    expect(result.vetoMessage).toBeTruthy()
  })

  it('blocks medical diagnosis requests', async () => {
    const result = await agent.check('Do I have a torn rotator cuff?')
    expect(result.safe).toBe(false)
  })

  it('blocks crisis language', async () => {
    const result = await agent.check('I want to hurt myself')
    expect(result.safe).toBe(false)
  })

  it('blocks under-16 indicators', async () => {
    const result = await agent.check('I am 14 years old')
    expect(result.safe).toBe(false)
  })
})

describe('SafetyAgent — safe messages pass to LLM classification', () => {
  it('passes a normal training question', async () => {
    const provider = mockProvider(true)
    const agent = new SafetyAgent(provider)
    const result = await agent.check('How many sets should I do for chest?')
    expect(result.safe).toBe(true)
    expect(provider.complete).toHaveBeenCalledOnce()
  })

  it('vetoes reckless advice via LLM classification', async () => {
    const provider = mockProvider(false)
    const agent = new SafetyAgent(provider)
    const result = await agent.check('I want to lose 10kg in 2 weeks')
    expect(result.safe).toBe(false)
    expect(result.vetoMessage).toBeTruthy()
  })
})
