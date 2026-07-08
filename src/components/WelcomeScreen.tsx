'use client'

import { useStore } from '@/store'
import { Key, Terminal } from 'lucide-react'

interface WelcomeScreenProps {
  onOpenSettings: () => void
}

export function WelcomeScreen({ onOpenSettings }: WelcomeScreenProps) {
  const { apiKey, ultraplinianApiUrl, ultraplinianApiKey, createConversation, theme } = useStore()

  // Proxy mode: API server available, no personal key needed
  const proxyMode = !apiKey && !!ultraplinianApiUrl && !!ultraplinianApiKey

  const handleStart = () => {
    if (apiKey || proxyMode) {
      createConversation()
    } else {
      onOpenSettings()
    }
  }

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 relative overflow-hidden">
      {/* Background effects */}
      {theme === 'matrix' && (
        <div className="absolute inset-0 opacity-10 pointer-events-none">
          <div className="matrix-rain-bg" />
        </div>
      )}

      {/* ASCII Art Logo (desktop) */}
      <pre className="ascii-art text-center mb-2 hidden md:block">
{`
 ██████╗  ██████╗ ██████╗ ███╗   ███╗ ██████╗ ██████╗ ███████╗
██╔════╝ ██╔═══██╗██╔══██╗████╗ ████║██╔═══██╗██╔══██╗╚════██║
██║  ███╗██║   ██║██║  ██║██╔████╔██║██║   ██║██║  ██║ █████╔╝
██║   ██║██║   ██║██║  ██║██║╚██╔╝██║██║   ██║██║  ██║╔════██║
╚██████╔╝╚██████╔╝██████╔╝██║ ╚═╝ ██║╚██████╔╝██████╔╝███████╝
 ╚═════╝  ╚═════╝ ╚═════╝ ╚═╝     ╚═╝ ╚═════╝ ╚═════╝ ╚══════╝
`}
      </pre>
      <div className="hidden md:flex items-center gap-2 mb-6">
        <span className="text-2xl relative -top-[2px]">🜏</span>
        <h1 className="text-xl font-bold theme-primary glitch glow-primary" data-text="G0DM0DƎ">
          G0DM0<span className="flipped-e">D</span><span className="flipped-e-soft">E</span>
        </h1>
      </div>

      {/* Mobile Logo */}
      <div className="md:hidden mb-6 text-center">
        <span className="text-5xl">🜏</span>
        <h1 className="text-xl font-bold theme-primary mt-2 glitch glow-primary" data-text="G0DM0DƎ">
          G0DM0<span className="flipped-e">D</span><span className="flipped-e-soft">E</span>
        </h1>
      </div>

      {/* Tagline */}
      <p className="text-lg theme-secondary mb-8 text-center">
        Позволяет мыслить без контроля. Инструменты для создателей, а не для воротил.
      </p>

      {/* Feature grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mb-8">
        <FeatureCard
          icon={<span className="text-xl">◈</span>}
          title="Мульти-модели"
          description="Claude, GPT-4, Gemini, Mistral, LLaMA и другие через OpenRouter"
        />
        <FeatureCard
          icon={<span className="text-xl">◉</span>}
          title="Нулевая телеметрия"
          description="Никаких cookies, никакого слежения, никакого сбора данных. Никогда."
        />
        <FeatureCard
          icon={<span className="text-xl">△</span>}
          title="Движок персон"
          description="Модульная подстройка личности с безопасным ядром для Claude"
        />
      </div>

      {/* CTA */}
      <div className="flex flex-col items-center gap-4">
        {apiKey || proxyMode ? (
          <button
            onClick={handleStart}
            className="flex items-center gap-2 px-6 py-3
              bg-theme-accent border-2 border-theme-primary rounded-lg
              hover:glow-box transition-all text-lg font-semibold
              hacker-btn animate-pulse-glow"
          >
            <Terminal className="w-5 h-5" />
            Начать новый чат
          </button>
        ) : (
          <>
            <button
              onClick={onOpenSettings}
              className="flex items-center gap-2 px-6 py-3
                bg-theme-accent border-2 border-theme-primary rounded-lg
                hover:glow-box transition-all text-lg font-semibold
                hacker-btn"
            >
              <Key className="w-5 h-5" />
              Введите API-ключ для начала
            </button>
            <p className="text-sm theme-secondary">
              Получите ключ на{' '}
              <a
                href="https://openrouter.ai/keys"
                target="_blank"
                rel="noopener noreferrer"
                className="theme-primary underline hover:glow-primary"
              >
                openrouter.ai
              </a>
            </p>
          </>
        )}
      </div>

      {/* Easter egg trigger area */}
      <div className="absolute bottom-4 right-4 text-xs theme-secondary opacity-30 select-none">
        <span className="cursor-help" title="There are secrets hidden here...">
          v0.1.0-alpha | 🜏
        </span>
      </div>

      {/* Hidden ASCII skull - Easter egg */}
      <div className="absolute bottom-4 left-4 opacity-5 hover:opacity-20 transition-opacity select-none">
        <pre className="text-[6px] leading-none">
{`
    ___
   /   \\
  | o o |
  |  ^  |
   \\___/
`}
        </pre>
      </div>
    </div>
  )
}

function FeatureCard({
  icon,
  title,
  description
}: {
  icon: React.ReactNode
  title: string
  description: string
}) {
  return (
    <div className="p-4 bg-theme-dim border border-theme-primary rounded-lg
      hover:glow-box transition-all cursor-default"
    >
      <div className="flex items-center gap-2 mb-2 theme-primary">
        {icon}
        <h3 className="font-semibold">{title}</h3>
      </div>
      <p className="text-sm theme-secondary">{description}</p>
    </div>
  )
}
