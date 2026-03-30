import { useState, useCallback, useMemo } from 'react'
import type { ConfigValues, ConfigPanelProps, Theme, GatewayMode, ConfigTab, ConnectionMode, DirectProvider } from './types'
import { DEFAULT_CONFIG, MODEL_PRESETS, GATEWAY_OPTIONS } from './types'

function inferDirectProvider(model: string): DirectProvider {
  if (model.startsWith('anthropic/')) return 'anthropic'
  if (model.startsWith('openai/')) return 'openai'
  if (model.startsWith('google/')) return 'google'
  return 'anthropic'
}

export function useConfigForm(props: ConfigPanelProps) {
  const initialValues: ConfigValues = {
    llmModel: props.llmModel ?? DEFAULT_CONFIG.llmModel,
    llmApiKey: props.llmApiKey ?? DEFAULT_CONFIG.llmApiKey,
    gatewayUrl: props.gatewayUrl ?? DEFAULT_CONFIG.gatewayUrl,
    gatewayMode: props.gatewayMode ?? DEFAULT_CONFIG.gatewayMode,
    theme: props.theme ?? DEFAULT_CONFIG.theme,
    serverUrl: props.serverUrl ?? DEFAULT_CONFIG.serverUrl,
  }

  const [values, setValues] = useState<ConfigValues>(initialValues)
  const [showApiKey, setShowApiKey] = useState(false)
  const [customModel, setCustomModel] = useState('')
  const [useCustomModel, setUseCustomModel] = useState(false)
  const [activeTab, setActiveTab] = useState<ConfigTab>(props.focusTab ?? 'models')
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(
    initialValues.gatewayMode !== 'direct' ? 'gateway' : 'direct'
  )
  const [directProvider, setDirectProvider] = useState<DirectProvider>(
    inferDirectProvider(initialValues.llmModel)
  )

  const updateField = useCallback(<K extends keyof ConfigValues>(key: K, value: ConfigValues[K]) => {
    setValues(prev => ({ ...prev, [key]: value }))
  }, [])

  const changedKeys = useMemo(() => {
    const keys: (keyof ConfigValues)[] = []
    for (const key of Object.keys(values) as (keyof ConfigValues)[]) {
      if (values[key] !== initialValues[key]) keys.push(key)
    }
    return keys
  }, [values, initialValues])

  const hasChanges = changedKeys.length > 0

  const handleSave = useCallback(() => {
    for (const key of changedKeys) {
      props.onOutput?.(key, values[key])
    }
    props.onEvent?.('config:saved', { changedKeys })
  }, [values, changedKeys, props])

  const handleClose = useCallback(() => {
    props.onEvent?.('config:closed', {})
  }, [props])

  const selectModel = useCallback((modelId: string) => {
    setUseCustomModel(false)
    updateField('llmModel', modelId)
  }, [updateField])

  const applyCustomModel = useCallback(() => {
    if (customModel.trim() && customModel.includes('/')) {
      updateField('llmModel', customModel.trim())
      setUseCustomModel(true)
    }
  }, [customModel, updateField])

  const selectTheme = useCallback((theme: Theme) => {
    updateField('theme', theme)
  }, [updateField])

  const selectGateway = useCallback((mode: GatewayMode) => {
    updateField('gatewayMode', mode)
    const preset = GATEWAY_OPTIONS.find(g => g.id === mode)
    if (preset?.defaultUrl) {
      updateField('gatewayUrl', preset.defaultUrl)
    }
  }, [updateField])

  const switchConnectionMode = useCallback((mode: ConnectionMode) => {
    setConnectionMode(mode)
    if (mode === 'gateway') {
      updateField('gatewayMode', 'openrouter')
      updateField('gatewayUrl', 'https://openrouter.ai/api/v1')
    } else {
      updateField('gatewayMode', 'direct')
      updateField('gatewayUrl', '')
    }
  }, [updateField])

  const selectDirectProvider = useCallback((p: DirectProvider) => {
    setDirectProvider(p)
    // Auto-select first matching model preset if current model doesn't match
    const currentModel = values.llmModel
    const matchesProvider = p === 'local'
      ? false
      : currentModel.startsWith(`${p}/`)
    if (!matchesProvider && p !== 'local') {
      const firstMatch = MODEL_PRESETS.find(preset => preset.directProvider === p)
      if (firstMatch) {
        setUseCustomModel(false)
        updateField('llmModel', firstMatch.id)
      }
    }
  }, [values.llmModel, updateField])

  const filteredModels = useMemo(() => {
    if (connectionMode === 'gateway') return MODEL_PRESETS
    return MODEL_PRESETS.filter(preset => preset.directProvider === directProvider)
  }, [connectionMode, directProvider])

  const maskApiKey = useCallback((key: string) => {
    if (!key) return ''
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••••••' + key.slice(-4)
  }, [])

  const selectedPreset = useMemo(() => {
    return MODEL_PRESETS.find(p => p.id === values.llmModel)
  }, [values.llmModel])

  const selectedGateway = useMemo(() => {
    return GATEWAY_OPTIONS.find(g => g.id === values.gatewayMode)
  }, [values.gatewayMode])

  return {
    values,
    showApiKey,
    setShowApiKey,
    customModel,
    setCustomModel,
    useCustomModel,
    updateField,
    hasChanges,
    handleSave,
    handleClose,
    selectModel,
    applyCustomModel,
    selectTheme,
    selectGateway,
    maskApiKey,
    selectedPreset,
    selectedGateway,
    activeTab,
    setActiveTab,
    connectionMode,
    directProvider,
    filteredModels,
    switchConnectionMode,
    selectDirectProvider,
  }
}
