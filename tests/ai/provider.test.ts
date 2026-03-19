import { describe, it, expect, vi, beforeEach } from 'vitest'

// We test the provider singleton returns an object with complete() and stream()
describe('getProvider', () => {
  beforeEach(() => {
    vi.resetModules()
  })

  it('returns a provider with complete and stream methods', async () => {
    process.env.AI_PROVIDER = 'openai'
    process.env.OPENAI_API_KEY = 'test-key'
    const { getProvider } = await import('@/lib/ai/provider')
    const provider = getProvider()
    expect(typeof provider.complete).toBe('function')
    expect(typeof provider.stream).toBe('function')
  })

  it('throws if AI_PROVIDER env var is unrecognized', async () => {
    process.env.AI_PROVIDER = 'unknown'
    const { getProvider } = await import('@/lib/ai/provider')
    expect(() => getProvider()).toThrow('Unknown AI_PROVIDER: unknown')
  })
})
