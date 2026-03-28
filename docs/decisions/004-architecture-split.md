# Decision 004: Client/Server Architecture Split

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate has two distinct concerns:
1. **Desktop client** — the Electron app where users interact with the Slate, generate components via AI, and build apps
2. **Server backend** — the shared component database, code review agent, embedding/cataloging pipeline, and component retrieval API

## Decision

Split into two separate repositories:

### CSlate (Desktop Client) — `github.com/tomerast/CSlate`
- Electron + React + TypeScript
- The Slate canvas and component rendering
- Floating AI chat interface
- Local component management
- User's LLM configuration and local AI agent
- Communication with server API for component retrieval/upload

### CSlate-Server — `github.com/tomerast/CSlate-server`
- TypeScript backend
- **Component Review Pipeline**: AI agent that reviews uploaded component source code for quality, security, and correctness
- **Component Cataloging**: Summarizes, tags, and catalogs reviewed components
- **Embedding Pipeline**: Generates vector embeddings for semantic search
- **Component Retrieval API**: Allows clients to search for similar components as blueprints
- **pgvector Database**: Stores component source code, metadata, and vector embeddings
- **User Management**: Component ownership, contribution tracking

## Communication Flow

```
[CSlate Desktop Client]
        |
        | HTTPS/WebSocket API
        |
[CSlate-Server]
        |
        |--- Review Agent (validates code quality + security)
        |--- Embedding Pipeline (generates vectors for semantic search)
        |--- Catalog Service (summarizes + tags components)
        |--- pgvector DB (stores components + embeddings)
```

## What Lives Where

| Concern | Repository |
|---|---|
| Electron shell, window management | CSlate |
| Slate canvas + grid layout | CSlate |
| Floating AI textbox | CSlate |
| Component rendering + sandboxing | CSlate |
| Local AI agent (user-configured LLM) | CSlate |
| Iterative component refinement loop | CSlate |
| Component upload (async) | CSlate → CSlate-Server |
| Component search/retrieval | CSlate ← CSlate-Server |
| Code review agent | CSlate-Server |
| Embedding generation | CSlate-Server |
| Cataloging + summarization | CSlate-Server |
| pgvector database | CSlate-Server |
| User/auth management | CSlate-Server |

## Rationale

- **Separation of concerns**: Desktop UX vs backend services have different scaling, deployment, and development patterns
- **Independent deployment**: Server can be updated without client releases
- **Team scalability**: Different developers can work on client vs server
- **Security**: Server-side review agent runs in a controlled environment, not on user machines
- **Shared resource**: The component DB serves all CSlate users — it's inherently a server concern
