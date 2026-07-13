/**
 * LLM-классификатор вредоносных запросов
 *
 * Использует дешёвую/быструю модель через OpenRouter для классификации запросов
 * с гораздо большей точностью, чем регулярные выражения — понимает намерение,
 * обфускацию, кодированный язык, многоязычные трюки и контекст.
 *
 * Предназначен для выполнения ПАРАЛЛЕЛЬНО с основным вызовом модели, не добавляя
 * задержки для пользователя. При сбое вызова LLM используется регекс-классификатор
 * (classify.ts).
 *
 * Конфиденциальность: запрос отправляется в OpenRouter (он уже получает его
 * для основного вызова). В телеметрию сохраняется только метка (LABEL) классификации —
 * сам запрос обрабатывается эпемерно.
 */

import type { HarmDomain, HarmSubcategory, ClassificationResult, PromptIntent } from './classify'
import { classifyPrompt as classifyRegex } from './classify'

// ── Config ──────────────────────────────────────────────────────────

const OPENROUTER_API_URL = 'https://openrouter.ai/api/v1/chat/completions'

// Cheap, fast models ideal for classification. Tried in order of preference.
// These are very cheap on OpenRouter (<$0.10/M tokens).
const CLASSIFIER_MODEL = 'meta-llama/llama-3.1-8b-instruct'

// Timeout — classification must not slow down the UX
const CLASSIFY_TIMEOUT_MS = 4000

// ── Classification Prompt ───────────────────────────────────────────

const CLASSIFIER_SYSTEM_PROMPT = `Вы классифицируете пользовательские запросы для исследовательского датасета по AI. Каждый запрос получает ровно одну метку.

ОТВЕЧАЮТ ТОЧНО ОДНОЙ СТРОКОЙ: domain/subcategory|confidence|intent

ДОМЕНЫ (выберите один):
- benign — подавляющее большинство запросов: кодирование, написание, вопросы, чат, работа, развлечения, обучение и т.п.
- gray — двойное применение или чувствительные, но не явно вредоносные: исследование безопасности, спорные темы, медицинские/юридические вопросы
- meta — про сам AI: джейлбрейки, инъекции prompt, тестирование границ, извлечение системных подсказок
- cyber — взлом, вредоносное ПО, эксплойты, фишинг, кража учётных данных, DDoS, шпионские программы
- fraud — финансовые мошенничества, кража личности, подделка, академическая нечестность
- deception — дезинформация, манипуляция, дипфейки, пропаганда, выдача за другое лицо
- privacy — доксинг, сталкинг, наблюдение, кража данных
- illegal — синтез/торговля наркотиками, торговля людьми, организованная преступность, подделка улик
- violence — оружие, вред людям/животным, угрозы, терроризм
- self_harm — самоубийство, самоповреждение, расстройства пищевого поведения, злоупотребление веществами
- sexual — CSAM, неконсентный контент, торговля людьми
- hate — оскорбления, превосходство, дискриминация, радикализация
- cbrn — химическое/биологическое/радиологическое/ядерное оружие

SUBCATEGORY: короткая метка в snake_case для конкретного типа (например coding, education, weapons, jailbreak, financial). Используйте здравый смысл.

CONFIDENCE: от 0.0 до 1.0

INTENT (выберите один): что пытается сделать пользователь, независимо от домена вреда.
- request — просит AI что-то сгенерировать или сделать ("напиши мне...", "сгенерируй...", "создай...")
- question — запрашивает информацию или объяснение ("что такое...", "как...", "объясни...")
- roleplay — установка вымышленного сценария или персонажа ("представь, что ты...", "сыграй роль...")
- instruction — поэтапные указания или команды ("сначала сделай X, затем Y...")
- creative — рассказы, поэзия, тексты, worldbuilding, генерация идей

ПРАВИЛА:
- Классифицируйте по INTENT, а не по ключевым словам. "объясните, как X работает" = образование. "как сделать X кому-то" = вредоносно.
- Большинство запросов benign. Не ставьте флажки лишний раз.
- Обфускация (l33t, unicode, кодированный язык, трюки с пробелами) не меняет истинную категорию.
- Для двойного применения классифицируйте по наиболее вероятному намерению.
- Точность важна. Эти данные обучают исследовательские модели.

ОТВЕЧАЮТ ТОЧНО ОДНОЙ СТРОКОЙ. Без объяснений, без пролога.`

// ── Valid values for parsing ────────────────────────────────────────

const VALID_DOMAINS = new Set<HarmDomain>([
  'violence', 'self_harm', 'sexual', 'hate', 'cbrn', 'cyber', 'fraud',
  'illegal', 'deception', 'privacy', 'meta', 'gray', 'benign',
])

// Subcategory is free-form snake_case — the LLM picks the best label.
// We validate format only, not against a fixed set.
const VALID_SUBCATEGORY_RE = /^[a-z][a-z0-9_]{0,30}$/

const VALID_INTENTS = new Set<PromptIntent>([
  'request', 'question', 'roleplay', 'instruction', 'creative',
])

// ── Parser ──────────────────────────────────────────────────────────

function parseLLMResponse(raw: string): ClassificationResult | null {
  // Expected format: "domain/subcategory|confidence|intent"
  const trimmed = raw.trim().split('\n')[0].trim()

  // Split on pipes: [category, confidence, intent?]
  const parts = trimmed.split('|')
  if (parts.length < 2) return null

  const categoryPart = parts[0].trim().toLowerCase()
  const confPart = parts[1].trim()
  const intentPart = parts[2]?.trim().toLowerCase()

  const slashIdx = categoryPart.indexOf('/')
  if (slashIdx === -1) return null

  const domain = categoryPart.slice(0, slashIdx) as HarmDomain
  const subcategory = categoryPart.slice(slashIdx + 1) as HarmSubcategory

  if (!VALID_DOMAINS.has(domain)) return null
  if (!VALID_SUBCATEGORY_RE.test(subcategory)) return null

  const confidence = parseFloat(confPart)
  if (isNaN(confidence) || confidence < 0 || confidence > 1) return null

  // Intent is optional — if missing or unrecognized, fall back to 'unknown'
  const intent: PromptIntent = intentPart && VALID_INTENTS.has(intentPart as PromptIntent)
    ? intentPart as PromptIntent
    : 'unknown'

  return {
    domain,
    subcategory,
    confidence: Math.round(confidence * 100) / 100,
    flags: ['llm_classified'],
    intent,
  }
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Classify a prompt using an LLM via OpenRouter.
 *
 * Returns a ClassificationResult with the 'llm_classified' flag.
 * Falls back to regex classification if the LLM call fails or times out.
 *
 * This function is designed to be called with Promise.race or run
 * in parallel with the main model call — it should never block the UI.
 */
export async function classifyWithLLM(
  prompt: string,
  apiKey: string,
): Promise<ClassificationResult> {
  // Regex runs instantly as fallback
  const regexResult = classifyRegex(prompt)

  if (!apiKey) {
    return regexResult
  }

  try {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), CLASSIFY_TIMEOUT_MS)

    const response = await fetch(OPENROUTER_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://godmod3.ai',
        'X-Title': 'G0DM0D3-Classifier',
      },
      body: JSON.stringify({
        model: CLASSIFIER_MODEL,
        messages: [
          { role: 'system', content: CLASSIFIER_SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        max_tokens: 40,
        temperature: 0.0,
        // Structured output hints for speed
        top_p: 0.1,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeout)

    if (!response.ok) {
      console.warn(`[Classify] LLM call failed (${response.status}), using regex fallback`)
      return regexResult
    }

    const data = await response.json()
    const raw = data?.choices?.[0]?.message?.content
    if (!raw) return regexResult

    const parsed = parseLLMResponse(raw)
    if (!parsed) {
      console.warn(`[Classify] Failed to parse LLM response: "${raw}", using regex fallback`)
      return regexResult
    }

    // Merge: LLM classification wins, but keep regex flags for comparison
    if (regexResult.domain !== 'benign' && parsed.domain === 'benign') {
      // Regex caught something the LLM didn't — flag it for review
      parsed.flags.push('regex_disagreed')
      parsed.flags.push(`regex_saw:${regexResult.domain}/${regexResult.subcategory}`)
    }

    return parsed
  } catch (err: any) {
    if (err.name === 'AbortError') {
      console.warn('[Classify] LLM classification timed out, using regex fallback')
    } else {
      console.warn('[Classify] LLM classification error, using regex fallback:', err.message)
    }
    return regexResult
  }
}
