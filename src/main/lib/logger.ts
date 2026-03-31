import pino from 'pino'
import { join } from 'path'
import { tmpdir } from 'os'

const date = new Date().toISOString().slice(0, 10) // YYYY-MM-DD
const logFile = join(tmpdir(), `cslate-${date}.log`)

const level = process.env.LOG_LEVEL ?? (process.env.NODE_ENV === 'development' ? 'debug' : 'info')

export const logger = pino(
  { level },
  pino.destination({ dest: logFile, sync: false })
)

/** Pre-bound child loggers for each module */
export const agentLog = logger.child({ module: 'agent' })
export const engineLog = logger.child({ module: 'engine' })

export { logFile }
