export interface Message {
  role: 'user' | 'assistant' | 'system'
  content: string
}

export interface CompletionOptions {
  model?: string
  temperature?: number
  maxTokens?: number
  systemPrompt?: string
}

export interface AIProvider {
  complete(messages: Message[], options?: CompletionOptions): Promise<string>
  stream(messages: Message[], options?: CompletionOptions): ReadableStream<string>
}
