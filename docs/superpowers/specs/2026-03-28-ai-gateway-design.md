# AI Gateway Integration — Design Specification

**Date:** 2026-03-28
**Status:** Approved
**Scope:** Replace per-provider SDK registry with Vercel AI Gateway on both desktop client and server

---

## 1. Goal

Route all LLM calls in CSlate (desktop agent loop + server review pipeline) through Vercel's hosted AI Gateway (`ai-gateway.vercel.sh`). This adds caching, observability, rate limiting, and provider fallbacks without CSlate managing any gateway infrastructure. Users bring their own provider API keys (BYOK); CSlate holds one gateway API key for authentication.

Local/Ollama calls bypass the gateway entirely.

---

## 2. Two-Key Model

Every LLM request uses two keys:

| Key | Who holds it | Purpose |
|---|---|---|
| `gatewayApiKey` | CSlate (one key per deployment) | Authenticates access to `ai-gateway.vercel.sh` |
| `llmApiKey` | User (their own Anthropic/OpenAI/Google key) | Passed as `byok` per-request; billed to user's account |

The gateway authenticates the request with CSlate's key, then forwards it to the LLM provider using the user's key. CSlate pays nothing for LLM usage.

---

## 3. Config Changes

### 3.1 Desktop (`src/main/ipc/config.ts` + `src/main/lib/store.ts`)

**New sensitive key** — add to `SENSITIVE_KEYS` set:
```typescript
'gatewayApiKey'   // CSlate's Vercel AI Gateway API key
```

**New non-sensitive field** — add to `ConfigStore`:
```typescript
gatewayUrl: string   // default: 'https://ai-gateway.vercel.sh'
```

This default can be overridden in tests or to point at a local gateway proxy.

### 3.2 Server (`CSlate-server`)

New environment variables:
```
AI_GATEWAY_API_KEY=...      # CSlate's Vercel AI Gateway API key
AI_GATEWAY_URL=https://ai-gateway.vercel.sh   # overridable for testing
```

Existing provider env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) are retained — they become the `byok` key per-request, not the gateway auth key.

---

## 4. Provider Abstraction (Desktop)

### 4.1 File: `src/main/agent/providers.ts`

Replaces the multi-provider registry from Plan 05. Exports two functions:

```typescript
import { createGateway } from '@ai-sdk/gateway'
import { createOllama } from 'ollama-ai-provider'
import type { LanguageModelV1 } from 'ai'

/**
 * Create a gateway-routed model for Anthropic, OpenAI, or Google.
 * modelId format: 'anthropic/claude-sonnet-4.6', 'openai/gpt-4o', 'google/gemini-1.5-pro'
 * providerKey: user's own provider API key (BYOK)
 */
export function createGatewayModel(
  modelId: string,
  gatewayApiKey: string,
  providerKey: string,
  gatewayUrl = 'https://ai-gateway.vercel.sh'
): LanguageModelV1 {
  const [provider] = modelId.split('/')
  const gateway = createGateway({ apiKey: gatewayApiKey, baseURL: gatewayUrl })
  return gateway(modelId, {
    providerOptions: {
      gateway: {
        byok: { [provider]: [{ apiKey: providerKey }] }
      }
    }
  })
}

/**
 * Create a direct Ollama model — bypasses the gateway entirely.
 * modelId format: 'llama3', 'mistral', etc.
 */
export function createLocalModel(modelId: string): LanguageModelV1 {
  return createOllama()(modelId)
}
```

### 4.2 Model String Format

| Provider | Old (Plan 05 registry) | New (gateway) |
|---|---|---|
| Anthropic | `anthropic:claude-sonnet-4.6` | `anthropic/claude-sonnet-4.6` |
| OpenAI | `openai:gpt-4o` | `openai/gpt-4o` |
| Google | `google:gemini-1.5-pro` | `google/gemini-1.5-pro` |
| Local | `local:llama3` | `llama3` (Ollama direct) |

### 4.3 Usage in `engine.ts`

```typescript
// Resolve model based on user config
const model = config.llmProvider === 'local'
  ? createLocalModel(config.llmModel)
  : createGatewayModel(config.llmModel, config.gatewayApiKey, config.llmApiKey, config.gatewayUrl)

const result = streamText({ model, system, tools, ... })
```

---

## 5. Server Integration

### 5.1 Shared gateway factory (`packages/shared/gateway.ts`)

```typescript
import { createGateway } from '@ai-sdk/gateway'
import type { LanguageModelV1 } from 'ai'

export function createServerGatewayModel(
  modelId: string,
  providerKey: string
): LanguageModelV1 {
  const [provider] = modelId.split('/')
  const gateway = createGateway({
    apiKey: process.env.AI_GATEWAY_API_KEY!,
    baseURL: process.env.AI_GATEWAY_URL ?? 'https://ai-gateway.vercel.sh'
  })
  return gateway(modelId, {
    providerOptions: {
      gateway: {
        byok: { [provider]: [{ apiKey: providerKey }] }
      }
    }
  })
}
```

### 5.2 Review pipeline stage models

| Stage | Old | New |
|---|---|---|
| security_scan | `new Anthropic()` → haiku | `createServerGatewayModel('anthropic/claude-haiku-4.5', ANTHROPIC_API_KEY)` |
| quality_review | `new Anthropic()` → sonnet | `createServerGatewayModel('anthropic/claude-sonnet-4.6', ANTHROPIC_API_KEY)` |
| cataloging | `new Anthropic()` → haiku | `createServerGatewayModel('anthropic/claude-haiku-4.5', ANTHROPIC_API_KEY)` |
| embedding | `new OpenAI()` | `createServerGatewayModel('openai/text-embedding-3-small', OPENAI_API_KEY)` |

---

## 6. Local / Ollama Bypass

When `llmProvider === 'local'`:
- `createLocalModel(config.llmModel)` calls `ollama-ai-provider` directly
- `gatewayApiKey` is not required
- `llmBaseUrl` in config is passed to the Ollama client (defaults to `http://localhost:11434`)

No gateway key is validated or needed for local usage.

---

## 7. Dependencies

### Desktop (`CSlate`)

| Package | Action |
|---|---|
| `@ai-sdk/gateway` | Add |
| `@ai-sdk/anthropic` | Remove (replaced by gateway) |
| `@ai-sdk/openai` | Remove (replaced by gateway) |
| `@ai-sdk/google` | Remove (replaced by gateway) |
| `ollama-ai-provider` | Keep (local bypass) |

### Server (`CSlate-server`)

| Package | Action |
|---|---|
| `@ai-sdk/gateway` | Add |
| `ai` | Add (if not already present) |
| `anthropic` (SDK) | Remove from pipeline stages |
| `openai` (SDK) | Remove from pipeline embedding stage |

---

## 8. Testing

### Desktop
- `createGatewayModel`: mock `createGateway`, verify `byok` is set correctly for each provider
- `createLocalModel`: verify `createOllama` is called, no gateway involved
- `engine.ts`: verify `createLocalModel` used when `llmProvider === 'local'`, `createGatewayModel` otherwise

### Server
- `createServerGatewayModel`: mock `createGateway`, verify gateway API key and `byok` from env vars
- Pipeline stages: mock `createServerGatewayModel`, verify correct model IDs passed

---

## 9. What This Unblocks

| Plan | Dependency |
|---|---|
| Plan 05 (agent engine) | `providers.ts` using gateway, `engine.ts` calling `createGatewayModel` |
| Server review pipeline | `createServerGatewayModel` in each LLM stage |
| Plan 06 (chat UI) | No direct dependency, but Plan 05 must use gateway |
