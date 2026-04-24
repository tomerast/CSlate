# CSlate Design System v2 — "The Visual Bridge"

> Core promise: CSlate is how you see your LLM. Not a chat box. A visual bridge between human intent and machine intelligence. Every response is a canvas. Every provider is a lens.

---

## 1. Design Philosophy

### From chat portal to visual bridge
Old CSlate thought of itself as "chat with inline cards." v2 thinks of itself as **"responses rendered beautifully, with conversation as the navigation layer."**

The LLM is the artist. CSlate is the gallery. The user's job is simply to ask — and then experience the answer.

### Human ↔ LLM as a spectrum
The UI expresses a spectrum:

```
User intent ────── Agent thinking ────── Visual response
   (type)           (animate)            (card)
```

Every touchpoint reinforces that the user is talking to **an intelligence**, not querying a database.

---

## 2. Visual Identity

### Color Palette: "Deep Space"

Inspired by code editors, astronomical photography, and premium dark-mode native apps.

| Token | Value | Usage |
|---|---|---|
| `--bg-primary` | `#0A0A0F` | App background — true deep black with a hint of navy |
| `--bg-elevated` | `#14141B` | Cards, panels, input surfaces — elevated layers |
| `--bg-overlay` | `#1E1E28` | Hover states, secondary surfaces |
| `--border-subtle` | `rgba(255,255,255,0.06)` | Almost invisible dividers |
| `--border-visible` | `rgba(255,255,255,0.12)` | Active panel borders |
| `--text-primary` | `#F0F0F5` | Headings, body — warm off-white |
| `--text-secondary` | `#8A8AA0` | Captions, timestamps, metadata |
| `--text-tertiary` | `#5A5A70` | Placeholders, disabled |
| `--accent` | `#7C6CFF` | Primary brand — soft violet |
| `--accent-glow` | `rgba(124,108,255,0.15)` | Glows, subtle highlights |
| `--provider-anthropic` | `#D4A574` | Warm copper for Claude |
| `--provider-openai` | `#7CCF8F` | Soft green for OpenAI |
| `--provider-google` | `#7BB4F0` | Sky blue for Gemini |
| `--provider-local` | `#B8A0E0` | Lavender for local |
| `--success` | `#6BE6A0` | Positive states |
| `--error` | `#FF7B7B` | Errors — soft red, not harsh |
| `--warning` | `#FFD166` | Warnings — amber |

> **Rule:** The background is DEEP. No gray `#1a1a1a` light mode faux-dark. True blackness with subtle blue tints in shadows. This lets rendered cards glow.

### Typography: "Editorial Code"

A pairing of a clean geometric sans for UI with a reading-optimized monospace for code/structured text.

| Role | Font | Weight | Size | Tracking |
|---|---|---|---|---|
| Display | Inter | 500 | 28–32px | -0.02em |
| Title | Inter | 500 | 18px | -0.01em |
| Body | Inter | 400 | 15px | 0 |
| Caption | Inter | 400 | 13px | 0.01em |
| Monospace | JetBrains Mono | 400 | 14px | 0 |
| Tiny label | Inter | 500 | 11px | 0.04em |

> **Rule:** Large type for questions, medium for answers, small for meta. The user's question should feel like a headline. The response feels like content.

### Spacing & Shape

- **Base unit:** 4px
- **Border radius:**
  - Small (buttons, badges): 8px
  - Medium (cards, panels): 16px
  - Large (hero surfaces): 24px
  - Full (pills): 9999px
- **Shadows:** Single-layer, soft, colored by context:
  - `0 8px 32px rgba(0,0,0,0.4)` — cards
  - `0 0 40px var(--accent-glow)` — active/agent states
- **Blur:** `backdrop-filter: blur(24px)` for overlays and modals

---

## 3. Core Interaction Patterns

### Pattern A: The Focused Entry ("Hero Input")

The empty state or bottom-of-conversation state shows a **large, centered, floating input** — not a text field anchored to the bottom. It feels like you're addressing the room.

**States:**
1. **Idle:** Placeholder text gently pulses. A subtle gradient orb floats behind the input
2. **Typing:** The input expands slightly. Provider badge lights up
3. **Submitting:** Input compresses, sends a ripple outward, and scrolls up to become part of the stream

**Context pills** float below the input (like Codex):
- Current provider/model (e.g., "Claude 4 Sonnet" with provider color)
- Context source (e.g., "General" or "Project: CSlate")
- Knowledge mode ("Search web" toggle)

### Pattern B: The Streaming Response

When the LLM responds, the interface should feel alive:

1. **Token streaming:** Text appears word-by-word with a subtle cursor that fades in/out
2. **Card birth:** When a card is emitted, it doesn't just appear — it grows from a single line into its full form with a spring animation
3. **Thinking states:** No raw JSON dumps. A soft glow pulse where the response will appear. For build mode: the simplified 3-phase progress bar we already built

**Reading experience:**
- When viewing the latest response, the header fades to 30% opacity
- The sidebar auto-collapses (or becomes a slim icon rail)
- The message takes center stage in a comfortable reading column (~720px max width)

### Pattern C: Provider Switching as Lens Change

Switching models is not buried in settings. It's a **first-class gesture** — like switching cameras or instruments.

**The Provider Selector:**
- A beautiful horizontal strip or dropdown that shows each provider as a "lens" with its brand color
- Transition: when switching, the entire UI's accent color subtly shifts (Claude = warm Copper, GPT = mint Green, Gemini = sky Blue)
- A brief explanation of what makes this lens different ("Claude is great for long reasoning. GPT-4o is great for code.")

### Pattern D: Conversation as Visual Memory

The sidebar session list should feel like **browsing memories**, not a text file list.

- Each session shows a **miniature thumbnail** of the last card generated (if any)
- Or a **color chip** derived from the conversation's dominant topic
- Titles are clean, single-line
- Group by "Today," "Yesterday," "Earlier"

---

## 4. Component Inventory

### 4.1 Surface: `HeroInput`

```
┌─────────────────────────────────────────────┐
│                                             │
│     ┌─────────────────────────────────┐     │
│     │                                 │     │
│     │  Ask anything...               │     │
│     │                                 │     │
│     │  🎙  Full context  ▼ │ 🡱       │     │
│     └─────────────────────────────────┘     │
│                                             │
│     🔮 Claude 4    📂 General    ⚡ Auto     │
│                                             │
└─────────────────────────────────────────────┘
```

- Large, rounded, elevated surface (24px radius)
- Subtle inner shadow creating depth
- Send button is a circular, filled accent button that scales on hover
- Attachment button (`+`) to the left of provider selector
- Provider name + icon at bottom-left
- Context selector at bottom-center
- Optional "knowledge" toggles at bottom-right

### 4.2 Surface: `MessageStream`

The conversation is a **single continuous stream**, not discrete bubbles:

```
┌─────────────────────────────────────────────┐
│                                             │
│  What are the most active stocks today?     │
│  ── 10:23 AM · Claude 4                    │
│                                             │
│  Here are the biggest movers...             │
│  [text flows naturally]                     │
│                                             │
│  ┌──────────────────────────┐                │
│  │                          │                │
│  │  [live stock card       │                │
│  │   renders inline]       │                │
│  │                          │                │
│  └──────────────────────────┘                │
│                                             │
│  You can click any row to see more...       │
│                                             │
│      ┌──────────────┐                       │
│      │ Ask follow-up │                       │
│      └──────────────┘                       │
│                                             │
└─────────────────────────────────────────────┘
```

**Key rules:**
- User messages are **bold, large, and left-aligned** (like a heading)
- Assistant text is normal weight, comfortable line-height (1.7)
- Cards are full-width within the reading column, with generous vertical margin
- No heavy message bubble chrome. Just typography and whitespace
- Timestamps and provider attribution are tiny, secondary, below the user message
- A "regenerate" and "fork" menu appears on hover of the assistant response

### 4.3 Surface: `ProviderLens`

A floating chip or selector that indicates which intelligence you're speaking to:

```
┌─────────────┐
│ ◉  Claude 4 │ ▼
└─────────────┘
  ── warm copper dot
```

**Dropdown states:**
```
┌─────────────────────────────┐
│ ◉  Claude 4 Sonnet          │ ← selected, warm copper
│    Anthropic · fast          │
├─────────────────────────────┤
│ ○  GPT-4o                   │ ← mint green dot
│    OpenAI · great code      │
│ ─────────────────────────── │
│ ○  Gemini 2.5               │ ← sky blue dot
│    Google · long context    │
│ ─────────────────────────── │
│ ⚙  Configure providers...   │
└─────────────────────────────┘
```

### 4.4 Surface: `AgentPulse`

When the LLM is "thinking" or building:

```
┌─────────────────────────────────────────────┐
│                                             │
│     ◠  Thinking it through                 │
│     ── Figuring out the best approach...    │
│                                             │
│     ████████████░░░░░░░░░░░░░░░░░░░░░░░    │
│                                             │
└─────────────────────────────────────────────┘
```

- Soft, breathing animation
- No technical jargon exposed
- Progress bar is thin, elegant, and tinted by the active provider's color
- Automatically transitions to content when ready

### 4.5 Surface: `InlineCard`

Rendered components should feel like **native citizens** of the conversation:

- No jarring borders. Subtle `1px solid rgba(255,255,255,0.06)` if needed
- Slight elevation shadow (`0 4px 24px rgba(0,0,0,0.3)`)
- Rounded corners (16px)
- Sits comfortably in the text flow with `margin: 24px 0`
- Source attribution in the bottom-right: tiny text "generated" or "from library"

---

## 5. Layout Architecture

### State: Empty / New Session

```
┌─────────────────────────────────────────────┐
│                                             │
│  ☰                                          │
│                                             │
│                                             │
│                                             │
│        What should we explore?             │     ← 32px, centered
│                                             │
│     ┌─────────────────────────────────┐     │
│     │                                 │     │
│     │  Ask anything...               │     │     ← HeroInput
│     │                                 │     │
│     │  🎙  Full context  ▼ │ 🡱       │     │
│     └─────────────────────────────────┘     │
│                                             │
│     🔮 Claude 4    📂 General    ⚡ Auto     │     ← Context pills
│                                             │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━  │
│     🕐 Review my recent commits...         │     ← Suggestion chips
│     🕐 Build me a stock screener           │
│     🕐 Connect your favorite apps          │
│                                             │
└─────────────────────────────────────────────┘
```

- Absolutely no sidebar clutter
- The user's question is the headline
- The input is the centerpiece
- Suggestion chips are horizontal scrollable or stacked vertically

### State: Active Conversation

```
┌────┬────────────────────────────────────────┐
│    │                                        │
│ ◇  │  What are the most active stocks?     │     ← User message (large)
│ ◇  │  ── 10:23 AM Claude 4                 │
│ ◇  │                                        │
│ ◇  │  Here are today's biggest movers...   │     ← Assistant text
│ ◇  │  (natural paragraph flow)              │
│ ◇  │                                        │
│ ◇  │  ┌──────────────────────────────┐     │
│ ◇  │  │ [stock card renders inline]  │     │     ← Card
│ ◇  │  └──────────────────────────────┘     │
│ ◇  │                                        │
│    │  [HeroInput floats at bottom]       │
│    │                                        │
└────┴────────────────────────────────────────┘
```

- Sidebar is minimal: just a vertical strip of session icons/thumbnails (can be toggled wider)
- Messages flow in a comfortable reading column (~640–800px wide, centered)
- The input is still prominent but now anchored to the bottom, ready for follow-ups
- Scrollbar is ultra-thin and auto-hides

### State: Building Component

```
┌─────────────────────────────────────────────┐
│                                             │
│     ◠  Thinking it through                 │
│     ── Designing your stock dashboard...   │
│                                             │
│     [subtle violet glow / pulse]           │
│                                             │
│     ┌──────────────────────────┐             │
│     │                          │             │
│     │  [card materializes     │             │
│     │   with spring animation]  │             │
│     │                          │             │
│     └──────────────────────────┘             │
│                                             │
└─────────────────────────────────────────────┘
```

---

## 6. Motion & Animation Principles

### Easing
- **Enter:** `cubic-bezier(0.16, 1, 0.3, 1)` — snappy arrival
- **Exit:** `cubic-bezier(0.4, 0, 0.2, 1)` — graceful departure
- **Spring:** `cubic-bezier(0.34, 1.56, 0.64, 1)` — playful bounce (for cards)

### Durations
- Micro-interactions (button press): 120ms
- Layout shifts (sidebar toggle): 240ms
- Card births: 400ms
- Page transitions: 300ms
- Token streaming cursor blink: 800ms cycle

### Specific animations
1. **Card birth:** Scale from 0.96 to 1.0 + opacity 0→1 + vertical slide 12px. `spring` easing.
2. **Message entry:** Slide up 8px + fade in. `enter` easing.
3. **Provider switch:** Accent color cross-fade 400ms. Subtle flash on the provider badge.
4. **Thinking pulse:** Orb glow scales 1.0→1.02→1.0 over 3s, infinite, ease-in-out.
5. **Scroll behavior:** `scroll-behavior: smooth` globally. Auto-scroll pauses if user scrolls up.

---

## 7. Iconography

- **Style:** Lucide icons (consistent, geometric, minimal stroke)
- **Stroke width:** 1.5px for UI, 2px for interactive
- **Size:** 16px for inline, 20px for buttons, 24px for empty states
- **Provider icons:** Use recognizable brand marks ( Anthropic "A", OpenAI swirl, Gemini sparkle) but recolored to fit our palette

---

## 8. Accessibility

- All color contrasts exceed WCAG AA (we use true dark + warm text)
- Motion respects `prefers-reduced-motion` (instant transitions instead of springs)
- Focus rings: `ring-2 ring-accent/50` offset by 2px
- Keyboard: Full navigation. ⌘B toggle sidebar, ⌘, settings, ⌘M memory, Enter send, Shift+Enter newline
- Screen readers: Agent status updates announced as polite live regions

---

## 9. What We Keep From v1

- Session persistence model
- IPC channel architecture
- Agent engine (routing, skills, orchestrator)
- Card rendering system (DynamicComponent, sandbox, bridge)
- Memory panel and settings architecture
- Keyboard shortcuts

## 10. What We Change

| v1 | v2 |
|---|---|
| Sidebar is always a text list | Sidebar becomes visual thumbnails, collapses to icon rail |
| Header is always visible | Header auto-fades when reading |
| Input is a bottom bar | Input is a hero surface (centered when empty, bottom when active) |
| Cards appear instantly | Cards birth with spring animation |
| Provider shown in small chip | Provider is a prominent, beautiful lens selector |
| Background is flat dark gray | Background is deep space black with subtle depth |
| Agent progress shows 7 steps | Agent progress shows 3 phases with provider color |
| Messages are standard chat bubbles | Messages are editorial stream |

---

*Prepared for CSlate v2 UI implementation. April 2026.*
