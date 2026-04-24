export interface MemoryEntry {
  name: string
  label: string
  description: string
  size: number
  updatedAt: number
  content: string
}

export const memoryApi = {
  list(): Promise<MemoryEntry[]> {
    return window.electron.invoke('memory:list') as Promise<MemoryEntry[]>
  },
  read(name: string): Promise<MemoryEntry | null> {
    return window.electron.invoke('memory:read', { name }) as Promise<MemoryEntry | null>
  },
  write(name: string, content: string): Promise<MemoryEntry | null> {
    return window.electron.invoke('memory:write', { name, content }) as Promise<MemoryEntry | null>
  },
}
