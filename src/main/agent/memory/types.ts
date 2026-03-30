export type MemoryType = 'user' | 'project' | 'feedback' | 'reference'

export interface MemoryEntry {
  id: string
  type: MemoryType
  name: string
  description: string
  content: string
  createdAt: number
  updatedAt: number
}

export type NewMemoryEntry = Omit<MemoryEntry, 'id' | 'createdAt' | 'updatedAt'>
