# 019 — Onboarding Flow: Remove ApiKeySetup Gate

**Date:** 2026-03-31
**Status:** Implemented

## Decision

Remove the `ApiKeySetup` screen that blocked app startup asking for a "Vercel API key". The app now always loads directly to the canvas.

## Context

The ApiKeySetup gate was added early in development before the full config panel existed. It asked for a "Vercel AI Gateway" key specifically, which was confusing and outdated. The config panel (CSlateConfigPanel, accessible via ⌘,) already provides a complete AI provider setup flow with gateway and direct API options.

## New Flow

1. App always loads to canvas — no gate
2. Gear icon in titlebar opens config panel (⌘, also works)
3. If user tries to run the agent without an API key configured, the agent IPC handler sends `agent:error` with `code: 'UNCONFIGURED_LLM'`
4. `useChat` catches this error, opens the config panel to the Models tab, and adds an assistant message explaining what to do

## Changes

- Deleted `src/renderer/settings/ApiKeySetup.tsx`
- `appStore`: replaced `apiKeySet/setApiKeySet` with `configOpen/configFocusTab/openConfig/closeConfig`
- `App.tsx`: removed gate, drives config panel from store
- `AppLayout.tsx`: added gear icon button to titlebar
- `agent/ipc.ts`: added unconfigured check before engine creation
- `useChat.ts`: handles `UNCONFIGURED_LLM` error code
