# 020 — External URLs: Always Open in System Default Browser

**Date:** 2026-03-31
**Status:** Implemented

## Decision

All external URLs (docs links, signup links, API key pages) must open in the user's system default browser using Electron's `shell.openExternal()`. They must never open inside the Electron BrowserWindow.

## Context

Opening external URLs with `<a href target="_blank">` in Electron opens a new BrowserWindow, which is incorrect UX — it opens inside the app rather than Chrome/Safari/Firefox. It also bypasses the Content Security Policy and can expose users to navigation within the app to untrusted content.

## Implementation

- New IPC channel: `shell:openExternal` (registered in `src/main/ipc/shell.ts`)
- Handler validates URL starts with `https://` or `http://` before calling `shell.openExternal(url)`
- Renderer uses: `window.electron?.invoke('shell:openExternal', url)`
- All `<a href target="_blank">` replaced with `<button onClick={() => openExternal(url)}>` in config panel

## Rule

**All future external links in CSlate renderer code must use `shell:openExternal` IPC, never `<a target="_blank">`.** This applies to all renderer components.
