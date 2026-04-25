## CSlate Config Panel

Built as the first CSlate system component — the global settings panel. Configures the LLM provider, main model, fast/worker model, visual theme (dark/light/midnight), and CSlate community server connection. Designed as a protected component that follows the exact same package structure as AI-generated components but cannot be modified by users through the chat interface. The model setup flow prioritizes direct OpenAI, Claude, Gemini, and Ollama connection while keeping an advanced OpenAI-compatible gateway path for hosted routers.
