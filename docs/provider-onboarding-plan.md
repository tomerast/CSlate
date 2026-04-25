# Provider Onboarding Plan

## Goal

Make connecting CSlate to OpenAI, Claude, Gemini, and Ollama feel like a guided product flow instead of a developer settings form. The target is one or two obvious actions per provider, with automatic validation and model selection.

## Current State

- CSlate already has AI SDK provider dependencies for OpenAI, Anthropic, Google, and Ollama.
- The settings component exposes provider URL presets, API key input, and model input.
- CSlate uses both a main model and a fast/worker model. The fast/worker model drives routing, auto-title, memory extraction, review helpers, pipeline workers, and lighter build files; UI builds and fixes use the main model.
- `agent:run` and `resolveLLMConfig()` currently let any configured `gatewayUrl` win, then treat the selected model as OpenAI-compatible. This is useful for gateways, but makes direct provider setup fragile.
- API keys are already stored through the encrypted config path.

## Recommended UX

1. Replace the generic Models form with provider cards:
   - OpenAI
   - Claude
   - Gemini
   - Ollama
   - Advanced gateway
2. For cloud providers, each card has:
   - Connect button that opens the provider key page.
   - Paste key field only after the user returns.
   - Validate button that calls a lightweight main-process check.
   - Automatic default model selection after validation.
3. For Ollama:
   - Auto-check `http://localhost:11434`.
   - If running, list local models and select a recommended installed model.
   - If not running, show install/start guidance and a retry button.
   - No API key prompt; Ollama's OpenAI-compatible endpoint accepts a placeholder key but ignores it.
4. Keep Advanced gateway separate:
   - Gateway URL
   - Gateway key
   - Raw main model ID
   - Raw fast/worker model ID
   - OpenAI-compatible mode

## Implementation Shape

- Add a first-class provider selection config value instead of inferring from `gatewayUrl`.
- Store direct-provider and gateway config separately so a previous gateway URL does not hijack OpenAI, Claude, Gemini, or Ollama setup.
- Add IPC handlers:
  - `providers:validate`
  - `providers:list-models`
  - `providers:open-setup`
  - `providers:detect-ollama`
- Reuse existing encrypted config storage for provider keys.
- Persist both `llmModel` and `llmFastModel`. Provider presets should fill preferred defaults, but users must be able to override both.
- Keep `@cslate/shared/agent` as the runtime boundary. CSlate should not fork provider runtime behavior in the client.

## Provider Notes

- OpenAI: direct API access uses bearer API keys. Project service accounts can create scoped API keys, but that requires an admin key and is not appropriate for end-user one-click onboarding inside CSlate.
- Claude: direct API access requires a Claude Console account and API key.
- Gemini: API keys in Google AI Studio are the easiest path. OAuth exists, but Google's own quickstart positions API keys as easiest and OAuth as stricter/more involved.
- Ollama: use the local OpenAI-compatible endpoint at `http://localhost:11434/v1/`; the API key is required by OpenAI clients but ignored by Ollama.

## First Milestone

Deliver a focused provider setup flow with validation:

- Provider cards in Settings.
- Direct config resolution that does not depend on `gatewayUrl`.
- OpenAI, Claude, Gemini key validation.
- Ollama local detection and model list.
- Tests for config resolution and IPC validation behavior.
