import { describe, it, expect } from 'vitest'
import { ALLOWED_LISTEN_CHANNELS } from '../../../preload/channels'

describe('IPC channels', () => {
  it('includes orchestrator status channel', () => {
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:orchestrator:status')
  })

  it('still includes existing agent channels', () => {
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:token')
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:tool-call')
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:tool-result')
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:done')
    expect(ALLOWED_LISTEN_CHANNELS).toContain('agent:error')
  })
})
