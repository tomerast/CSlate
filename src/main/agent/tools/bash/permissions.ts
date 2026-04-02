export type PermissionDecision = 'allow' | 'prompt' | 'deny'
export type PermissionBroker = { request(command: string): Promise<boolean> }
export function classifyCommand(_command: string): PermissionDecision { return 'allow' }
