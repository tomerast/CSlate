export type PermissionDecision = 'allow' | 'prompt' | 'deny'
export type PermissionBroker = { request(command: string): Promise<boolean> }

const DENY_PATTERNS = [
  /\beval\b/,
  /\bbash\s+-c\b/,
  /\bsh\s+-c\b/,
  /\bzsh\s+-c\b/,
  /\.env(\.[a-z]+)?(['"\s]|$)/,
  /~\/\.ssh\//,
  /\/etc\/passwd/,
  /\/etc\/shadow/,
]

const PROMPT_PATTERNS = [
  /\brm\b/,
  /\brmdir\b/,
  /\bgit\s+(push|reset|checkout\s+--)/,
  /\bnpm\s+install\b/,
  /\byarn\s+add\b/,
  /\bpnpm\s+add\b/,
  /\bcurl\b/,
  /\bwget\b/,
  /\bkill\b/,
  /\bpkill\b/,
  /\bchmod\b/,
  /\bchown\b/,
  /\bsudo\b/,
]

const ALLOW_PATTERNS = [
  /^(cat|head|tail|ls|find|echo|pwd|wc|sort|uniq|grep|rg|awk|sed|diff|file)\b/,
  /^tsc\b/,
  /^eslint\b/,
  /^prettier\b/,
  /^npm\s+run\b/,
  /^npx\b/,
  /^node\s+-e\b/,
  /^git\s+(status|log|diff|show|branch|remote|fetch|stash\s+list)\b/,
]

export function classifyCommand(command: string): PermissionDecision {
  const trimmed = command.trim()

  for (const pattern of DENY_PATTERNS) {
    if (pattern.test(trimmed)) return 'deny'
  }

  for (const pattern of ALLOW_PATTERNS) {
    if (pattern.test(trimmed)) return 'allow'
  }

  for (const pattern of PROMPT_PATTERNS) {
    if (pattern.test(trimmed)) return 'prompt'
  }

  return 'prompt'
}
