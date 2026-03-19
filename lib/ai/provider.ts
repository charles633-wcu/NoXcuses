import type { AIProvider } from './types'
import { OpenAIProvider } from './openai-provider'

let instance: AIProvider | null = null

export function getProvider(): AIProvider {
  if (instance) return instance

  const name = process.env.AI_PROVIDER ?? 'openai'

  if (name === 'openai') {
    instance = new OpenAIProvider()
    return instance
  }

  throw new Error(`Unknown AI_PROVIDER: ${name}`)
}
