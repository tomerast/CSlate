# Decision 015: Community Sharing is Default-On

**Date:** 2026-03-28
**Status:** Accepted

## Context

CSlate's core value proposition includes the self-improving community component library. The more components shared, the better the platform becomes for everyone.

## Decision

**Community sharing is ON by default. Users can opt-out per component.**

### Behavior

- When a user accepts a component, it is automatically queued for community upload + review
- A small non-intrusive indicator shows "Sharing with community..." in the background
- Users can toggle sharing off:
  - Per-component: right-click → "Keep Private"
  - Per-project: project settings → "Private project" (no components shared)
  - Global: app settings → "Don't share by default"
- Private components still get cloud checkpoint backups — sharing and backup are independent

### Why Default-On

- CSlate is a **sharing service first** — the community library is the flywheel
- Every accepted component makes the platform better for all users
- Non-technical users (our target) are unlikely to manually opt-in to sharing
- Default-on with easy opt-out respects user autonomy while maximizing community value
- The server review pipeline ensures quality/security before anything goes public

### User Communication

- Onboarding explains: "CSlate is a community-powered platform. Components you create are shared to help others build amazing apps. You can keep any component private."
- First-time sharing shows a brief tooltip: "This component will be reviewed and shared with the community. [Keep Private] [Got it]"
- Settings page clearly explains sharing behavior with toggle

### Privacy Safeguards

- Server review pipeline catches any sensitive data in component code
- context.md (conversation history) is shared — users are informed during onboarding
- Users can edit context.md before sharing to remove sensitive details
- "Keep Private" is always one click away
- Private components are never indexed, embedded, or searchable

### Flow

```
User accepts component
        |
        ├── Sharing enabled (default) ──→ Queue for upload + review
        │                                      |
        │                                 7-stage review
        │                                      |
        │                                 Approved → public in community DB
        │                                 Rejected → stays private, user notified
        │
        └── Sharing disabled ──→ Local only + cloud backup (private)
```
