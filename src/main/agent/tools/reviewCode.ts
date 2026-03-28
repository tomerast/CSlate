import { tool, generateText } from 'ai'
import { z } from 'zod'

const REVIEWER_SYSTEM = `You are a CSlate code reviewer. Review the provided React component code and manifest for:
1. Sandbox compliance: no fetch(), no localStorage, no window.location, no eval(), no dangerouslySetInnerHTML with user input
2. Bridge compliance: external data must use bridge.fetch() or bridge.subscribe() only
3. Zustand patterns: instance-prefixed state keys (componentId.keyName), use stateKey in manifest
4. Tailwind tokens: must use semantic tokens (bg-primary, text-text) not hardcoded colors (bg-blue-500)
5. TypeScript: no 'any' casts, no missing types
6. Manifest accuracy: inputs/outputs in manifest must match props used in ui.tsx

Respond with ONLY valid JSON: { "passed": boolean, "issues": string[], "suggestions": string[] }
No explanation outside the JSON.`

const FilesSchema = z.object({
  'ui.tsx': z.string(),
  'logic.ts': z.string().optional(),
  'types.ts': z.string().optional(),
})

type ReviewResult = { passed: boolean; issues: string[]; suggestions: string[] }

export function createReviewCodeTool(
  registry: { languageModel: (id: string) => any },
  fastModelId: string
) {
  return tool({
    description: 'Spawn an isolated code review sub-agent to check the generated component. Run in parallel with renderComponent. If issues are found, fix them before calling writeComponent.',
    parameters: z.object({
      files: FilesSchema,
      manifest: z.unknown().describe('The ComponentManifest object'),
    }),
    execute: async ({ files, manifest }) => {
      const filesText = Object.entries(files)
        .map(([name, content]) => `### ${name}\n\`\`\`tsx\n${content}\n\`\`\``)
        .join('\n\n')

      const { text } = await generateText({
        model: registry.languageModel(fastModelId),
        system: REVIEWER_SYSTEM,
        prompt: `Review this component:\n\n${filesText}\n\n### manifest.json\n\`\`\`json\n${JSON.stringify(manifest, null, 2)}\n\`\`\``,
        maxTokens: 1000,
      })

      try {
        return JSON.parse(text) as ReviewResult
      } catch {
        return { passed: false, issues: ['Reviewer returned invalid JSON'], suggestions: [] }
      }
    },
  })
}
