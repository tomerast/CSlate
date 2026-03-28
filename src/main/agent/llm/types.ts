export interface LLMMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface LLMRequest {
  messages: LLMMessage[]
  system?: string
  maxTokens?: number
  model?: string
}

export interface LLMResponse {
  content: string
  inputTokens: number
  outputTokens: number
}

export interface LLMClient {
  complete(request: LLMRequest): Promise<LLMResponse>
}
