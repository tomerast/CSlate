export const ALLOWED_SEND_CHANNELS = [
  'bridge:fetch',
  'bridge:subscribe',
  'bridge:unsubscribe',
  'sandbox:load',
  'sandbox:unload'
] as const

export const ALLOWED_INVOKE_CHANNELS = [
  'config:get',
  'config:set',
  'file:read',
  'file:write',
  'file:exists',
  'file:delete',
  'project:open',
  'project:save',
  'project:create',
  'project:list-recent',
  'component:read',
  'component:write',
  'component:list',
  'app:get-version',
  'window:set-title',
  'agent:run',
  'server:search',
  'server:publish',
  'shell:openExternal',
  'models:fetch',
  'canvas:load'
] as const

export const ALLOWED_LISTEN_CHANNELS = [
  'bridge:fetch:resp',
  'bridge:event',
  'sandbox:load:resp',
  'sandbox:error',
  'agent:token',
  'agent:tool-call',
  'agent:tool-result',
  'agent:done',
  'agent:error',
  'agent:orchestrator:status'
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
