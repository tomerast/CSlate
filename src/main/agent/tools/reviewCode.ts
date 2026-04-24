import { z } from 'zod'
import { runSubAgent, buildTool } from '@cslate/shared/agent'

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

type FilesInput = z.infer<typeof FilesSchema>
type ReviewInput = { files: FilesInput; manifest: unknown }
type ReviewResult = { passed: boolean; issues: string[]; suggestions: string[] }

export function createReviewCodeTool(
  registry: { languageModel: (id: string) => any },
  fastModelId: string
) {
  return buildTool<ReviewInput, ReviewResult>({
    name: 'reviewCode',
    description: 'Spawn an isolated code review sub-agent to check the generated component. If issues are found, fix them before calling writeComponent.',
    inputSchema: z.object({
      files: FilesSchema,
      manifest: z.any().describe('The ComponentManifest object'),
    }),
    isReadOnly: () => true,
    isConcurrencySafe: () => false,
    call: async (input: ReviewInput) => {
      const filesText = Object.entries(input.files)
        .map(([name, content]) => `### ${name}\n\`\`\`tsx\n${content}\n\`\`\``)
        .join('\n\n')

      const { text } = await runSubAgent({
        modelId: fastModelId,
        registry,
        system: REVIEWER_SYSTEM,
        prompt: `Review this component:\n\n${filesText}\n\n### manifest.json\n\`\`\`json\n${JSON.stringify(input.manifest, null, 2)}\n\`\`\``,
        maxOutputTokens: 1000,
      })

      try {
        const result = JSON.parse(text) as ReviewResult
        return { data: result }
      } catch {
        return { data: { passed: false, issues: ['Reviewer returned invalid JSON'], suggestions: [] } }
      }
    },
  })
}
