# CSlate Dev Environment

## Quick Start

```bash
cp .env.development.example .env.development
# Add ANTHROPIC_API_KEY
npm install
npm run dev:full
```

## Port Map

| Port | Service |
|------|---------|
| 5173 | Electron renderer (Vite HMR + React DevTools) |
| 5174 | Component Playground |
| 9229 | Electron main process Node inspector |
| 3000 | CSlate-Server API (Docker) |
| 5432 | PostgreSQL (Docker) |
| 9000 | MinIO S3 API (Docker) |
| 9001 | MinIO web UI — minioadmin/minioadmin |
| 8025 | MailHog (Docker) |

## Commands

| Command | What it does |
|---------|--------------|
| `npm run dev:full` | Start everything (Electron + Docker services) |
| `npm run dev` | Electron only (needs Docker already running) |
| `npm run dev:stop` | Stop Docker + kill electron-vite |
| `npm run dev:logs` | Tail Docker service logs |
| `npm run playground` | Component Playground at localhost:5174 |
| `npm test` | All Vitest tests (no Electron needed) |
| `npm run test:watch` | Watch mode |
| `npm run typecheck` | TypeScript check (no emit) |
| `npm run db:reset` | Drop + recreate + migrate + seed dev DB |
| `npm run db:studio` | Drizzle Studio at localhost:4983 |

## Normal Startup Output

```
dev server running for the electron renderer process at:
  ➜  Local:   http://localhost:5173/
start electron app...
```

The `Autofill.enable` DevTools warning is harmless.

## Component Playground

Fast component authoring without the sandbox. Full Chrome DevTools.

URL: `http://localhost:5174?component=<name>`

- Full DevTools on the component (no sandboxing)
- Hot reload on file changes
- Use for: visual iteration, props/state debugging
- NOT for: testing sandbox eval behavior (use full Electron for that)

## Logs (Main Process)

### Log File Location

macOS stores temp files in a user-specific folder, **not `/tmp/`**. The actual path:

```bash
# Find today's log
ls /var/folders/**/T/cslate-$(date +%Y-%m-%d).log 2>/dev/null
# or use $TMPDIR which resolves to the right folder:
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq .
```

> **Gotcha**: `/tmp` on macOS is a symlink to `/private/tmp`, but the Electron process uses `os.tmpdir()` which returns the user-scoped `/var/folders/…/T/` path. Logs will NOT appear under `/tmp/cslate-*.log`.

### Tailing Logs

```bash
# All logs, pretty-printed
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq .

# Filter by module
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "engine")'
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq 'select(.module == "agent")'

# Filter by component (orchestrator, sub-agent, etc.)
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq 'select(.component == "orchestrator")'

# Show only warnings and errors (level >= 40)
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq 'select(.level >= 40)'

# Show tool calls for a specific tab
tail -f $TMPDIR/cslate-$(date +%Y-%m-%d).log | jq 'select(.tabId == "<tabId>" and .tool != null)'

# List all log files (most recent first)
ls -lt /var/folders/**/T/cslate-*.log 2>/dev/null
```

### Logger Conventions

The main process uses **pino** (`src/main/lib/logger.ts`). Log file: `$TMPDIR/cslate-YYYY-MM-DD.log`.

| Module | Child logger | What it covers |
|--------|-------------|----------------|
| `agent` | `agentLog` | IPC handler: received messages, tool-call/tool-result events, stream finish |
| `engine` | `engineLog` | streamText orchestration, intent routing, orchestrator phases, sub-agents |
| `intent` | *(via engineLog)* | Intent classifier decisions |
| `providers` | *(via engineLog)* | LLM provider registry |

**Pino log levels:**

| Level | Number | Meaning |
|-------|--------|---------|
| `trace` | 10 | Very verbose, rarely used |
| `debug` | 20 | Dev-only detail (tool inputs/results, durations) |
| `info` | 30 | Normal events (agent run, plan created, ship) |
| `warn` | 40 | Recoverable problems (build dropped, partial failure) |
| `error` | 50 | Hard failures |

In development (`NODE_ENV=development`) the level is `debug` — all levels appear. In production it's `info`.

### Key Log Events to Watch

```bash
# Component was built and shipped
jq 'select(.msg == "component shipped")'

# Stream ended without rendering (build dropped)
jq 'select(.msg | startswith("stream ended without shipping"))'

# Sub-agent failures
jq 'select(.msg == "build agent failed" or .msg == "fix agent failed")'

# Orchestrator phases (understand → dispatch → validate → ship)
jq 'select(.component == "orchestrator")'

# Intent routing decisions
jq 'select(.msg == "intent routed")'
```

### Renderer Errors

Renderer (React) errors do **not** go to the pino log — they show in the Electron DevTools console.

Open: **Cmd+Option+I** in the app window, then check the Console tab.

For component sandbox errors specifically, look for `DynamicComponent` in the console — it catches eval/render errors and surfaces them via the `ComponentError` boundary.

## Common Issues

**Port 5432 conflict**
```bash
sudo lsof -i :5432
brew services stop postgresql
```

**Docker not starting**
```bash
docker compose -f docker-compose.dev.yml logs
docker compose -f docker-compose.dev.yml down -v
npm run dev:full
```

**Electron won't launch after code change**
```bash
npm run dev:stop
npm run dev:full
```

**ANTHROPIC_API_KEY missing** — add to `.env.development`. Agent is disabled without it.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `ANTHROPIC_API_KEY` | Yes (agent) | Anthropic API key |
| `VITE_SERVER_URL` | No | Defaults to `http://localhost:3000` |

## Dev Server Keys

CSlate-Server dev API key (for `serverApiKey` config):
```
cslate_dev_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
```
