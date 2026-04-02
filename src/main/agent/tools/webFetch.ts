import { z } from 'zod'
import { buildTool, type CSTool } from './types'
import type { CSlateServerClient } from '../../server/CSlateServerClient'

type WebFetchInput = { url?: string; query?: string }
type WebFetchOutput = { content: string; source: 'cslate-server' | 'web' } | { error: string }

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function createWebFetchCSTool(serverClient: CSlateServerClient | null): CSTool<WebFetchInput, WebFetchOutput> {
  return buildTool<WebFetchInput, WebFetchOutput>({
    name: 'webFetch',
    description:
      'Fetch documentation or search for information. When given a query, searches the CSlate blueprint server first, then falls back to the web. When given a direct URL, fetches and returns the page content as plain text.',
    inputSchema: z.object({
      url: z.string().optional().describe('Direct URL to fetch. Bypasses CSlate server.'),
      query: z.string().optional().describe('Search query. Tries CSlate server first, then web.'),
    }),
    call: async (input: WebFetchInput): Promise<{ data: WebFetchOutput }> => {
      if (!input.url && !input.query) {
        return { data: { error: 'Provide either url or query.' } }
      }

      // Direct URL path
      if (input.url) {
        try {
          const resp = await fetch(input.url)
          const html = await resp.text()
          const content = stripHtml(html).slice(0, 50_000)
          return { data: { content, source: 'web' } }
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          return { data: { error: `Fetch failed: ${msg}` } }
        }
      }

      // Query path: CSlate server first
      if (serverClient) {
        try {
          const results = await (serverClient as any).searchBlueprints(input.query!)
          if (results && results.length > 0) {
            const content = results
              .map((r: any) => `${r.name}: ${r.description ?? ''}`)
              .join('\n')
            return { data: { content, source: 'cslate-server' } }
          }
        } catch {
          // Server unavailable — fall through to web
        }
      }

      // Fallback: DuckDuckGo instant answer
      try {
        const encoded = encodeURIComponent(input.query!)
        const resp = await fetch(`https://api.duckduckgo.com/?q=${encoded}&format=json&no_html=1`)
        const json = await resp.json() as any
        const content = json.AbstractText
          || json.Answer
          || json.RelatedTopics?.[0]?.Text
          || `No results found for: ${input.query}`
        return { data: { content: String(content).slice(0, 50_000), source: 'web' } }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        return { data: { error: `Web search failed: ${msg}` } }
      }
    },
    isReadOnly: () => true,
    isConcurrencySafe: () => true,
  })
}
