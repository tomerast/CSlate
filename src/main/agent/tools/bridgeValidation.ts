type ManifestLike = {
  dataSources?: Record<string, {
    endpoints?: Record<string, unknown>
  }>
}

type BridgeFetchReference = {
  sourceId: string
  endpointId: string
  file: string
}

const BRIDGE_FETCH_RE =
  /bridge\.fetch\(\s*(['"`])([^'"`]+)\1\s*,\s*(['"`])([^'"`]+)\3/g

export function findBridgeFetchReferences(files: Record<string, string>): BridgeFetchReference[] {
  const refs: BridgeFetchReference[] = []

  for (const [file, content] of Object.entries(files)) {
    for (const match of content.matchAll(BRIDGE_FETCH_RE)) {
      refs.push({
        file,
        sourceId: match[2],
        endpointId: match[4],
      })
    }
  }

  return refs
}

export function validateBridgeFetchReferences(
  files: Record<string, string>,
  manifest: unknown,
): string[] {
  const typedManifest = manifest && typeof manifest === 'object'
    ? manifest as ManifestLike
    : {}
  const refs = findBridgeFetchReferences(files)
  const errors: string[] = []

  for (const ref of refs) {
    const source = typedManifest.dataSources?.[ref.sourceId]
    if (!source) {
      errors.push(`${ref.file}: bridge.fetch references missing data source "${ref.sourceId}"`)
      continue
    }

    if (!source.endpoints?.[ref.endpointId]) {
      const available = Object.keys(source.endpoints ?? {})
      const hint = available.length > 0 ? ` Available endpoints: ${available.join(', ')}` : ''
      errors.push(
        `${ref.file}: bridge.fetch references missing endpoint "${ref.sourceId}/${ref.endpointId}".${hint}`,
      )
    }
  }

  return errors
}

function manifestText(manifest: unknown): string {
  if (!manifest || typeof manifest !== 'object') return ''
  const record = manifest as Record<string, unknown>
  const parts = [
    record.name,
    record.description,
    Array.isArray(record.tags) ? record.tags.join(' ') : '',
  ].filter((part): part is string => typeof part === 'string')
  return parts.join(' ').toLowerCase()
}

function hasLiveFreshnessRequirement(manifest: unknown): boolean {
  return /\b(current|latest|live|real[- ]?time|ticker|status|monitoring)\b/.test(manifestText(manifest))
}

function hasFreshnessMechanism(files: Record<string, string>): boolean {
  const source = Object.values(files).join('\n')
  return (
    source.includes('setInterval(') ||
    source.includes('window.setInterval(') ||
    source.includes('bridge.subscribe(') ||
    source.includes('bridge.pipelineSubscribe(')
  )
}

export function validateBridgeDataUsage(
  files: Record<string, string>,
  manifest: unknown,
): string[] {
  const errors = validateBridgeFetchReferences(files, manifest)
  const refs = findBridgeFetchReferences(files)

  if (refs.length > 0 && hasLiveFreshnessRequirement(manifest) && !hasFreshnessMechanism(files)) {
    errors.push(
      'Data-backed live/current components must poll or subscribe; a one-time bridge.fetch plus manual refresh is not enough',
    )
  }

  return errors
}
