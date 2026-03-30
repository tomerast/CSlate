## CSlate Config Panel

Built as the first CSlate system component — the global settings panel. Configures the LLM model (routed through Vercel AI Gateway with BYOK provider keys), visual theme (dark/light/midnight), and CSlate community server connection. Designed as a protected component that follows the exact same package structure as AI-generated components but cannot be modified by users through the chat interface. The model selector supports any gateway-compatible provider including cheap/fast options like minimax/minimax-m2.5 and moonshotai/kimi-k2.5 alongside the major providers.
