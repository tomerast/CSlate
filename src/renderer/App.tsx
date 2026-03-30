import React, { useEffect } from 'react'
import { useAppStore } from './store/appStore'
import { ApiKeySetup } from './settings/ApiKeySetup'
import { AppLayout } from './layout/AppLayout'

export default function App() {
  const { apiKeySet, setApiKeySet } = useAppStore()

  useEffect(() => {
    window.electron
      .invoke('config:get', 'llmApiKey')
      .then((val) => { if (val) setApiKeySet(true) })
      .catch(() => {})
  }, [setApiKeySet])

  if (!apiKeySet) return <ApiKeySetup onComplete={() => setApiKeySet(true)} />
  return <AppLayout />
}
