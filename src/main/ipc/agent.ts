import type { IpcMain } from 'electron'
import type { AgentRequest } from '@shared/agentTypes'
import { AgentRunner } from '../agent'
import { getConfigValue } from './config'

const runner = new AgentRunner()

export function register(ipcMain: IpcMain): void {
  ipcMain.handle('agent:generate', async (_event, payload: AgentRequest) => {
    const apiKey = getConfigValue('llmApiKey') as string | null
    if (!apiKey) throw new Error('API key not configured. Set it in Settings.')
    return runner.run(payload, apiKey)
  })
}
