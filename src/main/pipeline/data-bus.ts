import { EventEmitter } from 'node:events'
import type { PipelineOutput } from './types'

type Callback = (data: PipelineOutput) => void

export class DataBus {
  private emitter = new EventEmitter()
  private latest = new Map<string, PipelineOutput>()
  private subscribers = new Map<string, Set<Callback>>()

  publish(pipelineId: string, data: PipelineOutput): void {
    this.latest.set(pipelineId, data)
    this.emitter.emit(pipelineId, data)
  }

  subscribe(pipelineId: string, callback: Callback): () => void {
    if (!this.subscribers.has(pipelineId)) {
      this.subscribers.set(pipelineId, new Set())
    }
    this.subscribers.get(pipelineId)!.add(callback)
    this.emitter.on(pipelineId, callback)

    return () => {
      this.emitter.off(pipelineId, callback)
      this.subscribers.get(pipelineId)?.delete(callback)
    }
  }

  getLatest(pipelineId: string): PipelineOutput | null {
    return this.latest.get(pipelineId) ?? null
  }

  getConsumerCount(pipelineId: string): number {
    return this.subscribers.get(pipelineId)?.size ?? 0
  }

  clear(pipelineId: string): void {
    this.latest.delete(pipelineId)
    this.emitter.removeAllListeners(pipelineId)
    this.subscribers.delete(pipelineId)
  }

  clearAll(): void {
    this.latest.clear()
    this.emitter.removeAllListeners()
    this.subscribers.clear()
  }
}
