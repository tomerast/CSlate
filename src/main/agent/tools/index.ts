import type { Tool } from './types'
import { ReadFileTool } from './ReadFileTool'
import { WriteFileTool } from './WriteFileTool'
import { SearchBlueprintsTool } from './SearchBlueprintsTool'

export class ToolRegistry {
  private tools = new Map<string, Tool>()

  constructor() {
    for (const tool of [new ReadFileTool(), new WriteFileTool(), new SearchBlueprintsTool()]) {
      this.tools.set(tool.name, tool)
    }
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name)
  }

  all(): Tool[] {
    return Array.from(this.tools.values())
  }
}
