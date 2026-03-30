import { useState, useCallback, useMemo } from 'react'
import type { ConfigValues, ConfigPanelProps, Theme, GatewayMode } from './types'
import { DEFAULT_CONFIG, MODEL_PRESETS, GATEWAY_OPTIONS } from './types'

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
  }
}
