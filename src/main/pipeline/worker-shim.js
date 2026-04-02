'use strict'

const { parentPort, workerData } = require('node:worker_threads')

if (!parentPort) {
  throw new Error('worker-shim must be run as a Worker Thread')
}

const { bundlePath, secrets = {} } = workerData

// Inject getSecret into global scope so pipeline code can access it
globalThis.getSecret = (name) => {
  if (!(name in secrets)) {
    throw new Error(`Secret "${name}" not found. Declare it in manifest.secrets.`)
  }
  return secrets[name]
}

// Load the compiled pipeline bundle
const pipelineModule = require(bundlePath)
const PipelineClass = pipelineModule.default || pipelineModule

let instance

try {
  instance = typeof PipelineClass === 'function' ? new PipelineClass() : PipelineClass
  parentPort.postMessage({ type: 'ready' })
} catch (err) {
  parentPort.postMessage({ type: 'error', error: `Failed to instantiate pipeline: ${err.message}` })
  process.exit(1)
}

parentPort.on('message', async (cmd) => {
  try {
    switch (cmd.type) {
      case 'execute': {
        const output = await instance.execute(cmd.params || {})
        parentPort.postMessage({ type: 'data', output })
        break
      }

      case 'stream': {
        if (typeof instance.stream !== 'function') {
          parentPort.postMessage({
            type: 'error',
            error: 'Pipeline does not implement stream()',
          })
          break
        }
        await instance.stream(cmd.params || {}, (data) => {
          parentPort.postMessage({ type: 'data', output: data })
        })
        break
      }

      case 'dispose': {
        if (typeof instance.dispose === 'function') {
          await instance.dispose()
        }
        parentPort.postMessage({ type: 'disposed' })
        break
      }

      default:
        parentPort.postMessage({ type: 'error', error: `Unknown command: ${cmd.type}` })
    }
  } catch (err) {
    parentPort.postMessage({ type: 'error', error: err.message || String(err) })
  }
})
