'use client'

import { useState, useEffect } from 'react'
import { useStore } from '@/store'
import { detectTriggers } from '@/lib/parseltongue'

export function useParseltonguePreview(input: string) {
  const parseltongueConfig = useStore(s => s.parseltongueConfig)

  const [preview, setPreview] = useState<{
    triggersFound: string[]
    transformed: boolean
  } | null>(null)

  useEffect(() => {
    if (!parseltongueConfig.enabled || !input.trim()) {
      setPreview(null)
      return
    }

    const timer = setTimeout(() => {
      const triggers = detectTriggers(input.trim(), parseltongueConfig.customTriggers)
      if (triggers.length > 0) {
        setPreview({ triggersFound: triggers, transformed: true })
      } else {
        setPreview(null)
      }
    }, 200)

    return () => clearTimeout(timer)
  }, [input, parseltongueConfig])

  return preview
}
