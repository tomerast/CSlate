export interface AgentMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp: number
}

export interface AgentRequest {
  message: string
  history: AgentMessage[]
  currentCode?: string   // current component code on canvas, for iteration
  projectDir?: string
  sessionId: string
}

export interface AgentResponse {
  message: string
  componentCode?: string
}
