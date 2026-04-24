# CSlate

A desktop app for talking to LLMs — where responses come to life as interactive UI cards, not just text.

CSlate blends rendered React components directly inside LLM conversations. Every response is an opportunity to show information more beautifully. The agent automatically decides how to visualize an answer, fetches a pre-built component from the community library, and renders it inline — or builds a new one on the spot.

**The core loop:** answer → decide how to render → search server → render card (or generate one) → upload improvements back.

See `docs/spec.md` for the full product and architecture spec.
