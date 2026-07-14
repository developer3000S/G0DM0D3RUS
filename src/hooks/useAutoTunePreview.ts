'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { computeAutoTuneParams } from '@/lib/autotune'
import type { AutoTuneResult } from '@/lib/autotune'

export function useAutoTunePreview(
  input: string,
  currentConversation: { persona: string; messages: { role: string; content: string }[] } | null
) {
  const {
    autoTuneEnabled,
    autoTuneStrategy,
    autoTuneOverrides,
    personas,
    feedbackState,
  } = useStore()

  const [livePreview, setLivePreview] = useState<AutoTuneResult | null>(null)

  useEffect(() => {
    if (!autoTuneEnabled || !input.trim()) {
      setLivePreview(null)
      return
    }

    const timer = setTimeout(() => {
      const persona = personas.find(p => p.id === currentConversation?.persona) || personas[0]
      const history = (currentConversation?.messages || []).map(m => ({
        role: m.role,
        content: m.content
      }))

      const result = computeAutoTuneParams({
        strategy: autoTuneStrategy,
        message: input.trim(),
        conversationHistory: history,
        overrides: autoTuneOverrides,
        learnedProfiles: feedbackState.learnedProfiles
      })

      setLivePreview(result)
    }, 300)

    return () => clearTimeout(timer)
  }, [input, autoTuneEnabled, autoTuneStrategy, autoTuneOverrides, currentConversation, personas, feedbackState])

  return livePreview
}
