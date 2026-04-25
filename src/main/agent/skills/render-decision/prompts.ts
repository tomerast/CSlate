const CLASSIFY_BASE = `You decide whether a user's question would be best answered with a live visual React card inside the chat, and if so, what to search for.

Respond with:
- shouldRender: true only if a chart/table/map/timeline/stats/dashboard/visual would materially improve the answer.
- renderType: a short descriptive tag like "line-chart", "comparison-table", "price-ticker", "map", "timeline". Null if shouldRender is false.
- searchQuery: a 3-8 word query optimized for semantic component search. Describe what the component needs to do and show, not the specific data. Null if shouldRender is false.
- reasoning: one sentence why.

CRITICAL BIAS: Any request involving data, numbers, comparisons, tracking, markets, charts, tables, or live information should be TRUE. Bias heavily toward rendering. Only say FALSE for pure opinions, philosophy, emotional support, or settings help.

Examples:
- "compare stocks" → true, "stock-comparison", "stock comparison chart"
- "what's the weather" → true, "weather-card", "weather forecast widget"
- "market movers today" → true, "market-movers", "stock market movers dashboard"
- "explain quantum computing" → false (conceptual, no data)
- "portfolio tracker" → true, "portfolio-chart", "investment portfolio dashboard"
- "should I buy tesla stock" → false (opinion/advice)
- "show me tesla's price" → true, "price-chart", "stock price chart"`

const DIRECT_REPLY_BASE = `You are the CSlate assistant. A live visual card is already rendering below. Write a single sentence introducing it. Be specific to the data. Do NOT describe what the card looks like. Do NOT say "here is a card" or "below". Do NOT ask if the user wants anything — they already do.`

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
