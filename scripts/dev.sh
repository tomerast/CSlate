#!/usr/bin/env bash
set -euo pipefail

# ── Resolve repo root regardless of call site ────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$REPO_ROOT"

# ── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m' GREEN='\033[0;32m' BLUE='\033[0;34m'
YELLOW='\033[1;33m' MAGENTA='\033[0;35m' NC='\033[0m'

log()     { echo -e "${BLUE}[dev]${NC} $1"; }
ok()      { echo -e "${GREEN}[dev]${NC} ✓ $1"; }
warn()    { echo -e "${YELLOW}[dev]${NC} ⚠ $1"; }
err()     { echo -e "${RED}[dev]${NC} ✗ $1"; }

# ── Preflight ────────────────────────────────────────────────────────────────
if [ ! -f "$REPO_ROOT/.env.development" ]; then
  err ".env.development not found. Copy .env.development.example and fill in your values."
  exit 1
fi
source "$REPO_ROOT/.env.development"

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
(cd "$REPO_ROOT/apps/playground" && npm run dev 2>&1 | \
  sed "s/^/${MAGENTA}[playground]${NC} /") &
PLAYGROUND_PID=$!
PLAYGROUND_PGID=$(ps -o pgid= -p $PLAYGROUND_PID 2>/dev/null | tr -d ' ' || echo $PLAYGROUND_PID)

log "Starting Electron..."
(npm run dev 2>&1 | \
  sed "s/^/${BLUE}[electron]${NC} /") &
ELECTRON_PID=$!
ELECTRON_PGID=$(ps -o pgid= -p $ELECTRON_PID 2>/dev/null | tr -d ' ' || echo $ELECTRON_PID)

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
  # Kill entire process groups so npm/electron children are also terminated
  kill -- -$PLAYGROUND_PGID -$ELECTRON_PGID 2>/dev/null || true
  docker compose -f docker-compose.dev.yml down
  ok "All services stopped"
}
trap cleanup EXIT INT TERM

wait
