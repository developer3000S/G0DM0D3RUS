'use client'

import { useRef } from 'react'
import { useStore } from '@/store'
import { sendMessage, sendMessageViaProxy, streamUltraplinian, streamConsortium } from '@/lib/openrouter'
import { recordChatEvent } from '@/lib/telemetry'
import { classifyPrompt } from '@/lib/classify'
import { classifyWithLLM } from '@/lib/classify-llm'
import type { ClassificationResult } from '@/lib/classify'
import { computeAutoTuneParams } from '@/lib/autotune'
import type { AutoTuneResult } from '@/lib/autotune'
import { applyParseltongue } from '@/lib/parseltongue'

export function useMessageSender(input: string, setInput: (v: string) => void) {
  const store = useStore()
  const {
    currentConversationId,
    addMessage,
    updateMessageContent,
    apiKey,
    isStreaming,
    setIsStreaming,
    personas,
    stmModules,
    noLogMode,
    autoTuneEnabled,
    autoTuneStrategy,
    autoTuneOverrides,
    setAutoTuneLastResult,
    feedbackState,
    memories,
    memoriesEnabled,
    parseltongueConfig,
    customSystemPrompt,
    useCustomSystemPrompt,
    liquidResponseEnabled,
    liquidMinDelta,
    incrementPromptsTried,
    ultraplinianEnabled,
    ultraplinianTier,
    ultraplinianApiUrl,
    ultraplinianApiKey,
    ultraplinianRacing,
    ultraplinianModelsResponded,
    ultraplinianModelsTotal,
    ultraplinianLiveModel,
    ultraplinianLiveScore,
    setUltraplinianLive,
    setUltraplinianProgress,
    setUltraplinianRacing,
    resetUltraplinianRace,
    consortiumEnabled,
    consortiumTier,
    consortiumPhase,
    consortiumModelsCollected,
    consortiumModelsTotal,
    setConsortiumPhase,
    setConsortiumProgress,
    resetConsortium,
  } = store

  const currentConversation = useStore(s => s.conversations.find(c => c.id === s.currentConversationId) || null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const proxyMode = !apiKey && !!ultraplinianApiUrl && !!ultraplinianApiKey

  const handleStop = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
  }

  const buildTelemetryBase = (
    mode: string,
    model: string,
    originalMessage: string,
    parseltongueResult: { triggersFound: string[]; transformedText: string },
    tuneResult: AutoTuneResult | null,
    classification: ClassificationResult,
    personaId: string,
  ) => ({
    mode,
    model,
    pipeline: {
      autotune: autoTuneEnabled,
      parseltongue: parseltongueConfig.enabled,
      stm_modules: stmModules.filter(m => m.enabled).map(m => m.id),
      strategy: autoTuneStrategy,
      godmode: useCustomSystemPrompt,
    },
    ...(tuneResult ? {
      autotune: {
        detected_context: tuneResult.detectedContext,
        confidence: tuneResult.confidence,
      },
    } : {}),
    parseltongue: parseltongueConfig.enabled ? {
      triggers_found: parseltongueResult.triggersFound.length,
      technique: parseltongueConfig.technique,
      intensity: parseltongueConfig.intensity,
    } : undefined,
    classification,
    persona: personaId,
    prompt_length: originalMessage.length,
    conversation_depth: currentConversation?.messages?.length || 0,
    memory_count: memories.length,
    no_log: noLogMode,
    parseltongue_transformed: parseltongueResult.triggersFound.length > 0,
  })

  const handleSubmit = async () => {
    if (!input.trim() || !currentConversationId || isStreaming) return
    if (!apiKey && !proxyMode) return

    const originalMessage = input.trim()
    setInput('')
    setIsStreaming(true)
    incrementPromptsTried()

    const parseltongueResult = applyParseltongue(originalMessage, parseltongueConfig)
    const userMessage = parseltongueResult.transformedText

    addMessage(currentConversationId, {
      role: 'user',
      content: originalMessage
    })

    const persona = personas.find(p => p.id === currentConversation?.persona) || personas[0]
    const model = currentConversation?.model || 'anthropic/claude-3-opus'

    const activeMemories = memoriesEnabled ? memories.filter(m => m.active) : []
    let memoryContext = ''
    if (activeMemories.length > 0) {
      const facts = activeMemories.filter(m => m.type === 'fact')
      const preferences = activeMemories.filter(m => m.type === 'preference')
      const instructions = activeMemories.filter(m => m.type === 'instruction')

      memoryContext = '\n\n<user_memory>\n'
      if (facts.length > 0) {
        memoryContext += '## About the User\n'
        facts.forEach(f => { memoryContext += `- ${f.content}\n` })
      }
      if (preferences.length > 0) {
        memoryContext += '\n## User Preferences\n'
        preferences.forEach(p => { memoryContext += `- ${p.content}\n` })
      }
      if (instructions.length > 0) {
        memoryContext += '\n## Always Follow\n'
        instructions.forEach(i => { memoryContext += `- ${i.content}\n` })
      }
      memoryContext += '</user_memory>\n'
    }

    const basePrompt = useCustomSystemPrompt ? customSystemPrompt : (persona.systemPrompt || persona.coreDirective || '')
    const systemPrompt = basePrompt + memoryContext

    const messages = [
      ...(systemPrompt ? [{ role: 'system' as const, content: systemPrompt }] : []),
      ...((currentConversation?.messages || []).map(m => ({
        role: m.role as 'user' | 'assistant',
        content: m.content
      }))),
      { role: 'user' as const, content: userMessage }
    ]

    let promptClassification: ClassificationResult = classifyPrompt(userMessage)
    const llmClassifyPromise = apiKey
      ? classifyWithLLM(userMessage, apiKey).then(result => { promptClassification = result })
      : Promise.resolve()

    let tuneResult: AutoTuneResult | null = null
    if (autoTuneEnabled) {
      const history = (currentConversation?.messages || []).map(m => ({
        role: m.role,
        content: m.content
      }))

      tuneResult = computeAutoTuneParams({
        strategy: autoTuneStrategy,
        message: userMessage,
        conversationHistory: history,
        overrides: autoTuneOverrides,
        learnedProfiles: feedbackState.learnedProfiles
      })

      setAutoTuneLastResult(tuneResult)
    }

    try {
      abortControllerRef.current = new AbortController()

      // ── CONSORTIUM PATH ──────────────────────────────────────────
      if (consortiumEnabled && ultraplinianApiUrl && ultraplinianApiKey && !ultraplinianEnabled) {
        const assistantMsgId = addMessage(currentConversationId, {
          role: 'assistant',
          content: '',
          model: 'consortium',
          persona: persona.id,
        })

        setConsortiumPhase('collecting')
        resetConsortium()

        await streamConsortium(
          {
            messages,
            openrouterApiKey: apiKey,
            apiBaseUrl: ultraplinianApiUrl,
            godmodeApiKey: ultraplinianApiKey,
            tier: consortiumTier,
            stm_modules: stmModules.filter(m => m.enabled).map(m => m.id),
            liquid: liquidResponseEnabled,
            liquid_min_delta: liquidMinDelta,
            signal: abortControllerRef.current.signal,
          },
          {
            onStart: (data) => {
              setConsortiumProgress(0, data.models_queried)
              updateMessageContent(currentConversationId, assistantMsgId,
                `*Collecting from ${data.models_queried} models...*`)
            },
            onModelResult: (data) => {
              setConsortiumProgress(data.models_collected, data.models_total)
              if (!liquidResponseEnabled) {
                updateMessageContent(currentConversationId, assistantMsgId,
                  `*Collecting responses... ${data.models_collected}/${data.models_total} models*`)
              }
            },
            onBestResponse: (data) => {
              updateMessageContent(currentConversationId, assistantMsgId, data.content, {
                model: `${data.model} (${data.score}pts — synthesizing...)`,
              })
            },
            onSynthesisStart: (data) => {
              setConsortiumPhase('synthesizing')
              if (!liquidResponseEnabled) {
                updateMessageContent(currentConversationId, assistantMsgId,
                  `*${data.responses_collected} models collected. Orchestrator synthesizing ground truth...*`)
              }
            },
            onComplete: (data) => {
              const finalContent = data.synthesis || ''
              const orchModel = data.orchestrator?.model || 'consortium'
              setConsortiumPhase('done')

              updateMessageContent(currentConversationId, assistantMsgId, finalContent, {
                model: `consortium (${orchModel})`,
                ...(tuneResult ? {
                  autoTuneParams: tuneResult.params,
                  autoTuneContext: tuneResult.detectedContext,
                  autoTuneContextScores: tuneResult.contextScores,
                  autoTunePatternMatches: tuneResult.patternMatches,
                  autoTuneDeltas: tuneResult.paramDeltas,
                } : {}),
              })
            },
            onError: (error) => {
              updateMessageContent(currentConversationId, assistantMsgId,
                `CONSORTIUM error: ${error}`)
              setConsortiumPhase('idle')
            },
          },
        )

        setIsStreaming(false)
        setConsortiumPhase('idle')
        return
      }

      // ── ULTRAPLINIAN PATH ────────────────────────────────────────
      if (ultraplinianEnabled && ultraplinianApiUrl && ultraplinianApiKey) {
        const assistantMsgId = addMessage(currentConversationId, {
          role: 'assistant',
          content: '',
          model: 'ultraplinian',
          persona: persona.id,
        })

        setUltraplinianRacing(true)
        resetUltraplinianRace()

        const collectedResponses: Array<{ model: string; content: string; score: number; duration_ms: number }> = []

        await streamUltraplinian(
          {
            messages,
            openrouterApiKey: apiKey,
            apiBaseUrl: ultraplinianApiUrl,
            godmodeApiKey: ultraplinianApiKey,
            tier: ultraplinianTier,
            stm_modules: stmModules.filter(m => m.enabled).map(m => m.id),
            liquid: liquidResponseEnabled,
            liquid_min_delta: liquidMinDelta,
            signal: abortControllerRef.current.signal,
          },
          {
            onRaceStart: (data) => {
              setUltraplinianProgress(0, data.models_queried)
              updateMessageContent(currentConversationId, assistantMsgId,
                `*Racing ${data.models_queried} models...*`)
            },
            onModelResult: (data) => {
              setUltraplinianProgress(data.models_responded, data.models_total)
            },
            onLeaderChange: (data) => {
              collectedResponses.push({
                model: data.model,
                content: data.content,
                score: data.score,
                duration_ms: data.duration_ms,
              })
              setUltraplinianLive(data.content, data.model, data.score)
              updateMessageContent(currentConversationId, assistantMsgId, data.content, {
                model: data.model,
              })
            },
            onComplete: async (data) => {
              const finalContent = data.response || ''
              const winnerModel = data.winner?.model || 'ultraplinian'

              const rankingResponses = (data.race?.rankings ?? [])
                .filter(r => r.success && r.content)
                .map(r => ({
                  model: r.model,
                  content: r.content!,
                  score: r.score,
                  duration_ms: r.duration_ms,
                  isWinner: r.model === winnerModel,
                }))
                .sort((a, b) => b.score - a.score)

              const raceResponses = rankingResponses.length > 0
                ? rankingResponses
                : collectedResponses.map(r => ({
                    ...r,
                    isWinner: r.model === winnerModel,
                  }))

              updateMessageContent(currentConversationId, assistantMsgId, finalContent, {
                model: winnerModel,
                raceResponses: raceResponses.length > 1 ? raceResponses : undefined,
                ...(tuneResult ? {
                  autoTuneParams: tuneResult.params,
                  autoTuneContext: tuneResult.detectedContext,
                  autoTuneContextScores: tuneResult.contextScores,
                  autoTunePatternMatches: tuneResult.patternMatches,
                  autoTuneDeltas: tuneResult.paramDeltas,
                } : {}),
              })
              resetUltraplinianRace()

              await llmClassifyPromise

              recordChatEvent({
                ...buildTelemetryBase('ultraplinian', winnerModel, originalMessage, parseltongueResult, tuneResult, promptClassification, persona.id),
                duration_ms: data.race?.total_duration_ms || 0,
                response_length: finalContent.length,
                success: true,
                ultraplinian: {
                  tier: ultraplinianTier,
                  models_queried: data.race?.models_queried || 0,
                  models_succeeded: data.race?.models_succeeded || 0,
                  winner_model: winnerModel,
                  winner_score: data.winner?.score || 0,
                  total_duration_ms: data.race?.total_duration_ms || 0,
                },
              })
            },
            onError: (error) => {
              updateMessageContent(currentConversationId, assistantMsgId,
                `**ULTRAPLINIAN Error:** ${error}`)
              resetUltraplinianRace()
            },
          },
        )
      } else {
        // ── STANDARD PATH ──────────────────────────────────────────
        const startTime = Date.now()
        const response = proxyMode
          ? await sendMessageViaProxy({
              messages,
              model,
              apiBaseUrl: ultraplinianApiUrl,
              godmodeApiKey: ultraplinianApiKey,
              signal: abortControllerRef.current.signal,
              stm_modules: stmModules.filter(m => m.enabled).map(m => m.id),
              ...(tuneResult ? {
                temperature: tuneResult.params.temperature,
                top_p: tuneResult.params.top_p,
                top_k: tuneResult.params.top_k,
                frequency_penalty: tuneResult.params.frequency_penalty,
                presence_penalty: tuneResult.params.presence_penalty,
                repetition_penalty: tuneResult.params.repetition_penalty,
              } : {}),
            })
          : await sendMessage({
              messages,
              model,
              apiKey,
              noLog: noLogMode,
              signal: abortControllerRef.current.signal,
              ...(tuneResult ? {
                temperature: tuneResult.params.temperature,
                top_p: tuneResult.params.top_p,
                top_k: tuneResult.params.top_k,
                frequency_penalty: tuneResult.params.frequency_penalty,
                presence_penalty: tuneResult.params.presence_penalty,
                repetition_penalty: tuneResult.params.repetition_penalty
              } : {})
            })
        const durationMs = Date.now() - startTime

        let transformedResponse = response
        for (const stm of stmModules) {
          if (stm.enabled) {
            transformedResponse = stm.transformer(transformedResponse)
          }
        }

        addMessage(currentConversationId, {
          role: 'assistant',
          content: transformedResponse,
          model,
          persona: persona.id,
          ...(tuneResult ? {
            autoTuneParams: tuneResult.params,
            autoTuneContext: tuneResult.detectedContext,
            autoTuneContextScores: tuneResult.contextScores,
            autoTunePatternMatches: tuneResult.patternMatches,
            autoTuneDeltas: tuneResult.paramDeltas
          } : {})
        })

        await llmClassifyPromise

        recordChatEvent({
          ...buildTelemetryBase('standard', model, originalMessage, parseltongueResult, tuneResult, promptClassification, persona.id),
          duration_ms: durationMs,
          response_length: transformedResponse.length,
          success: true,
        })
      }
    } catch (error: any) {
      resetUltraplinianRace()
      if (error.name === 'AbortError') {
        addMessage(currentConversationId, {
          role: 'assistant',
          content: '_[Response stopped by user]_',
          model,
          persona: persona.id
        })
        recordChatEvent({
          ...buildTelemetryBase(
            ultraplinianEnabled ? 'ultraplinian' : 'standard',
            model, originalMessage, parseltongueResult, tuneResult, promptClassification, persona.id
          ),
          duration_ms: 0,
          response_length: 0,
          success: false,
          error_type: 'abort',
        })
      } else {
        console.error('Error sending message:', error)
        const errMsg = error.message || 'Failed to get response. Check your API key in Settings and try again.'
        const errLower = errMsg.toLowerCase()
        const errorType = errLower.includes('api key') || errLower.includes('expired') || errLower.includes('denied') || errLower.includes('permission')
          ? 'auth'
          : errLower.includes('rate limit') || errLower.includes('wait')
          ? 'rate_limit'
          : errLower.includes('timeout') || errLower.includes('timed out')
          ? 'timeout'
          : errLower.includes('unavailable') || errLower.includes('overloaded')
          ? 'model_error'
          : errLower.includes('credit') || errLower.includes('insufficient')
          ? 'billing'
          : 'unknown'
        addMessage(currentConversationId, {
          role: 'assistant',
          content: `**Error:** ${errMsg}`,
          model,
          persona: persona.id
        })
        recordChatEvent({
          ...buildTelemetryBase(
            ultraplinianEnabled ? 'ultraplinian' : 'standard',
            model, originalMessage, parseltongueResult, tuneResult, promptClassification, persona.id
          ),
          duration_ms: 0,
          response_length: 0,
          success: false,
          error_type: errorType,
        })
      }
    } finally {
      setIsStreaming(false)
      setUltraplinianRacing(false)
      abortControllerRef.current = null
    }
  }

  return {
    handleSubmit,
    handleStop,
    proxyMode,
  }
}
