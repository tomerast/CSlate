export const ALLOWED_SEND_CHANNELS = [
  'bridge:fetch',
  'bridge:subscribe',
  'bridge:unsubscribe',
  'sandbox:load',
  'sandbox:unload'
] as const

export const ALLOWED_INVOKE_CHANNELS = [
  'bridge:fetch',
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
  'window:set-title'
] as const

export const ALLOWED_LISTEN_CHANNELS = [
  'bridge:fetch:resp',
  'bridge:event',
  'sandbox:load:resp',
  'sandbox:error'
] as const

export type SendChannel = typeof ALLOWED_SEND_CHANNELS[number]
export type InvokeChannel = typeof ALLOWED_INVOKE_CHANNELS[number]
export type ListenChannel = typeof ALLOWED_LISTEN_CHANNELS[number]
