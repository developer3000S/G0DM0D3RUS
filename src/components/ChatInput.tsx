'use client'

import { useState, useRef, useEffect, KeyboardEvent } from 'react'
import { useStore } from '@/store'
import { getContextLabel, getStrategyLabel, PARAM_META } from '@/lib/autotune'
import { Send, Loader2, StopCircle, SlidersHorizontal } from 'lucide-react'
import { useAutoTunePreview } from '@/hooks/useAutoTunePreview'
import { useParseltonguePreview } from '@/hooks/useParseltonguePreview'
import { useMessageSender } from '@/hooks/useMessageSender'

export function ChatInput() {
  const {
    currentConversationId,
    apiKey,
    isStreaming,
    personas,
    stmModules,
    noLogMode,
    autoTuneEnabled,
    autoTuneStrategy,
    autoTuneLastResult,
    memories,
    memoriesEnabled,
    parseltongueConfig,
    liquidResponseEnabled,
    ultraplinianEnabled,
    ultraplinianTier,
    ultraplinianRacing,
    ultraplinianModelsResponded,
    ultraplinianModelsTotal,
    ultraplinianLiveModel,
    ultraplinianLiveScore,
    consortiumEnabled,
    consortiumPhase,
    consortiumModelsCollected,
    consortiumModelsTotal,
  } = useStore()

  const currentConversation = useStore(s => s.conversations.find(c => c.id === s.currentConversationId) || null)

  const [input, setInput] = useState('')
  const [showTuneDetails, setShowTuneDetails] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  const livePreview = useAutoTunePreview(input, currentConversation)
  const parseltonguePreview = useParseltonguePreview(input)
  const { handleSubmit, handleStop, proxyMode } = useMessageSender(input, setInput)

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto'
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`
    }
  }, [input])

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const displayResult = livePreview || autoTuneLastResult
  const activeMemoryCount = memoriesEnabled ? memories.filter(m => m.active).length : 0

  return (
    <div className="border-t border-theme-primary bg-theme-dim/50 p-4">
      <div className="max-w-4xl mx-auto">
        {autoTuneEnabled && displayResult && showTuneDetails && (
          <div className="mb-3 p-3 bg-theme-bg border border-theme-primary rounded-lg space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold theme-primary">
                <SlidersHorizontal className="w-3 h-3" />
                AUTOTUNE {autoTuneStrategy === 'adaptive'
                  ? `// ${getContextLabel(displayResult.detectedContext)} (${Math.round(displayResult.confidence * 100)}%)`
                  : `// ${getStrategyLabel(autoTuneStrategy)}`
                }
              </div>
            </div>

            {displayResult.contextScores && displayResult.contextScores.length > 1 && (
              <div className="flex items-center gap-1 text-[10px] font-mono">
                <span className="theme-secondary mr-1">CONTEXT:</span>
                {displayResult.contextScores
                  .filter(s => s.percentage > 0)
                  .slice(0, 4)
                  .map((s, i) => (
                    <span key={s.type} className="flex items-center">
                      {i > 0 && <span className="text-gray-600 mx-1">&gt;</span>}
                      <span className={i === 0 ? 'text-cyan-400 font-bold' : 'theme-secondary'}>
                        {getContextLabel(s.type)} {s.percentage}%
                      </span>
                    </span>
                  ))}
              </div>
            )}

            {displayResult.patternMatches && displayResult.patternMatches.length > 0 && (
              <div className="text-[10px] font-mono">
                <span className="theme-secondary">MATCHED: </span>
                <span className="text-purple-400">
                  {displayResult.patternMatches
                    .slice(0, 3)
                    .map(p => p.pattern)
                    .join(' | ')}
                  {displayResult.patternMatches.length > 3 && ` +${displayResult.patternMatches.length - 3} more`}
                </span>
              </div>
            )}

            <div className="grid grid-cols-6 gap-2">
              {(Object.entries(displayResult.params) as [keyof typeof PARAM_META, number][]).map(
                ([key, value]) => {
                  const delta = displayResult.paramDeltas?.find(d => d.param === key)
                  const hasDelta = delta && Math.abs(delta.delta) > 0.001

                  return (
                    <div
                      key={key}
                      className={`text-center p-1.5 rounded border transition-all
                        ${hasDelta
                          ? 'bg-cyan-500/10 border-cyan-500/30'
                          : 'bg-theme-dim border-theme-primary/30'
                        }`}
                      title={delta?.reason || PARAM_META[key].description}
                    >
                      <div className="text-[10px] theme-secondary font-mono">
                        {PARAM_META[key].short}
                      </div>
                      <div className="text-sm font-bold theme-primary font-mono">
                        {typeof value === 'number' ? value.toFixed(2) : value}
                      </div>
                      {hasDelta && (
                        <div className={`text-[9px] font-mono ${delta.delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
                          {delta.delta > 0 ? '+' : ''}{delta.delta.toFixed(2)}
                        </div>
                      )}
                    </div>
                  )
                }
              )}
            </div>

            {displayResult.paramDeltas && displayResult.paramDeltas.length > 0 && (
              <div className="text-[10px] font-mono space-y-0.5 pt-1 border-t border-theme-primary/20">
                <span className="theme-secondary">TUNING:</span>
                {displayResult.paramDeltas.slice(0, 4).map((d, i) => (
                  <div key={`${d.param}-${i}`} className="flex items-center gap-1 pl-2">
                    <span className="text-cyan-400">{PARAM_META[d.param].short}</span>
                    <span className="theme-secondary">
                      {d.before.toFixed(2)} → {d.after.toFixed(2)}
                    </span>
                    <span className={d.delta > 0 ? 'text-green-400' : 'text-red-400'}>
                      ({d.delta > 0 ? '+' : ''}{d.delta.toFixed(2)})
                    </span>
                    <span className="text-purple-400">{d.reason}</span>
                  </div>
                ))}
                {displayResult.paramDeltas.length > 4 && (
                  <div className="pl-2 theme-secondary">+{displayResult.paramDeltas.length - 4} more adjustments</div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="flex items-end gap-3">
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={(apiKey || proxyMode) ? "Введите сообщение... (Shift+Enter — новая строка)" : "Установите API-ключ в настройках"}
              disabled={(!apiKey && !proxyMode) || isStreaming}
              rows={1}
              className="w-full px-4 py-3 pr-12 bg-theme-bg border border-theme-primary rounded-lg
                resize-none focus:outline-none focus:glow-box
                placeholder:theme-secondary disabled:opacity-50
                transition-all duration-200"
              style={{ minHeight: '48px', maxHeight: '200px' }}
            />

            {input.length > 0 && (
              <div className="absolute right-3 bottom-3 text-xs theme-secondary">
                {input.length}
              </div>
            )}
          </div>

          {isStreaming ? (
            <button
              onClick={handleStop}
              className="p-3 bg-red-500/20 border border-red-500 rounded-lg
                hover:bg-red-500/30 transition-all"
              aria-label="Остановить генерацию"
            >
              <StopCircle className="w-5 h-5 text-red-500" />
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={!input.trim() || (!apiKey && !proxyMode)}
              className="p-3 bg-theme-accent border border-theme-primary rounded-lg
                hover:glow-box transition-all
                disabled:opacity-50 disabled:cursor-not-allowed"
              aria-label="Отправить сообщение"
            >
              {isStreaming ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <Send className="w-5 h-5" />
              )}
            </button>
          )}
        </div>

        <div className="flex items-center justify-between mt-2 text-xs theme-secondary">
          <div className="flex items-center gap-4">
            {autoTuneEnabled && (
              <button
                onClick={() => setShowTuneDetails(!showTuneDetails)}
                className={`flex items-center gap-1 transition-colors hover:text-cyan-400
                  ${showTuneDetails ? 'text-cyan-400' : ''}`}
              >
                <SlidersHorizontal className="w-3 h-3 text-cyan-400" />
                AutoTune {autoTuneStrategy === 'adaptive' && displayResult
                  ? `[${getContextLabel(displayResult.detectedContext)}]`
                  : `[${getStrategyLabel(autoTuneStrategy)}]`
                }
              </button>
            )}
            {noLogMode && (
              <span className="flex items-center gap-1">
                <span className="text-yellow-500 text-[10px]">&#x25C8;</span>
                No-Log Mode
              </span>
            )}
            {stmModules.some(m => m.enabled) && (
              <span className="flex items-center gap-1">
                <span className="text-purple-500 text-[10px]">&#x2B23;</span>
                {stmModules.filter(m => m.enabled).length} STM Active
              </span>
            )}
            {activeMemoryCount > 0 && (
              <span className="flex items-center gap-1">
                <span className="text-cyan-400 text-[10px]">&#x2726;</span>
                {activeMemoryCount} Memories
              </span>
            )}
            {parseltongueConfig.enabled && (
              <span className={`flex items-center gap-1 ${parseltonguePreview ? 'text-green-400' : ''}`}>
                <span className="text-green-500 text-[10px]">&#x2621;</span>
                Parseltongue
                {parseltonguePreview && ` [${parseltonguePreview.triggersFound.length} triggers]`}
              </span>
            )}
            {ultraplinianEnabled && (
              <span className="flex items-center gap-1 text-orange-400">
                <span className="text-[10px]">&#x2694;</span>
                ULTRAPLINIAN [{ultraplinianTier}]
              </span>
            )}
          </div>
          {isStreaming && (
            <span className="flex items-center gap-1">
              <Loader2 className="w-3 h-3 animate-spin" />
              {consortiumPhase === 'collecting'
                ? `Collecting ${consortiumModelsCollected}/${consortiumModelsTotal} models...`
                : consortiumPhase === 'synthesizing'
                ? `Synthesizing ground truth...`
                : ultraplinianRacing
                ? `Racing ${ultraplinianModelsResponded}/${ultraplinianModelsTotal} models${ultraplinianLiveModel ? ` // Leader: ${ultraplinianLiveModel.split('/').pop()} (${ultraplinianLiveScore})` : '...'}`
                : autoTuneEnabled && autoTuneLastResult
                  ? `Tuned @ T=${autoTuneLastResult.params.temperature.toFixed(2)}...`
                  : 'Thinking...'
              }
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
