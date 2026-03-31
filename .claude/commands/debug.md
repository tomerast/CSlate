# CSlate Debugging Guide

## Main Process Logs (pino)

Logs are written to a daily rotating file. All times are UTC.

**Get today's log path:**
```bash
node -e "const {join}=require('path'),{tmpdir}=require('os');const d=new Date().toISOString().slice(0,10);console.log(join(tmpdir(),'cslate-'+d+'.log'))"
```

**Tail live (pretty-print):**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | npx pino-pretty
```

**Tail raw (faster):**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log
```

**Filter by module:**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "agent")'
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "engine")'
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "intent")'
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "providers")'
```

**Show only errors (level >= 50):**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.level >= 50)'
```

**Show errors with stack traces:**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.level >= 50) | {time, module, msg, err}'
```

## Log Level Reference

| Level | Name |
|-------|------|
| 10 | trace |
| 20 | debug |
| 30 | info |
| 40 | warn |
| 50 | error |
| 60 | fatal |

Set `LOG_LEVEL=debug` in `.env.development` (default in dev).

## Key Log Events to Watch

| Module | Event | What it means |
|--------|-------|----------------|
| `agent` | `agent:run received` | IPC reached main process |
| `agent` | `config resolved` | Shows provider/model/baseUrl being used |
| `agent` | `tool-call` | Agent calling a tool (with tool name + args) |
| `agent` | `tool-result` | Tool returned (with result summary) |
| `agent` | `skill stream finished` | Done — shows totalTokens + durationMs |
| `agent` | `agent:run threw` | Full error with err.message + err.stack |
| `engine` | `intent parsed` | Shows skill + targetComponentId |
| `engine` | `streamText starting` | LLM call about to fire |
| `engine` | `first token` | Time to first token (ms) |
| `engine` | `streamText done` | Shows tokens + durationMs |
| `intent` | `parseIntent start` | Classifier starting |
| `intent` | `parseIntent done` | Shows resolved skill + durationMs |
| `providers` | `registry built` | Shows available models |

## Tracing a Request End-to-End

1. User sends message → look for `agent:run received` (module: agent)
2. Intent classified → look for `parseIntent done` (module: intent) — confirms skill
3. LLM call fires → look for `streamText starting` (module: engine)
4. Tools execute → look for `tool-call` / `tool-result` pairs
5. Done → look for `skill stream finished` with token count

## Renderer Errors

Renderer errors go to Electron DevTools, NOT the log file.
- Open: **Cmd+Option+I** in the app window
- React errors: show in DevTools console with component stack
- IPC errors: may show in both DevTools AND log file

## Debugging IPC

If a renderer invoke fails silently:
1. Check `channels.ts` — channel must be listed in `ALLOWED_INVOKE_CHANNELS`
2. Check main process log for the handler receiving it
3. Renderer DevTools Network tab shows nothing (IPC is not HTTP)

## Debugging the Agent

**Agent not responding:**
```bash
# Check if IPC reached main
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.msg == "agent:run received")'
```

**Intent classifier picking wrong skill:**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.module == "intent")'
# Look at skill + targetComponentId in parseIntent done
```

**LLM call failing:**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.level >= 50) | {msg, err}'
# Common causes: missing API key, wrong model ID, rate limit
```

**Tool call failing:**
```bash
tail -f /tmp/cslate-$(date -u +%Y-%m-%d).log | jq 'select(.msg == "tool-call" or .msg == "tool-result") | {tool, msg, result}'
```

## Debugging esbuild Bundling

Bundle errors appear in `renderComponent` tool result:
```json
{ "success": false, "errors": ["Transform failed: ..."] }
```

To test bundling manually:
```bash
node -e "
const esbuild = require('esbuild');
esbuild.build({
  stdin: { contents: 'export default function App() { return <div>test</div> }', loader: 'tsx' },
  bundle: true, format: 'cjs', write: false, external: ['react', 'react-dom']
}).then(r => console.log(r.outputFiles[0].text)).catch(console.error)
"
```

## Node Inspector (Main Process)

Dev starts with `--inspect=9229`. Attach with:
- **VS Code**: Run "Attach: Electron Main" from debug panel
- **Chrome**: Open `chrome://inspect`

## Component Playground (no sandbox)

For debugging a specific component with full DevTools:
```bash
npm run playground
# Open: http://localhost:5174?component=<componentId>
```
