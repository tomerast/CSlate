# Plan 01: Project Scaffolding + Dev Environment

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bootstrap the CSlate monorepo with a working Electron + Vite + React + TypeScript app, a full local dev stack (Docker + server + DB), a component playground, and a Claude Code dev skill.

**Architecture:** `electron-vite` handles the Electron + Vite integration (main + preload + renderer). npm workspaces manages the monorepo. Docker Compose runs the backend. A single `npm run dev:full` starts everything in the correct order with health checks.

**Tech Stack:** Electron 30, electron-vite 2, React 18, TypeScript 5, Vite 5, Tailwind CSS 3, Zustand 4, Vitest, npm workspaces, Docker Compose, PostgreSQL 15 + pgvector

---

## File Map

| File | Purpose |
|---|---|
| `package.json` | Root workspace, scripts |
| `tsconfig.base.json` | Shared TS config |
| `electron.vite.config.ts` | Electron + Vite build config (main + preload + renderer) |
| `src/main/index.ts` | Electron main process entry |
| `src/preload/index.ts` | Context bridge (exposes safe APIs to renderer) |
| `src/renderer/index.html` | Renderer HTML shell |
| `src/renderer/main.tsx` | React entry point |
| `src/renderer/App.tsx` | Root React component |
| `src/renderer/index.css` | Tailwind CSS directives |
| `apps/playground/package.json` | Playground workspace config |
| `apps/playground/index.html` | Playground HTML shell |
| `apps/playground/vite.config.ts` | Playground Vite config |
| `apps/playground/src/main.tsx` | Playground React entry |
| `apps/playground/src/MockBridge.ts` | Mock bridge API (real fetch + fixture config) |
| `apps/playground/src/MockStore.tsx` | Mock Zustand store + inspector panel |
| `apps/playground/src/MockEventBus.tsx` | Mock event bus + event log panel |
| `apps/playground/src/Playground.tsx` | Main playground UI |
| `docker-compose.dev.yml` | Docker services (postgres + cslate-server) |
| `scripts/dev.sh` | Dev launcher with health checks + unified logging |
| `.env.development.example` | Env template |
| `.vscode/launch.json` | VS Code debugger (attach to Electron main :9229) |
| `skills/dev-environment.md` | Claude Code skill |
| `tailwind.config.ts` | Tailwind config with design token mappings |

---

## Task 1: Initialize Monorepo

**Files:**
- Create: `package.json`
- Create: `tsconfig.base.json`
- Create: `.gitignore` (add to existing)

- [ ] **Step 1: Create root package.json**

```json
{
  "name": "cslate",
  "version": "0.1.0",
  "private": true,
  "workspaces": ["apps/*"],
  "scripts": {
    "dev": "electron-vite dev --inspect=9229",
    "dev:full": "bash scripts/dev.sh",
    "dev:stop": "docker compose -f docker-compose.dev.yml down && pkill -f electron-vite || true",
    "dev:logs": "docker compose -f docker-compose.dev.yml logs -f",
    "playground": "npm run dev --workspace=apps/playground",
    "build": "electron-vite build",
    "typecheck": "tsc --noEmit -p tsconfig.base.json && npm run typecheck --workspace=apps/playground",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:reset": "docker compose -f docker-compose.dev.yml exec cslate-server npm run db:reset",
    "db:migrate": "docker compose -f docker-compose.dev.yml exec cslate-server npm run db:migrate",
    "db:studio": "docker compose -f docker-compose.dev.yml exec cslate-server npm run db:studio",
    "db:seed": "docker compose -f docker-compose.dev.yml exec cslate-server npm run db:seed"
  }
}
```

- [ ] **Step 2: Create tsconfig.base.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "jsx": "react-jsx",
    "baseUrl": ".",
    "paths": {
      "@renderer/*": ["src/renderer/*"],
      "@main/*": ["src/main/*"],
      "@preload/*": ["src/preload/*"]
    }
  },
  "include": ["src/**/*", "apps/**/*", "scripts/**/*"],
  "exclude": ["node_modules", "dist", "out"]
}
```

- [ ] **Step 3: Add to .gitignore**

Append to the existing `.gitignore` (create if missing):

```
node_modules/
dist/
out/
.env.development
.env.local
*.local

# Electron build artifacts
dist-electron/
release/

# Dev
.DS_Store
```

- [ ] **Step 4: Commit**

```bash
git add package.json tsconfig.base.json .gitignore
git commit -m "chore: initialize monorepo structure"
```

---

## Task 2: Install Dependencies

**Files:**
- Modify: `package.json` (dependencies added by npm install)
- Create: `package-lock.json`

- [ ] **Step 1: Install Electron + electron-vite + core build tools**

```bash
npm install --save-dev electron@^30.0.0 electron-vite@^2.0.0 vite@^5.0.0 typescript@^5.0.0
```

- [ ] **Step 2: Install React + renderer dependencies**

```bash
npm install react@^18.0.0 react-dom@^18.0.0
npm install --save-dev @types/react@^18.0.0 @types/react-dom@^18.0.0
```

- [ ] **Step 3: Install Tailwind CSS**

```bash
npm install --save-dev tailwindcss@^3.0.0 autoprefixer@^10.0.0 postcss@^8.0.0
```

- [ ] **Step 4: Install Zustand + state tools**

```bash
npm install zustand@^4.0.0
```

- [ ] **Step 5: Install test tools**

```bash
npm install --save-dev vitest@^1.0.0 @vitest/ui@^1.0.0 jsdom@^24.0.0 @testing-library/react@^14.0.0 @testing-library/user-event@^14.0.0
```

- [ ] **Step 6: Verify node_modules exist**

```bash
ls node_modules | grep -E "electron|vite|react|zustand"
```

Expected output includes: `electron`, `electron-vite`, `react`, `react-dom`, `vite`, `zustand`

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json
git commit -m "chore: install core dependencies"
```

---

## Task 3: Electron + Vite Config

**Files:**
- Create: `electron.vite.config.ts`
- Create: `tailwind.config.ts`
- Create: `postcss.config.js`

- [ ] **Step 1: Create electron.vite.config.ts**

```typescript
import { resolve } from 'path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@main': resolve('src/main') }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: {
      alias: { '@preload': resolve('src/preload') }
    }
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: { '@renderer': resolve('src/renderer') }
    },
    css: {
      postcss: './postcss.config.js'
    }
  }
})
```

- [ ] **Step 2: Install @vitejs/plugin-react**

```bash
npm install --save-dev @vitejs/plugin-react@^4.0.0
```

- [ ] **Step 3: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: ['./src/renderer/**/*.{ts,tsx}', './apps/playground/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: 'var(--slate-primary)',
        secondary: 'var(--slate-secondary)',
        accent: 'var(--slate-accent)',
        background: 'var(--slate-bg)',
        surface: 'var(--slate-surface)',
        text: 'var(--slate-text)',
        muted: 'var(--slate-text-muted)',
        border: 'var(--slate-border)',
        error: 'var(--slate-error)',
        success: 'var(--slate-success)',
        warning: 'var(--slate-warning)'
      },
      borderRadius: {
        sm: 'var(--slate-radius-sm)',
        md: 'var(--slate-radius-md)',
        lg: 'var(--slate-radius-lg)',
        full: 'var(--slate-radius-full)'
      },
      boxShadow: {
        sm: 'var(--slate-shadow-sm)',
        md: 'var(--slate-shadow-md)',
        lg: 'var(--slate-shadow-lg)'
      }
    }
  },
  plugins: []
} satisfies Config
```

- [ ] **Step 4: Create postcss.config.js**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
}
```

- [ ] **Step 5: Commit**

```bash
git add electron.vite.config.ts tailwind.config.ts postcss.config.js package.json package-lock.json
git commit -m "chore: add Electron-Vite and Tailwind config"
```

---

## Task 4: Electron Main Process

**Files:**
- Create: `src/main/index.ts`
- Create: `src/main/windowManager.ts`

- [ ] **Step 1: Create src/main/index.ts**

```typescript
import { app, BrowserWindow } from 'electron'
import { join } from 'path'
import { is } from '@electron-toolkit/utils'

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      sandbox: false, // preload needs Node access
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  // Open DevTools in development
  if (is.dev) {
    win.webContents.openDevTools()
  }

  // Load renderer
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
```

- [ ] **Step 2: Install @electron-toolkit/utils**

```bash
npm install @electron-toolkit/utils@^3.0.0
```

- [ ] **Step 3: Commit**

```bash
git add src/main/index.ts package.json package-lock.json
git commit -m "feat: add Electron main process entry"
```

---

## Task 5: Preload Script

**Files:**
- Create: `src/preload/index.ts`

- [ ] **Step 1: Create src/preload/index.ts**

```typescript
import { contextBridge, ipcRenderer } from 'electron'

// Expose safe APIs to renderer via window.electron
contextBridge.exposeInMainWorld('electron', {
  // IPC: renderer → main
  send: (channel: string, data?: unknown) => {
    ipcRenderer.send(channel, data)
  },
  // IPC: renderer → main → renderer (request/response)
  invoke: (channel: string, data?: unknown) => {
    return ipcRenderer.invoke(channel, data)
  },
  // IPC: main → renderer (subscription)
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    const subscription = (_event: Electron.IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)
    return () => ipcRenderer.removeListener(channel, subscription)
  },
  // Platform info
  platform: process.platform,
  isDev: process.env.NODE_ENV === 'development'
})
```

- [ ] **Step 2: Create src/preload/types.d.ts** (global type augmentation)

```typescript
export {}

declare global {
  interface Window {
    electron: {
      send: (channel: string, data?: unknown) => void
      invoke: (channel: string, data?: unknown) => Promise<unknown>
      on: (channel: string, callback: (...args: unknown[]) => void) => () => void
      platform: NodeJS.Platform
      isDev: boolean
    }
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/preload/index.ts src/preload/types.d.ts
git commit -m "feat: add preload context bridge"
```

---

## Task 6: React Renderer (Host App Shell)

**Files:**
- Create: `src/renderer/index.html`
- Create: `src/renderer/main.tsx`
- Create: `src/renderer/App.tsx`
- Create: `src/renderer/index.css`

- [ ] **Step 1: Create src/renderer/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CSlate</title>
    <style>
      :root {
        --slate-primary: #3b82f6;
        --slate-secondary: #6366f1;
        --slate-accent: #8b5cf6;
        --slate-bg: #0f172a;
        --slate-surface: #1e293b;
        --slate-text: #f1f5f9;
        --slate-text-muted: #94a3b8;
        --slate-border: #334155;
        --slate-error: #ef4444;
        --slate-success: #22c55e;
        --slate-warning: #f59e0b;
        --slate-radius-sm: 4px;
        --slate-radius-md: 8px;
        --slate-radius-lg: 12px;
        --slate-radius-full: 9999px;
        --slate-shadow-sm: 0 1px 2px rgba(0,0,0,0.3);
        --slate-shadow-md: 0 4px 6px rgba(0,0,0,0.4);
        --slate-shadow-lg: 0 10px 15px rgba(0,0,0,0.5);
      }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 2: Create src/renderer/index.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body, #root {
  height: 100%;
  width: 100%;
  overflow: hidden;
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  background: var(--slate-bg);
  color: var(--slate-text);
}
```

- [ ] **Step 3: Create src/renderer/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import './index.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
```

- [ ] **Step 4: Create src/renderer/App.tsx**

```tsx
import React from 'react'

export default function App(): React.ReactElement {
  return (
    <div className="flex items-center justify-center h-full bg-background">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-text mb-2">CSlate</h1>
        <p className="text-muted text-sm">Your Slate is ready. Press ⌘K to begin.</p>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Run the app and verify it starts**

```bash
npm run dev
```

Expected: Electron window opens showing "CSlate — Your Slate is ready. Press ⌘K to begin." with dark background. DevTools opens automatically.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/
git commit -m "feat: add React renderer shell"
```

---

## Task 7: Vitest Setup + Smoke Test

**Files:**
- Create: `vitest.config.ts`
- Create: `src/renderer/__tests__/App.test.tsx`

- [ ] **Step 1: Create vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts']
  },
  resolve: {
    alias: {
      '@renderer': resolve(__dirname, 'src/renderer'),
      '@main': resolve(__dirname, 'src/main')
    }
  }
})
```

- [ ] **Step 2: Create src/test-setup.ts**

```typescript
import '@testing-library/jest-dom'
```

- [ ] **Step 3: Install jest-dom**

```bash
npm install --save-dev @testing-library/jest-dom@^6.0.0
```

- [ ] **Step 4: Write the failing smoke test**

`src/renderer/__tests__/App.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react'
import App from '../App'

describe('App', () => {
  it('renders the CSlate headline', () => {
    render(<App />)
    expect(screen.getByText('CSlate')).toBeInTheDocument()
  })

  it('renders the welcome message', () => {
    render(<App />)
    expect(screen.getByText(/Press ⌘K to begin/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 5: Run test to verify it fails (function not found)**

```bash
npm test
```

Expected: FAIL — `Cannot find module '../App'` (App exists but test runner not configured yet)

- [ ] **Step 6: Run again after setup is wired**

```bash
npm test
```

Expected output:
```
✓ src/renderer/__tests__/App.test.tsx (2)
  ✓ renders the CSlate headline
  ✓ renders the welcome message

Test Files  1 passed (1)
Tests       2 passed (2)
```

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/test-setup.ts src/renderer/__tests__/App.test.tsx package.json package-lock.json
git commit -m "test: add Vitest setup and App smoke test"
```

---

## Task 8: Docker Compose Dev Services

**Files:**
- Create: `docker-compose.dev.yml`
- Create: `.env.development.example`

- [ ] **Step 1: Create docker-compose.dev.yml**

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg15
    ports:
      - "5432:5432"
    environment:
      POSTGRES_USER: cslate
      POSTGRES_PASSWORD: cslate
      POSTGRES_DB: cslate_dev
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U cslate"]
      interval: 2s
      timeout: 5s
      retries: 15

  cslate-server:
    build:
      context: ../CSlate-server
      dockerfile: Dockerfile.dev
    ports:
      - "3000:3000"
    environment:
      DATABASE_URL: postgresql://cslate:cslate@postgres:5432/cslate_dev
      NODE_ENV: development
    volumes:
      - ../CSlate-server/src:/app/src
    depends_on:
      postgres:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 3s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
```

- [ ] **Step 2: Create .env.development.example**

```env
# CSlate Local Dev Environment
# Copy this file to .env.development and fill in your values

# Server (local Docker)
CSLATE_SERVER_URL=http://localhost:3000

# PostgreSQL (local Docker — matches docker-compose.dev.yml)
POSTGRES_URL=postgresql://cslate:cslate@localhost:5432/cslate_dev

# LLM — Anthropic API (required for agent functionality)
ANTHROPIC_API_KEY=sk-ant-YOUR_KEY_HERE

# Electron debug
ELECTRON_IS_DEV=true
ELECTRON_INSPECT_PORT=9229
```

- [ ] **Step 3: Verify docker-compose file is valid**

```bash
docker compose -f docker-compose.dev.yml config
```

Expected: prints the resolved config with no errors.

- [ ] **Step 4: Commit**

```bash
git add docker-compose.dev.yml .env.development.example
git commit -m "chore: add Docker Compose dev services"
```

---

## Task 9: Dev Launcher Script

**Files:**
- Create: `scripts/dev.sh`

- [ ] **Step 1: Create scripts/dev.sh**

```bash
#!/usr/bin/env bash
set -euo pipefail

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' BLUE='\033[0;34m'
YELLOW='\033[1;33m' MAGENTA='\033[0;35m' NC='\033[0m'

log()     { echo -e "${BLUE}[dev]${NC} $1"; }
ok()      { echo -e "${GREEN}[dev]${NC} ✓ $1"; }
warn()    { echo -e "${YELLOW}[dev]${NC} ⚠ $1"; }
err()     { echo -e "${RED}[dev]${NC} ✗ $1"; }

# ── Preflight ────────────────────────────────────────────────────────────────
if [ ! -f .env.development ]; then
  err ".env.development not found. Copy .env.development.example and fill in your values."
  exit 1
fi
source .env.development

if [ -z "${ANTHROPIC_API_KEY:-}" ]; then
  warn "ANTHROPIC_API_KEY not set. Agent functionality will not work."
fi

# ── Docker services ──────────────────────────────────────────────────────────
log "Starting Docker services..."
docker compose -f docker-compose.dev.yml up -d 2>&1 | \
  sed "s/^/${MAGENTA}[docker]${NC} /"

# ── Wait for CSlate-server health ────────────────────────────────────────────
log "Waiting for CSlate-server on :3000..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    ok "CSlate-server ready"
    break
  fi
  if [ $i -eq 30 ]; then
    err "CSlate-server failed to start after 30s"
    err "Run 'npm run dev:logs' to inspect"
    exit 1
  fi
  sleep 1
done

# ── Start Playground + Electron in parallel ──────────────────────────────────
log "Starting Component Playground on :5174..."
(cd apps/playground && npm run dev 2>&1 | \
  sed "s/^/${MAGENTA}[playground]${NC} /") &
PLAYGROUND_PID=$!

log "Starting Electron..."
(npm run dev 2>&1 | \
  sed "s/^/${BLUE}[electron]${NC} /") &
ELECTRON_PID=$!

ok "All services started"
log "  Playground  → http://localhost:5174"
log "  Server API  → http://localhost:3000"
log "  DB (pg)     → localhost:5432"
log "  Inspector   → chrome://inspect (port 9229)"
log ""
log "Press Ctrl+C to stop all services"

# ── Cleanup on exit ──────────────────────────────────────────────────────────
cleanup() {
  log "Shutting down..."
  kill $PLAYGROUND_PID $ELECTRON_PID 2>/dev/null || true
  docker compose -f docker-compose.dev.yml down
  ok "All services stopped"
}
trap cleanup EXIT INT TERM

wait
```

- [ ] **Step 2: Make executable**

```bash
chmod +x scripts/dev.sh
```

- [ ] **Step 3: Verify the script is valid bash**

```bash
bash -n scripts/dev.sh
```

Expected: no output (no syntax errors)

- [ ] **Step 4: Commit**

```bash
git add scripts/dev.sh
git commit -m "chore: add dev launcher script with health checks"
```

---

## Task 10: Component Playground

**Files:**
- Create: `apps/playground/package.json`
- Create: `apps/playground/index.html`
- Create: `apps/playground/vite.config.ts`
- Create: `apps/playground/src/main.tsx`
- Create: `apps/playground/src/Playground.tsx`
- Create: `apps/playground/src/MockBridge.ts`
- Create: `apps/playground/src/MockStore.tsx`
- Create: `apps/playground/src/MockEventBus.tsx`

- [ ] **Step 1: Create apps/playground/package.json**

```json
{
  "name": "@cslate/playground",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "vite --port 5174",
    "build": "vite build",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "react": "^18.0.0",
    "react-dom": "^18.0.0",
    "zustand": "^4.0.0"
  },
  "devDependencies": {
    "@types/react": "^18.0.0",
    "@types/react-dom": "^18.0.0",
    "@vitejs/plugin-react": "^4.0.0",
    "vite": "^5.0.0",
    "typescript": "^5.0.0",
    "tailwindcss": "^3.0.0",
    "autoprefixer": "^10.0.0",
    "postcss": "^8.0.0"
  }
}
```

- [ ] **Step 2: Create apps/playground/vite.config.ts**

```typescript
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5174 }
})
```

- [ ] **Step 3: Create apps/playground/index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>CSlate Component Playground</title>
    <style>
      :root {
        --slate-primary: #3b82f6; --slate-secondary: #6366f1;
        --slate-accent: #8b5cf6; --slate-bg: #0f172a;
        --slate-surface: #1e293b; --slate-text: #f1f5f9;
        --slate-text-muted: #94a3b8; --slate-border: #334155;
        --slate-error: #ef4444; --slate-success: #22c55e;
        --slate-warning: #f59e0b; --slate-radius-sm: 4px;
        --slate-radius-md: 8px; --slate-radius-lg: 12px;
        --slate-radius-full: 9999px;
        --slate-shadow-sm: 0 1px 2px rgba(0,0,0,.3);
        --slate-shadow-md: 0 4px 6px rgba(0,0,0,.4);
        --slate-shadow-lg: 0 10px 15px rgba(0,0,0,.5);
      }
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body, #root { height: 100%; font-family: system-ui, sans-serif;
        background: var(--slate-bg); color: var(--slate-text); }
    </style>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="./src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 4: Create apps/playground/src/MockBridge.ts**

```typescript
// Mock implementation of the bridge API injected into sandboxed components.
// In the playground, bridge.fetch hits real external APIs.
// bridge.getConfig reads from fixture files in /fixtures/userConfig/

export interface BridgeAPI {
  fetch: (sourceId: string, endpointId: string, params?: Record<string, unknown>) => Promise<unknown>
  subscribe: (
    sourceId: string,
    endpointId: string,
    params: Record<string, unknown>,
    callback: (data: unknown) => void
  ) => () => void
  getConfig: (key: string) => unknown
}

export function createMockBridge(
  componentName: string,
  userConfig: Record<string, unknown> = {}
): BridgeAPI {
  const timers = new Set<ReturnType<typeof setInterval>>()

  return {
    async fetch(sourceId, endpointId, params = {}) {
      console.log(`[bridge.fetch] ${sourceId}/${endpointId}`, params)
      // In playground, make the real HTTP request (no permission gate)
      // The component's manifest declares the baseUrl — playground trusts it
      // For now return empty object; component manifest wires the real URL
      return {}
    },

    subscribe(sourceId, endpointId, params, callback) {
      console.log(`[bridge.subscribe] ${sourceId}/${endpointId}`, params)
      // Immediately call once, then every 30s
      this.fetch(sourceId, endpointId, params).then(callback)
      const timer = setInterval(() => {
        this.fetch(sourceId, endpointId, params).then(callback)
      }, 30_000)
      timers.add(timer)
      return () => {
        clearInterval(timer)
        timers.delete(timer)
      }
    },

    getConfig(key) {
      const value = userConfig[key]
      if (value === undefined) {
        console.warn(`[bridge.getConfig] Key "${key}" not found in userConfig for "${componentName}"`)
      }
      return value ?? null
    }
  }
}
```

- [ ] **Step 5: Create apps/playground/src/MockStore.tsx**

```tsx
import React, { useState } from 'react'
import { create } from 'zustand'

// One flat key-value store — same interface as the host's Zustand store
interface SlateStore {
  [key: string]: unknown
  _set: (key: string, value: unknown) => void
  _getAll: () => Record<string, unknown>
}

export const useMockStore = create<SlateStore>((set, get) => ({
  _set(key, value) {
    set({ [key]: value })
  },
  _getAll() {
    const state = get()
    return Object.fromEntries(
      Object.entries(state).filter(([k]) => !k.startsWith('_'))
    )
  }
}))

// Visual inspector panel shown in the playground sidebar
export function StoreInspector(): React.ReactElement {
  const store = useMockStore()
  const [editKey, setEditKey] = useState('')
  const [editValue, setEditValue] = useState('')

  const entries = store._getAll()

  const handleSet = () => {
    try {
      store._set(editKey, JSON.parse(editValue))
      setEditKey('')
      setEditValue('')
    } catch {
      store._set(editKey, editValue)
    }
  }

  return (
    <div className="p-3 border-t border-border text-xs font-mono">
      <div className="text-muted mb-2 font-sans text-xs uppercase tracking-wide">Zustand Store</div>
      {Object.entries(entries).length === 0 && (
        <div className="text-muted italic">Empty</div>
      )}
      {Object.entries(entries).map(([key, value]) => (
        <div key={key} className="mb-1">
          <span className="text-primary">{key}</span>
          <span className="text-muted"> = </span>
          <span className="text-text">{JSON.stringify(value)}</span>
        </div>
      ))}
      <div className="mt-2 flex gap-1">
        <input
          value={editKey}
          onChange={e => setEditKey(e.target.value)}
          placeholder="key"
          className="flex-1 bg-surface border border-border rounded px-1 py-0.5 text-text"
        />
        <input
          value={editValue}
          onChange={e => setEditValue(e.target.value)}
          placeholder="value (JSON)"
          className="flex-1 bg-surface border border-border rounded px-1 py-0.5 text-text"
        />
        <button
          onClick={handleSet}
          className="bg-primary text-white px-2 rounded text-xs"
        >
          Set
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 6: Create apps/playground/src/MockEventBus.tsx**

```tsx
import React, { useEffect, useState } from 'react'

type EventEntry = { ts: string; name: string; payload: unknown }

const listeners = new Map<string, Set<(payload: unknown) => void>>()
const log: EventEntry[] = []
const logListeners = new Set<() => void>()

export const mockEventBus = {
  emit(name: string, payload: unknown) {
    const ts = new Date().toISOString().split('T')[1].slice(0, 12)
    log.unshift({ ts, name, payload })
    if (log.length > 50) log.pop()
    logListeners.forEach(fn => fn())
    listeners.get(name)?.forEach(fn => fn(payload))
  },
  on(name: string, fn: (payload: unknown) => void) {
    if (!listeners.has(name)) listeners.set(name, new Set())
    listeners.get(name)!.add(fn)
    return () => listeners.get(name)?.delete(fn)
  }
}

// Visual event log panel shown in playground sidebar
export function EventLog(): React.ReactElement {
  const [entries, setEntries] = useState<EventEntry[]>([...log])

  useEffect(() => {
    const refresh = () => setEntries([...log])
    logListeners.add(refresh)
    return () => { logListeners.delete(refresh) }
  }, [])

  return (
    <div className="p-3 border-t border-border text-xs font-mono">
      <div className="text-muted mb-2 font-sans text-xs uppercase tracking-wide">Event Bus</div>
      {entries.length === 0 && <div className="text-muted italic">No events yet</div>}
      {entries.map((e, i) => (
        <div key={i} className="mb-1">
          <span className="text-muted">{e.ts} </span>
          <span className="text-success">{e.name}</span>
          <span className="text-muted"> {JSON.stringify(e.payload)}</span>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 7: Create apps/playground/src/Playground.tsx**

```tsx
import React from 'react'
import { StoreInspector } from './MockStore'
import { EventLog } from './MockEventBus'

interface Props {
  componentName: string | null
}

export function Playground({ componentName }: Props): React.ReactElement {
  return (
    <div className="flex h-full">
      {/* Main canvas area */}
      <div className="flex-1 flex items-center justify-center p-8 bg-background">
        {componentName ? (
          <div
            id="component-root"
            className="bg-surface rounded-lg shadow-md p-4"
            style={{ minWidth: 300, minHeight: 200 }}
          >
            <div className="text-muted text-sm text-center">
              Loading <span className="text-primary font-mono">{componentName}</span>...
            </div>
            <div className="text-muted text-xs text-center mt-2">
              (Component rendering will be wired in Plan 03)
            </div>
          </div>
        ) : (
          <div className="text-center text-muted">
            <div className="text-2xl mb-2">🎨</div>
            <div className="text-sm">
              Open a component with{' '}
              <code className="bg-surface px-1 rounded text-primary">?component=name</code>
            </div>
          </div>
        )}
      </div>

      {/* Sidebar: inspectors */}
      <div className="w-72 border-l border-border bg-surface flex flex-col overflow-y-auto">
        <div className="p-3 border-b border-border">
          <div className="text-xs text-muted uppercase tracking-wide">Component Playground</div>
          {componentName && (
            <div className="text-sm text-primary font-mono mt-1">{componentName}</div>
          )}
        </div>
        <StoreInspector />
        <EventLog />
      </div>
    </div>
  )
}
```

- [ ] **Step 8: Create apps/playground/src/main.tsx**

```tsx
import React from 'react'
import ReactDOM from 'react-dom/client'
import { Playground } from './Playground'

const params = new URLSearchParams(window.location.search)
const componentName = params.get('component')

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Playground componentName={componentName} />
  </React.StrictMode>
)
```

- [ ] **Step 9: Install playground dependencies**

```bash
npm install --workspace=apps/playground
```

- [ ] **Step 10: Start the playground and verify it loads**

```bash
npm run playground
```

Open `http://localhost:5174` — expected: dark screen with "Open a component with ?component=name" message.

Open `http://localhost:5174?component=todo-list` — expected: sidebar shows component name, canvas shows "Loading todo-list..." placeholder.

- [ ] **Step 11: Commit**

```bash
git add apps/playground/
git commit -m "feat: add component playground (localhost:5174)"
```

---

## Task 11: VS Code Debugger Config

**Files:**
- Create: `.vscode/launch.json`

- [ ] **Step 1: Create .vscode/launch.json**

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach: Electron Main",
      "port": 9229,
      "restart": true,
      "timeout": 10000,
      "sourceMaps": true,
      "outFiles": ["${workspaceFolder}/out/**/*.js"]
    },
    {
      "type": "chrome",
      "request": "attach",
      "name": "Attach: Electron Renderer",
      "port": 9222,
      "urlFilter": "http://localhost:5173/*",
      "webRoot": "${workspaceFolder}/src/renderer",
      "sourceMaps": true
    }
  ],
  "compounds": [
    {
      "name": "Debug: Electron (Main + Renderer)",
      "configurations": ["Attach: Electron Main", "Attach: Electron Renderer"]
    }
  ]
}
```

- [ ] **Step 2: Commit**

```bash
git add .vscode/launch.json
git commit -m "chore: add VS Code debugger config for Electron"
```

---

## Task 12: Claude Dev Skill

**Files:**
- Create: `skills/dev-environment.md`

- [ ] **Step 1: Create skills/dev-environment.md**

```markdown
# CSlate Dev Environment

A Claude Code skill giving full context for working in the CSlate repo.

## Quick Start

```bash
cp .env.development.example .env.development
# Fill in ANTHROPIC_API_KEY
npm run dev:full
```

This single command:
1. Starts Docker services (postgres:5432, cslate-server:3000) and waits for health
2. Starts the Component Playground at localhost:5174
3. Starts Electron with Vite HMR at localhost:5173

## Port Map

| Port | Service |
|---|---|
| 5432 | PostgreSQL (pgvector) |
| 3000 | CSlate-server API |
| 5173 | Electron renderer (Vite dev) |
| 5174 | Component Playground |
| 9229 | Electron main process inspector (node debugger) |

## Commands

| Command | What it does |
|---|---|
| `npm run dev:full` | Start everything |
| `npm run dev:stop` | Stop all services |
| `npm run dev:logs` | Tail Docker service logs |
| `npm run playground` | Component Playground only |
| `npm run dev` | Electron only (needs Docker running) |
| `npm test` | Run Vitest tests |
| `npm run typecheck` | TypeScript check across all packages |
| `npm run db:reset` | Drop + recreate + migrate + seed dev DB |
| `npm run db:studio` | Drizzle Studio at localhost:4983 |

## Component Playground

Fast component authoring without the sandbox. Full Chrome DevTools access.

URL: `http://localhost:5174?component=<name>`

Example: `http://localhost:5174?component=stock-ticker`

- Sidebar shows Zustand store inspector (inspect + manually set keys)
- Sidebar shows event bus log (all emitted events)
- `bridge.fetch()` makes real HTTP calls to external APIs
- Hot reload on component file changes

**Use for:** Component authoring, visual debugging, props/state iteration
**NOT for:** Integration testing of sandbox behavior (use full Electron app for that)

## Debugging

### Electron Main Process
```bash
npm run dev:full  # starts with --inspect=9229
# Then in VS Code: Run "Attach: Electron Main" from the debug panel
# Or in Chrome: open chrome://inspect
```

### Electron Renderer (Host App)
DevTools open automatically in dev mode (Cmd+Option+I to toggle).
React DevTools available in browser extension.

### Sandbox iframe
Components inside the sandbox are NOT directly inspectable (null origin, closed Shadow DOM by design).
Use the Component Playground (localhost:5174) to debug components with full DevTools.

### IPC Messages
All IPC messages logged to terminal in dev mode:
```
[IPC →] bridge:fetch       { componentId: 'comp_abc', sourceId: 'yahoo-finance' }
[IPC ←] bridge:fetch:resp  { data: { AAPL: 189.43 } }
```

## Common Issues

**postgres port conflict**
```bash
sudo lsof -i :5432  # find what's using the port
brew services stop postgresql  # if it's local postgres
```

**Server won't start**
```bash
npm run dev:logs  # check Docker logs
docker compose -f docker-compose.dev.yml down -v  # reset volumes
npm run dev:full  # try again
```

**Component not loading in Electron**
Check IPC logs in terminal. Sandbox iframe errors appear as `[sandbox:error]` prefixed lines.

**ANTHROPIC_API_KEY missing**
Add to .env.development. Agent functionality is disabled until this is set.

## Monorepo Structure

```
CSlate/
├── src/
│   ├── main/          Electron main process
│   ├── preload/       Context bridge
│   └── renderer/      Host renderer (React app)
├── apps/
│   └── playground/    Component playground (Vite :5174)
├── scripts/
│   └── dev.sh         Dev launcher
├── skills/
│   └── dev-environment.md  (this file)
├── docker-compose.dev.yml
└── .env.development   (gitignored — copy from .env.development.example)
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `ANTHROPIC_API_KEY` | Yes (for agent) | Anthropic API key |
| `CSLATE_SERVER_URL` | No (defaults to localhost:3000) | Server URL |
| `ELECTRON_IS_DEV` | Set automatically | Dev mode flag |

## Testing

```bash
npm test              # Run all Vitest tests once
npm run test:watch    # Watch mode
```

Tests live next to source files in `__tests__/` directories.
```

- [ ] **Step 2: Commit**

```bash
git add skills/dev-environment.md
git commit -m "docs: add Claude dev environment skill"
```

---

## Task 13: Final Integration Verify

- [ ] **Step 1: Copy env template and fill in key**

```bash
cp .env.development.example .env.development
# Edit .env.development and set ANTHROPIC_API_KEY
```

- [ ] **Step 2: Run full typecheck — expect zero errors**

```bash
npm run typecheck
```

Expected: no TypeScript errors

- [ ] **Step 3: Run full test suite — expect all passing**

```bash
npm test
```

Expected:
```
✓ src/renderer/__tests__/App.test.tsx (2)
Test Files  1 passed (1)
Tests       2 passed (2)
```

- [ ] **Step 4: Start dev full stack**

```bash
npm run dev:full
```

Expected sequence in terminal:
```
[docker] ...postgres starting...
[dev] ✓ CSlate-server ready
[dev] Starting Component Playground on :5174
[dev] Starting Electron...
[dev] ✓ All services started
[dev]   Playground  → http://localhost:5174
[dev]   Server API  → http://localhost:3000
```

Electron window opens with "CSlate — Your Slate is ready."
DevTools auto-open in the Electron window.

- [ ] **Step 5: Verify playground**

Open `http://localhost:5174?component=test` in Chrome.
Expected: playground UI with sidebar showing empty store inspector and event log.

- [ ] **Step 6: Push to GitHub**

```bash
git push origin main
```

- [ ] **Step 7: Done ✓**

Plan 01 complete. The monorepo is scaffolded, the dev environment runs with one command, the component playground is live, and a Claude skill documents everything.

**Next:** Plan 02 — Electron Core (IPC handlers, safeStorage, file system, window management)
