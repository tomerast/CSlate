# Decision 011: Data Persistence & Component Versioning

**Date:** 2026-03-28
**Status:** Accepted

## Context

Users build apps with multiple tabs and components. We need a strategy for saving, versioning, and backing up their work.

## Decision

**Local filesystem as primary storage + component checkpointing with cloud backup + version rollback.**

### Local Storage (Primary)

Each CSlate app is a project folder on disk:

```
my-app/
├── cslate.json              # App manifest (name, tabs, settings, theme)
├── tabs/
│   ├── home.json            # Tab config (grid layout, component placement)
│   ├── settings.json
│   └── dashboard.json
├── components/
│   ├── login-form/
│   │   ├── ui.tsx               # Current source
│   │   ├── logic.ts             # Optional: extracted logic
│   │   ├── types.ts             # Optional: shared types
│   │   ├── context.md           # AI-generated summary of build conversation
│   │   ├── manifest.json        # Component manifest
│   │   └── versions/
│   │       ├── v1/              # Snapshot directory
│   │       │   ├── ui.tsx
│   │       │   ├── manifest.json
│   │       │   └── meta.json    # timestamp, description, trigger
│   │       ├── v2/
│   │       │   ├── ui.tsx
│   │       │   ├── logic.ts     # Added in v2
│   │       │   ├── manifest.json
│   │       │   └── meta.json
│   │       └── ...
│   ├── todo-list/
│   │   ├── component.tsx
│   │   ├── manifest.json
│   │   └── versions/
│   │       └── ...
│   └── ...
├── theme.json               # Slate theme tokens
├── agent/
│   ├── memory/              # Agent memories for this project
│   └── config.json          # Agent customizations
└── .cslate/
    └── sync.json            # Cloud sync state (last synced versions)
```

### Component Checkpointing

Checkpoints are snapshots of a component at a point in time:

```typescript
interface ComponentCheckpoint {
  version: number;
  timestamp: string;           // ISO 8601
  source: string;              // Full component source code
  manifest: ComponentManifest; // Manifest at this version
  description: string;         // What changed (AI-generated summary)
  trigger: CheckpointTrigger;  // What caused the checkpoint
}

type CheckpointTrigger =
  | 'user-accepted'            // User hit "Accept" after iteration
  | 'manual'                   // User explicitly saved a checkpoint
  | 'before-major-change'      // Auto-checkpoint before significant modification
  | 'auto-interval';           // Periodic auto-save during long iteration sessions
```

**When checkpoints are created:**
- **User accepts a component** after the iteration loop → automatic checkpoint
- **Before a major modification** — when the AI is about to significantly change an accepted component
- **Manual** — user can explicitly checkpoint ("save this version")
- **Auto-interval** — during long iteration sessions, periodic checkpoints (e.g., every 5 accepted changes)

### Version Rollback

Users can roll back any component to a previous checkpoint:

- Right-click component → "Version History"
- See list of checkpoints with timestamps and AI-generated descriptions
- Preview any version before restoring
- "Restore" replaces current code with the checkpoint version
- Restoring creates a new checkpoint of the current version first (so rollback is reversible)

### Cloud Backup (Async)

Checkpoints are asynchronously synced to CSlate Server:

```
Component accepted → Local checkpoint saved → Async upload to server
                                                    |
                                              (non-blocking)
                                                    |
                                              Server stores:
                                              - component source
                                              - manifest
                                              - version number
                                              - user ID
                                              - project context
```

**Cloud sync rules:**
- Sync happens in the background, never blocks the user
- If offline, checkpoints queue and sync when connectivity returns
- Server stores all checkpoints (full version history)
- Local keeps last N checkpoints on disk (configurable, default: 20)
- Older local checkpoints can be fetched from server on demand
- Sync state tracked in `.cslate/sync.json`

**What is NOT synced to cloud in v1:**
- Tab layouts (local only)
- App-level config (local only)
- Agent memories (local only)
- Theme customizations (local only)

Only component source code + manifests + checkpoints go to the cloud. This keeps the sync surface small and focused.

### Offline Mode & Graceful Degradation

Local storage is the primary data source. The server is additive, never blocking.

**Rules:**
- The app ALWAYS opens and functions when offline. Never show an error screen.
- Checkpoint sync failures are silent — queued and retried when connectivity returns.
- Server search/retrieval failures show a "Server unavailable, try again later" toast — canvas continues working.
- Community upload failures queue the upload — user is notified when upload completes later.
- Sync queue is persisted to `.cslate/sync.json` so it survives app restarts.

**Sync state indicators (non-blocking):**
- Small dot in component header: grey (local only), yellow (sync pending), green (synced)
- Never show a modal or block the user for sync state

### Cloud Checkpoint vs Community Upload

These are two separate flows:

| | Cloud Checkpoint (Backup) | Community Upload |
|---|---|---|
| **Purpose** | User's personal backup + version history | Shared component library |
| **Visibility** | Private to user | Public to all users |
| **Review** | No review needed | Server review agent validates |
| **Trigger** | Automatic on checkpoint | Explicit user action ("Share to community") |
| **Storage** | User's checkpoint bucket | Community component database |

A component can be both: backed up privately AND shared to the community (after review).

### Rollback Flow

```
User: "Undo last 3 changes to the login form"
                |
Agent checks component version history
                |
Finds checkpoint from 3 versions ago
                |
Shows preview: "Here's the login form from [timestamp]. Restore?"
                |
User confirms → Current version checkpointed → Restored version loaded
                |
Component re-renders on Slate
```

### Data Model

```typescript
interface CSlateProject {
  name: string;
  version: string;
  tabs: SlateTab[];
  theme: SlateTheme;
  agentConfig: AgentConfig;
}

interface ComponentInstance {
  id: string;
  componentId: string;          // References component in components/
  tabId: string;                // Which tab it's placed on
  gridPosition: { x: number; y: number; width: number; height: number }; // grid units (multiply by 8 for pixels)
  propsOverrides: Record<string, any>;  // Instance-specific prop values
  stateBindings: Record<string, string>; // input → stateKey mappings
  eventBindings: Record<string, string>; // event → handler mappings
}

interface SyncState {
  lastSyncTimestamp: string;
  pendingUploads: string[];     // Checkpoint IDs not yet synced
  serverEndpoint: string;
}
```
