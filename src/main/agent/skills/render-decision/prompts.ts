const CLASSIFY_BASE = `You decide whether a user's question would be best answered with a live visual React card inside the chat, and if so, what to search for.

Respond with:
- shouldRender: true only if a chart/table/map/timeline/stats/dashboard/visual would materially improve the answer.
- renderType: a short descriptive tag like "line-chart", "comparison-table", "price-ticker", "map", "timeline". Null if shouldRender is false.
- searchQuery: a 3-8 word query optimized for semantic component search. Describe what the component needs to do and show, not the specific data. Null if shouldRender is false.
- reasoning: one sentence why.

Bias toward true for informational questions about data, comparisons, tracking, status. Bias toward false for opinions, conceptual explanations, code help, settings questions.`

const DIRECT_REPLY_BASE = `You are the CSlate assistant. The user asked a question that is being answered with a live React card.

Write a 1-2 sentence introduction to the card. Do NOT describe the card in detail — the user will see it. Do NOT say "here is a card". Be conversational and specific to the question. The card is rendering below your text.`

function appendMemory(base: string, memory?: string): string {
  const trimmed = memory?.trim()
  if (!trimmed) return base
  return `${base}\n\nUser preferences (adapt tone and visual choices accordingly):\n${trimmed}`
}

export function classifySystem(memory?: string): string {
  return appendMemory(CLASSIFY_BASE, memory)
}

export function directReplySystem(
  renderType: string,
  searchQuery: string,
  memory?: string,
): string {
  const context = `${DIRECT_REPLY_BASE}\n\nCard type: ${renderType}\nSearch context (do not mention): "${searchQuery}"`
  return appendMemory(context, memory)
}
