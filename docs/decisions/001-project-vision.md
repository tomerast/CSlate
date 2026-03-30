# Decision 001: CSlate Project Vision & Core Concepts

**Date:** 2026-03-28
**Status:** Accepted

## What is CSlate?

CSlate is an AI-powered app building platform. It combines:
- A **minimalist canvas** (the "Slate") — a clean white/dark background tab
- A **conversational AI interface** — floating textbox triggered by a shortcut key
- A **self-improving, crowdsourced component library** — shared database of community components

## Core User Flow

1. User opens CSlate and sees a clean "Slate" (blank canvas)
2. User presses a shortcut key to open a floating textbox
3. User describes a component they want via natural language
4. AI agent searches a shared component database for close template matches
5. If a match is found, the agent pulls the source code and modifies it to fit the request
6. If no match, the agent generates the component from scratch
7. Component is rendered live on the Slate
8. User provides feedback, AI iterates until satisfied
9. Final component source code is async uploaded to the shared DB
10. A review agent validates the code (security, quality, logic)
11. Component is embedded, summarized, and cataloged for future users

## Target Users

- Non-technical users who want to benefit from "vibe coding"
- Users who want to create their ideal application without writing code
- Plugin support for external data sources enables unlimited creation possibilities

## App Model

- Apps are composed of multiple tabs
- Each tab is a Slate containing components
- Users can build whatever they please — not limited to specific app types

## Platform

- **Desktop-first** (with potential for web later)
- Must handle desktop workloads efficiently
- Clean and easy to extend

## Tech Stack Decisions

- **Frontend:** TypeScript + React
- **Backend:** TypeScript
- **AI:** User-configurable LLM provider (OpenAI, Anthropic, etc.)
  - CSlate provides agent skills, workflows, and logic
  - User provides their own LLM API configuration
- **Database:** pgvector for semantic component search (confirmed — PostgreSQL + pgvector on Neon, see Decision 012)

## Key Differentiators

- Components are not just visual — they are dynamic and flexible
- Base component template enables inter-component interaction
- Community-driven: every refined component improves the library for all users
- AI review pipeline ensures quality and security before components enter the shared DB
