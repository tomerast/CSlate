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
