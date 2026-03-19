import OpenAI from 'openai'
import type { AIProvider, Message, CompletionOptions } from './types'

export class OpenAIProvider implements AIProvider {
  private client: OpenAI

  constructor() {
    this.client = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
      dangerouslyAllowBrowser: true,
    })
  }

  async complete(messages: Message[], options: CompletionOptions = {}): Promise<string> {
    const allMessages = options.systemPrompt
      ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
      : messages

    const response = await this.client.chat.completions.create({
      model: options.model ?? 'gpt-4o',
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens,
      messages: allMessages,
    })

    return response.choices[0].message.content ?? ''
  }

  stream(messages: Message[], options: CompletionOptions = {}): ReadableStream<string> {
    const client = this.client
    const allMessages = options.systemPrompt
      ? [{ role: 'system' as const, content: options.systemPrompt }, ...messages]
      : messages

    return new ReadableStream({
      async start(controller) {
        const stream = await client.chat.completions.create({
          model: options.model ?? 'gpt-4o',
          temperature: options.temperature ?? 0.7,
          max_tokens: options.maxTokens,
          messages: allMessages,
          stream: true,
        })

        for await (const chunk of stream) {
          const text = chunk.choices[0]?.delta?.content ?? ''
          if (text) controller.enqueue(text)
        }
        controller.close()
      },
    })
  }
}
