export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AgentRequest {
  message: string
  history: AgentMessage[]
  projectDir?: string
  sessionId: string
}

export interface AgentResponse {
  message: string
  componentCode?: string
}
