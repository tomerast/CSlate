import Anthropic from '@anthropic-ai/sdk'
import type { LLMClient, LLMRequest, LLMResponse } from './types'

const DEFAULT_MODEL = 'claude-haiku-4-5-20251001'

export class AnthropicClient implements LLMClient {
  private client: Anthropic

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey })
  }

  async complete(request: LLMRequest): Promise<LLMResponse> {
    const response = await this.client.messages.create({
      model: request.model ?? DEFAULT_MODEL,
      max_tokens: request.maxTokens ?? 4096,
      system: request.system,
      messages: request.messages
    })

    const block = response.content[0]
    if (block.type !== 'text') throw new Error('Expected text response from LLM')

    return {
      content: block.text,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens
    }
  }
}
