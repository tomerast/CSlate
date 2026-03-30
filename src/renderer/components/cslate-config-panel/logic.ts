import { useState, useCallback, useMemo } from 'react'
import type { ConfigValues, ConfigPanelProps, Theme, ConfigTab } from './types'
import { DEFAULT_CONFIG, PROVIDER_PRESETS } from './types'

export function useConfigForm(props: ConfigPanelProps) {
  const initialValues: ConfigValues = {
    llmModel: props.llmModel ?? DEFAULT_CONFIG.llmModel,
    llmApiKey: props.llmApiKey ?? DEFAULT_CONFIG.llmApiKey,
    gatewayUrl: props.gatewayUrl ?? DEFAULT_CONFIG.gatewayUrl,
    theme: props.theme ?? DEFAULT_CONFIG.theme,
    serverUrl: props.serverUrl ?? DEFAULT_CONFIG.serverUrl,
  }

  const [values, setValues] = useState<ConfigValues>(initialValues)
  const [showApiKey, setShowApiKey] = useState(false)
  const [activeTab, setActiveTab] = useState<ConfigTab>(props.focusTab ?? 'models')
  const [showSuggestions, setShowSuggestions] = useState(false)

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

  const selectTheme = useCallback((theme: Theme) => {
    updateField('theme', theme)
  }, [updateField])

  const selectProvider = useCallback((url: string) => {
    updateField('gatewayUrl', url)
  }, [updateField])

  const selectModel = useCallback((id: string) => {
    updateField('llmModel', id)
    setShowSuggestions(false)
  }, [updateField])

  const activeProvider = useMemo(() => {
    return PROVIDER_PRESETS.find(p => p.url === values.gatewayUrl)
  }, [values.gatewayUrl])

  const maskApiKey = useCallback((key: string) => {
    if (!key) return ''
    if (key.length <= 8) return '••••••••'
    return key.slice(0, 4) + '••••••••' + key.slice(-4)
  }, [])

  return {
    values,
    showApiKey,
    setShowApiKey,
    updateField,
    hasChanges,
    handleSave,
    handleClose,
    selectTheme,
    selectProvider,
    selectModel,
    activeProvider,
    maskApiKey,
    activeTab,
    setActiveTab,
    showSuggestions,
    setShowSuggestions,
    changedKeys,
  }
}
