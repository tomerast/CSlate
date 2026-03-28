# Decision 016: Data Bridge & Permission System

**Date:** 2026-03-28
**Status:** Accepted

## Context

Visual-only components are a demo. Real value comes from components connected to live data. CSlate components run in a sandboxed iframe with no `fetch` — all data access must go through the host. This is a feature, not a limitation: the host acts as a permission-gated proxy.

### Motivating Example: Stock Portfolio Ticker

A user says: "Show me a stock ticker for my portfolio."

The AI generates a component that:
- Declares it needs access to Yahoo Finance API
- Has a configurable `symbols` parameter (user fills in: AAPL, GOOGL, TSLA)
- Fetches live price data through the host's data bridge
- Renders a real-time ticker on the Slate

When shared to community:
- User-specific stock symbols are stripped
- Component becomes a template: "Stock Ticker — configure with your symbols"
- New users pull the blueprint, fill in their own symbols, done

## Design

### The Data Bridge

A controlled channel between sandbox iframe and external world, mediated by the host:

```
┌─────────────────────────────────┐
│ SANDBOX IFRAME (component)      │
│                                 │
│  Component calls:               │
│  bridge.fetch("yahoo-finance",  │
│    { symbols: ["AAPL","GOOGL"] })│
│         │                       │
└─────────┼───────────────────────┘
          │ postMessage
          ▼
┌─────────────────────────────────┐
│ HOST RENDERER                   │
│                                 │
│  Permission check:              │
│  ✓ User approved yahoo-finance  │
│  ✓ Request matches manifest     │
│         │                       │
│  Host makes actual fetch:       │
│  fetch("https://yahoo-finance   │
│    .com/api/...", params)        │
│         │                       │
│  Returns sanitized response     │
└─────────┼───────────────────────┘
          │ postMessage
          ▼
┌─────────────────────────────────┐
│ SANDBOX IFRAME (component)      │
│                                 │
│  Receives data, renders ticker  │
└─────────────────────────────────┘
```

### Manifest: Data Sources Declaration

Components declare their data needs in the manifest:

```typescript
interface ComponentManifest {
  // ... existing fields ...

  // NEW: External data sources this component needs
  dataSources?: {
    [sourceId: string]: {
      description: string;          // Human-readable: "Live stock prices from Yahoo Finance"
      type: 'rest-api' | 'websocket' | 'graphql';
      baseUrl: string;              // "https://query1.finance.yahoo.com/v8/finance"
      endpoints: {
        [endpointId: string]: {
          path: string;             // "/quote"
          method: 'GET' | 'POST';
          description: string;      // "Fetch current price for given symbols"
          params: {
            [paramName: string]: {
              type: string;
              description: string;
              userConfigurable: boolean;  // true = user fills in, stripped on community upload
              default?: any;
            };
          };
          refreshInterval?: number;  // Auto-refresh in ms (e.g., 30000 for 30s)
        };
      };
      rateLimit?: {
        maxRequests: number;
        perSeconds: number;
      };
    };
  };

  // NEW: User-configurable parameters (stripped on community upload)
  userConfig?: {
    [key: string]: {
      type: 'string' | 'number' | 'boolean' | 'string[]' | 'object';
      description: string;          // "Your stock symbols to track"
      required: boolean;
      default?: any;
      sensitive?: boolean;          // true = never shared (API keys, credentials)
      example?: any;                // "['AAPL', 'GOOGL', 'TSLA']"
    };
  };
}
```

**Limit:** A component may declare a maximum of **5 data sources**. This prevents components that are effectively API aggregators from being registered as single components, and limits permission prompt complexity.

### Permission System

When a component is placed on the Slate and declares data sources, the user sees a permission prompt:

```
┌─────────────────────────────────────────────┐
│ 📡  Stock Ticker needs data access          │
│                                             │
│ This component wants to connect to:         │
│                                             │
│ ☐ Yahoo Finance API                         │
│   "Fetch live stock prices"                 │
│   query1.finance.yahoo.com                  │
│   Refreshes every 30 seconds                │
│                                             │
│ Configure:                                  │
│ Your stock symbols: [AAPL, GOOGL, TSLA]     │
│                                             │
│            [Deny]  [Allow & Configure]      │
└─────────────────────────────────────────────┘
```

**Permission rules:**
- User must explicitly approve each data source on first use
- Permissions are stored per-component per-project
- Denied permissions = component renders without that data (graceful degradation)
- User can revoke permissions anytime (right-click component → Permissions)
- Sensitive userConfig fields (API keys) are stored in Electron safeStorage, never in project files

### Tiered Permissions (Reducing Permission Fatigue)

A single permission prompt per data source is fine. But if a component has 4 data sources, showing 4 sequential blocking modals is UX poison. We use a tiered approach:

**Tier 1 — Auto-approve with toast (low risk):**
- Read-only, public APIs (no auth required)
- Rate limit ≤ 60 req/min
- No user config needed
- Example: public weather API, public exchange rates

*Behavior:* Component auto-connects, a toast shows "Connected to OpenWeatherMap (public)". User can revoke in component settings.

**Tier 2 — Non-blocking inline prompt (medium risk):**
- APIs requiring user config (but no credentials)
- Example: stock ticker with user-provided symbols

*Behavior:* Component renders a "Configure" state (not blocked), sidebar slides in with config fields. User fills in values, component activates. No modal.

**Tier 3 — Blocking modal (high risk):**
- APIs requiring credentials or sensitive keys
- Write operations
- Webhooks
- Example: GitHub API with personal access token

*Behavior:* Show the blocking permission modal. User must explicitly approve before component loads.

**Rule:** Never show more than 2 blocking Tier 3 modals back-to-back. If a component requires 3+ sensitive sources, batch them into one consolidated modal.

### Permission Storage

```typescript
interface ComponentPermissions {
  componentId: string;
  dataSources: {
    [sourceId: string]: {
      allowed: boolean;
      grantedAt: string;           // ISO 8601
      userConfig: Record<string, any>; // User's filled-in values
    };
  };
}

// Stored at: project/.cslate/permissions.json
// Sensitive values (sensitive: true) stored in Electron safeStorage,
// referenced by key in permissions.json
```

### Bridge API (Inside Sandbox)

Components use a `bridge` object injected by the sandbox runtime:

```typescript
// Available inside sandbox — injected by the host via postMessage protocol
const bridge = {
  // Fetch data from a declared data source
  fetch: async (sourceId: string, endpointId: string, params?: Record<string, any>) => {
    // Sends request to host via postMessage
    // Host validates: sourceId declared in manifest? User approved? Params match schema?
    // Host makes actual HTTP request
    // Returns sanitized response to sandbox
    return response;
  },

  // Subscribe to auto-refreshing data
  subscribe: (sourceId: string, endpointId: string, params: Record<string, any>, callback: (data: any) => void) => {
    // Host manages the refresh interval
    // Calls callback with new data on each refresh
    return unsubscribe;
  },

  // Read user config values (non-sensitive)
  getConfig: (key: string) => any,
};
```

### Host-Side Proxy

The host validates every bridge request:

```typescript
// Host receives bridge.fetch request from sandbox
async function handleBridgeFetch(request: BridgeRequest): Promise<BridgeResponse> {
  const { componentId, sourceId, endpointId, params } = request;

  // 1. Validate sourceId is declared in component manifest
  const manifest = getManifest(componentId);
  const source = manifest.dataSources[sourceId];
  if (!source) return { error: 'UNDECLARED_SOURCE' };

  // 2. Check user has granted permission
  const permission = getPermission(componentId, sourceId);
  if (!permission?.allowed) return { error: 'PERMISSION_DENIED' };

  // 3. Check rate limit
  if (isRateLimited(componentId, sourceId)) return { error: 'RATE_LIMITED' };

  // 4. Build actual request from manifest template + params
  const endpoint = source.endpoints[endpointId];
  const url = `${source.baseUrl}${endpoint.path}`;

  // 5. Merge user config values into params
  const mergedParams = { ...params };
  for (const [key, paramDef] of Object.entries(endpoint.params)) {
    if (paramDef.userConfigurable) {
      mergedParams[key] = permission.userConfig[key] ?? paramDef.default;
    }
  }

  // 6. Make the actual HTTP request from the host (has network access)
  const response = await fetch(url, { method: endpoint.method, ... });

  // 7. Return sanitized response to sandbox
  return { data: await response.json() };
}
```

### Client-Side URL Validation

Before making any bridge.fetch request, the host validates the target URL client-side:

```typescript
function validateBridgeUrl(url: string, manifest: ComponentManifest, sourceId: string): ValidationResult {
  const source = manifest.dataSources?.[sourceId];
  if (!source) return { valid: false, reason: 'UNDECLARED_SOURCE' };

  // 1. Parse the URL — reject malformed URLs
  let parsed: URL;
  try { parsed = new URL(url); } catch { return { valid: false, reason: 'INVALID_URL' }; }

  // 2. Reject non-HTTPS (no HTTP allowed)
  if (parsed.protocol !== 'https:') return { valid: false, reason: 'INSECURE_PROTOCOL' };

  // 3. Reject private/internal IP ranges
  const hostname = parsed.hostname;
  if (isPrivateIP(hostname) || isLoopback(hostname)) return { valid: false, reason: 'PRIVATE_IP' };

  // 4. Validate against manifest baseUrl (constructed URL must start with declared base)
  if (!url.startsWith(source.baseUrl)) return { valid: false, reason: 'URL_NOT_IN_MANIFEST' };

  return { valid: true };
}
```

**Why client-side validation:**
- Catches obvious attacks before they hit the network
- Private IP blocking prevents SSRF attacks (component trying to reach internal services)
- `URL_NOT_IN_MANIFEST` prevents components from making undeclared requests
- Complements server-side URL allowlist (see server API contract) — defense in depth

**The server still validates:** Client validation is an early warning. The server's allowlist is the hard gate.

### Community Upload: Stripping User Data

When a component is shared to the community:

```typescript
function prepareForCommunityUpload(manifest: ComponentManifest, permissions: ComponentPermissions) {
  const cleaned = deepClone(manifest);

  // Strip all userConfig values (keep the schema, remove the data)
  // "symbols: ['AAPL', 'GOOGL']" → "symbols: (user configures)"

  // Keep dataSources declaration intact (other users need to know what APIs it uses)
  // Keep userConfig schema intact (other users fill in their own values)
  // Remove any hardcoded user-specific values from source code

  return cleaned;
}
```

The AI agent handles this automatically:
1. Scans source code for hardcoded user config values
2. Replaces with references to `bridge.getConfig(key)`
3. Ensures the component works with any user's config values

### Example: Stock Ticker End-to-End

**1. User says:** "Show me a stock ticker for AAPL, GOOGL, and TSLA"

**2. AI generates component package:**

```typescript
// manifest.json
{
  "name": "Stock Ticker",
  "description": "Real-time stock price ticker with sparkline charts",
  "dataSources": {
    "yahoo-finance": {
      "description": "Live stock prices from Yahoo Finance",
      "type": "rest-api",
      "baseUrl": "https://query1.finance.yahoo.com/v8/finance",
      "endpoints": {
        "quotes": {
          "path": "/quote",
          "method": "GET",
          "description": "Fetch current prices for given symbols",
          "params": {
            "symbols": {
              "type": "string",
              "description": "Comma-separated stock symbols",
              "userConfigurable": true
            }
          },
          "refreshInterval": 30000
        }
      },
      "rateLimit": { "maxRequests": 10, "perSeconds": 60 }
    }
  },
  "userConfig": {
    "symbols": {
      "type": "string[]",
      "description": "Stock symbols to track",
      "required": true,
      "example": ["AAPL", "GOOGL", "TSLA"],
      "sensitive": false
    }
  },
  "inputs": {},
  "outputs": {
    "stockData": {
      "type": "object",
      "description": "Current stock prices and changes",
      "stateKey": "stockData"
    }
  },
  // ...
}
```

```typescript
// ui.tsx
export function StockTicker() {
  const symbols = bridge.getConfig('symbols');
  const [data, setData] = useState(null);

  useEffect(() => {
    const unsub = bridge.subscribe('yahoo-finance', 'quotes',
      { symbols: symbols.join(',') },
      (response) => setData(response)
    );
    return unsub;
  }, [symbols]);

  return (
    <div className="flex gap-4 p-4 bg-surface rounded-lg">
      {data?.map(stock => (
        <div key={stock.symbol} className="text-center">
          <div className="text-sm text-muted">{stock.symbol}</div>
          <div className="text-lg font-bold text-text">{stock.price}</div>
          <div className={stock.change > 0 ? 'text-success' : 'text-error'}>
            {stock.changePercent}%
          </div>
        </div>
      ))}
    </div>
  );
}
```

**3. User sees permission prompt**, approves Yahoo Finance, fills in symbols.

**4. Component renders live data** on the Slate, refreshing every 30s.

**5. User accepts, component shared to community** with symbols stripped — becomes a configurable "Stock Ticker" blueprint.

**6. Another user pulls the blueprint**, fills in their own symbols, instant working ticker.

### More Use Cases

| Use Case | Data Source | User Config |
|---|---|---|
| Stock ticker | Yahoo Finance API | Stock symbols |
| Weather widget | OpenWeatherMap API | City, units (°C/°F) |
| GitHub activity | GitHub API | Repo, personal access token (sensitive) |
| Todo list with sync | User's REST API | API endpoint URL, auth token (sensitive) |
| Analytics dashboard | Google Analytics | Property ID, service account (sensitive) |
| RSS reader | Any RSS feed | Feed URLs |
| Calendar | Google Calendar API | Calendar ID, OAuth token (sensitive) |

### Sensitive Data Handling

For data sources that need API keys or credentials:

- `sensitive: true` in userConfig → stored in Electron safeStorage (OS-level encryption)
- Never written to project files on disk
- Never included in checkpoint backups
- Never uploaded to community or cloud
- Permission UI clearly marks: "🔒 This value is stored securely and never shared"
- On community upload, sensitive fields become empty required fields other users must fill in

### What This Enables

- Components go from static UI → **live, data-connected applications**
- The permission system gives users **full visibility and control** over data access
- Community components are **reusable templates** — same component, different user data
- The host proxy means **zero data access from the sandbox** without explicit approval
- Rate limiting per-component prevents abuse
- Sensitive credentials are **never exposed** to the sandbox, community, or cloud

## v1 Scope

This is **in v1** — it's essential for making CSlate useful beyond visual demos.

v1 includes:
- `dataSources` and `userConfig` in manifest
- Permission prompt UI (approve/deny per data source)
- Host-side proxy with validation + rate limiting
- `bridge.fetch()` and `bridge.subscribe()` in sandbox
- Sensitive value storage in safeStorage
- Auto-stripping of user data on community upload

v2 additions:
- OAuth flow support (for Google, GitHub, etc.)
- MCP server integration as data sources
- Data source marketplace (pre-configured API connectors)
- WebSocket support for real-time streaming
- Cross-component data sharing policies
