export const ALLOWED_SEND_CHANNELS = [
  'pipeline:subscribe',
  'pipeline:unsubscribe',
] as const

export const ALLOWED_INVOKE_CHANNELS = [
  'bridge:fetch',
  'config:get',
  'config:set',
  'file:read',
  'file:write',
  'file:exists',
  'file:delete',
  'app:get-version',
  'window:set-title',
  'agent:run',
  'agent:abort',
  'agent:permission-response',
  'server:search',
  'server:health',
  'server:connect',
  'server:disconnect',
  'shell:openExternal',
  'models:fetch',
  'providers:open-setup',
  'providers:list-models',
  'providers:validate',
  'providers:detect-ollama',
  // Sessions (Phase 2 — conversation persistence)
  'session:list',
  'session:get',
  'session:create',
  'session:append',
  'session:replace',
  'session:rename',
  'session:delete',
  'session:search',
  'session:fork',
  'session:auto-title',
  // Memory (Phase 6 — personalization)
  'memory:list',
  'memory:read',
  'memory:write',
  // Pipelines (kept for live-data cards)
  'pipeline:list',
  'pipeline:get-data',
  'pipeline:start',
  'pipeline:stop',
  'pipeline:status',
] as const

export const ALLOWED_LISTEN_CHANNELS = [
  'agent:token',
  'agent:tool-call',
  'agent:tool-result',
  'agent:done',
  'agent:error',
  'agent:card', // Phase 3 — inline card payload for the active message
  'agent:orchestrator:status',
  'agent:permission-request',
  'pipeline:data',
  'pipeline:status-change',
  'pipeline:error',
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
