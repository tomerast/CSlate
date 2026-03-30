export interface JSONSchema {
  type: string
  properties?: Record<string, { type: string; description: string }>
  required?: string[]
}

export interface Tool {
  name: string
  description: string
  inputSchema: JSONSchema
  execute(input: unknown, projectDir: string | null): Promise<unknown>
}
