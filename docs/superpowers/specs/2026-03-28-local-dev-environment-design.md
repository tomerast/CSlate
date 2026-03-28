# CSlate Local Development Environment — Design Specification

**Date:** 2026-03-28
**Version:** 1.0
**Status:** Approved
**Scope:** Full-stack local dev environment for CSlate client + server

---

## 1. Goals

Enable any developer (or Claude agent) to:
- Run the complete CSlate system locally with a single command
- Debug every layer: Electron main process, host renderer, sandbox iframe, server API, data bridge
- Author and iterate on components in isolation (no sandbox, full DevTools)
- Run integration tests against a real local stack
- Have a Claude Code skill that knows exactly how to start, debug, test, and modify the system

---

## 2. Architecture Overview

```
npm run dev:full
       │
       ├─── [1] docker compose up -d (waits for health checks)
       │         ├── postgres:5432        PostgreSQL 15 + pgvector extension
       │         └── cslate-server:3000   CSlate-server (tsx watch hot reload)
       │
       ├─── [2] Health check loop: GET http://localhost:3000/health (retry 30s)
       │
       └─── [3] Launch in parallel
                ├── Electron dev (Vite HMR renderer :5173, main inspect :9229)
                └── Component Playground (standalone Vite :5174)
```

**Teardown:** `npm run dev:stop` — stops Docker services, kills all dev processes.

---

## 3. Environment Configuration

All dev config lives in `.env.development` (gitignored):

```env
# Server
CSLATE_SERVER_URL=http://localhost:3000
POSTGRES_URL=postgresql://cslate:cslate@localhost:5432/cslate_dev

# LLM — real Anthropic API, always
ANTHROPIC_API_KEY=sk-ant-...

# Electron dev flags
ELECTRON_IS_DEV=true
ELECTRON_INSPECT_PORT=9229
```

The client reads `CSLATE_SERVER_URL` at startup. In production this is the Fly.io URL. In dev it's localhost. No other code changes needed to switch environments.

---

## 4. Docker Services

### `docker-compose.dev.yml`

```yaml
services:
  postgres:
    image: pgvector/pgvector:pg15
    ports: ["5432:5432"]
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
      dockerfile: Dockerfile.dev       # tsx watch, no prod optimizations
    ports: ["3000:3000"]
    environment:
      DATABASE_URL: postgresql://cslate:cslate@postgres:5432/cslate_dev
      NODE_ENV: development
    volumes:
      - ../CSlate-server/src:/app/src  # mount source for hot reload
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

### CSlate-server `Dockerfile.dev`

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
CMD ["npx", "tsx", "watch", "src/index.ts"]
```

---

## 5. Dev Launcher Script

`scripts/dev.sh` — single entry point for the full stack:

```bash
#!/usr/bin/env bash
set -e

# Color output
GREEN='\033[0;32m' BLUE='\033[0;34m' YELLOW='\033[1;33m' NC='\033[0m'
log() { echo -e "${BLUE}[dev]${NC} $1"; }
ok()  { echo -e "${GREEN}[dev]${NC} ✓ $1"; }

# 1. Start Docker services
log "Starting Docker services..."
docker compose -f docker-compose.dev.yml up -d

# 2. Wait for server health
log "Waiting for CSlate-server..."
for i in $(seq 1 30); do
  if curl -sf http://localhost:3000/health > /dev/null 2>&1; then
    ok "CSlate-server ready"
    break
  fi
  [ $i -eq 30 ] && echo "Server failed to start" && exit 1
  sleep 1
done

# 3. Start Electron + Component Playground in parallel with unified logging
(cd apps/playground && npm run dev 2>&1 | sed 's/^/\033[0;35m[playground]\033[0m /') &
(npm run electron:dev 2>&1 | sed 's/^/\033[0;34m[electron]\033[0m /') &

wait
```

Exposed as `npm run dev:full` in root `package.json`.

---

## 6. Electron Dev Mode

### Hot Reload
- **Renderer**: Vite HMR — React changes reflect without restart
- **Main process**: `electron-reload` watches `src/main/` — change triggers full Electron restart (~1s)
- **Sandbox iframe**: watches `projects/*/components/` — component file change triggers iframe reload

### DevTools
- Host renderer DevTools open automatically (`devTools: true` in `BrowserWindow` when `ELECTRON_IS_DEV=true`)
- React DevTools extension loaded at startup (full component tree + Zustand devtools middleware)
- Main process debuggable via `--inspect=9229` — attach VS Code or `chrome://inspect`

### VS Code `launch.json` (included in repo)
```json
{
  "configurations": [
    {
      "type": "node",
      "request": "attach",
      "name": "Attach to Electron Main",
      "port": 9229,
      "restart": true
    }
  ]
}
```

### IPC Inspector (dev mode only)
All IPC messages logged to main process console:
```
[IPC →] bridge:fetch       { componentId: 'comp_abc', sourceId: 'yahoo-finance' }
[IPC ←] bridge:fetch:resp  { data: { AAPL: 189.43 } }
[IPC →] sandbox:load       { componentId: 'comp_abc', code: '...' }
```

---

## 7. Component Playground

Standalone Vite React app at `localhost:5174`. No Electron, no sandbox iframe — components render directly in the browser with full DevTools access.

### URL
```
localhost:5174?component=stock-ticker
localhost:5174?component=todo-list&width=400&height=300
```

### Capabilities
- Full Chrome DevTools on every component (React tree, breakpoints, profiler)
- Hot reload on `ui.tsx` / `logic.ts` / `types.ts` changes
- Mock `bridge` injected:
  - `bridge.fetch()` → real HTTP calls to external APIs
  - `bridge.getConfig()` → returns values from `fixtures/userConfig/<component>.json`
- Visual Zustand state panel (inspect + manually set any key)
- Visual event bus log panel (all emitted events shown in real time)
- Resizable viewport for testing at different component sizes

### File Structure
```
apps/playground/
├── index.html
├── main.tsx           # Loads component by URL param
├── MockBridge.ts      # bridge API (real fetch + fixture config)
├── MockStore.tsx      # Zustand store + inspector panel UI
└── MockEventBus.tsx   # Typed event bus + event log panel UI
```

### What It's NOT For
Integration testing. The playground is for fast component authoring. Test sandboxed behavior using the full Electron app.

---

## 8. Database Management

```bash
# Reset dev DB (drop + recreate + migrate + seed)
npm run db:reset

# Run migrations only
npm run db:migrate

# Open Drizzle Studio (DB browser at localhost:4983)
npm run db:studio

# Seed with fixture components for testing search/retrieval
npm run db:seed
```

---

## 9. Useful Dev Commands

| Command | What it does |
|---|---|
| `npm run dev:full` | Start everything (Docker + Electron + Playground) |
| `npm run dev:stop` | Stop all services and kill dev processes |
| `npm run dev:logs` | Tail unified logs from all Docker services |
| `npm run db:reset` | Drop + recreate + migrate + seed dev DB |
| `npm run db:studio` | Open Drizzle Studio at localhost:4983 |
| `npm run playground` | Start component playground only (:5174) |
| `npm run electron:dev` | Start Electron only (assumes server already running) |
| `npm run typecheck` | TypeScript check across all packages |
| `npm run test` | Run all tests (Vitest) |
| `npm run test:e2e` | Run Playwright E2E tests against local stack |

---

## 10. Claude Dev Skill

A skill file at `skills/dev-environment.md` gives any Claude agent full context to work autonomously in this repo.

### Contents
- **Startup**: `npm run dev:full` — waits for health, starts everything
- **Port map**: postgres:5432, server:3000, electron renderer:5173, playground:5174, electron inspector:9229
- **Component authoring**: use playground at :5174, not the full Electron app
- **Debugging main process**: attach to port 9229 via VS Code or `chrome://inspect`
- **Debugging renderer**: DevTools auto-open in Electron dev mode
- **Debugging components**: use playground for DevTools access; sandbox iframe doesn't expose DevTools
- **DB reset**: `npm run db:reset` when you need clean state
- **LLM**: real Anthropic API — ANTHROPIC_API_KEY must be set in .env.development
- **Switching server env**: set CSLATE_SERVER_URL in .env.development
- **Common issues**: postgres port conflict (stop local postgres first), server won't start (check docker logs with `npm run dev:logs`), component not loading (check IPC logs in Electron terminal)

---

## 11. Monorepo Structure

```
CSlate/                        # This repo (client)
├── src/
│   ├── main/                  # Electron main process
│   ├── renderer/              # Host renderer (React)
│   └── sandbox/               # Sandbox iframe runtime
├── apps/
│   └── playground/            # Component playground (Vite)
├── scripts/
│   └── dev.sh                 # Dev launcher
├── fixtures/
│   └── userConfig/            # Fixture config values for playground bridge
├── docker-compose.dev.yml
├── .env.development.example   # Template (copy to .env.development, fill in keys)
├── .vscode/
│   └── launch.json            # VS Code debugger config
└── skills/
    └── dev-environment.md     # Claude Code skill for this dev env
```

---

## 12. Related Documents

- [CSlate Client Design Spec](./2026-03-28-cslate-client-design.md)
- [Server API Contract](../contracts/server-api-contract.md)
- [Decision 014: MVP Scope](../decisions/014-mvp-scope.md)
- [Decision 006: Sandboxing](../decisions/006-component-sandboxing.md)
