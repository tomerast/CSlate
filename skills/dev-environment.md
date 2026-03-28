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
