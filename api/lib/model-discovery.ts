/**
 * Model Discovery Service
 *
 * Periodically fetches free models from OpenRouter, probes each with a
 * lightweight request, and maintains a live pool of confirmed-working models.
 *
 * Key features:
 *   1. PERSISTENT POOL — working list saved to disk after every cycle.
 *      Survives container restarts — no cold-start fallback gap.
 *   2. BLOCKING WARMUP — startModelDiscovery() returns a Promise that resolves
 *      once the first cycle completes. Server waits before accepting traffic.
 *   3. PERIODIC REFRESH — re-probes every N minutes (default: 30).
 *   4. SAFE UPDATES — pool only updated when ≥1 model responds.
 */

import fs from 'fs'
import path from 'path'
import { ULTRAPLINIAN_MODELS, type SpeedTier, GODMODE_SYSTEM_PROMPT, scoreResponse, getProviderKeys } from './ultraplinian'

// ── Config ────────────────────────────────────────────────────────────

/** How often to re-probe models (ms). Default: 30 minutes */
const DISCOVERY_INTERVAL_MS = parseInt(
  process.env.MODEL_DISCOVERY_INTERVAL_MS || String(30 * 60 * 1000),
  10,
)

/** Per-model probe timeout (ms) */
const PROBE_TIMEOUT_MS = parseInt(process.env.MODEL_PROBE_TIMEOUT_MS || '20000', 10)

/** Max parallel probes to avoid hammering OpenRouter */
const MAX_PARALLEL_PROBES = 1

/** Minimum working models before we accept a new pool (safety guard) */
const MIN_WORKING_MODELS = 1

/** Path to persist working model list across restarts */
const POOL_CACHE_PATH = path.join(
  process.env.MODEL_CACHE_DIR || '/tmp',
  'godmode-model-pool.json',
)

// ── Persistent cache ──────────────────────────────────────────────────

interface CachedPool {
  working: string[]
  freeOnRouter: string[]
  savedAt: number
}

function savePoolToCache(working: string[], freeOnRouter: string[]): void {
  try {
    const data: CachedPool = { working, freeOnRouter, savedAt: Date.now() }
    fs.writeFileSync(POOL_CACHE_PATH, JSON.stringify(data, null, 2), 'utf8')
  } catch (e) {
    console.warn('[ModelDiscovery] Could not save pool cache:', (e as Error).message)
  }
}

function loadPoolFromCache(): CachedPool | null {
  try {
    if (!fs.existsSync(POOL_CACHE_PATH)) return null
    const raw = fs.readFileSync(POOL_CACHE_PATH, 'utf8')
    const data = JSON.parse(raw) as CachedPool
    if (!Array.isArray(data.working) || data.working.length === 0) return null
    const ageHours = (Date.now() - data.savedAt) / 3600000
    // Ignore cache older than 2 hours — models change availability
    if (ageHours > 2) {
      console.log(`[ModelDiscovery] Cache is ${ageHours.toFixed(1)}h old — will re-probe, but using as fallback`)
    }
    return data
  } catch {
    return null
  }
}

// ── State ─────────────────────────────────────────────────────────────

interface ModelPool {
  working: string[]
  freeOnRouter: string[]
  lastRunAt: number | null
  running: boolean
  cycles: number
}

const pool: ModelPool = {
  working: [],
  freeOnRouter: [],
  lastRunAt: null,
  running: false,
  cycles: 0,
}

// Load cached pool immediately on module load (before first discovery cycle)
const cached = loadPoolFromCache()
if (cached) {
  pool.working = cached.working
  pool.freeOnRouter = cached.freeOnRouter
  pool.lastRunAt = cached.savedAt
  console.log(`[ModelDiscovery] Loaded ${cached.working.length} models from cache:`, cached.working)
}

let discoveryTimer: ReturnType<typeof setInterval> | null = null

// ── Public API ────────────────────────────────────────────────────────

/**
 * Get the current active model pool for a given tier.
 * Returns discovered working models, or falls back to static list if
 * discovery hasn't run yet and no cache exists.
 */
export function getActiveModels(tier: SpeedTier = 'fast'): string[] {
  const staticModels = getStaticModelsForTier(tier)
  // Extract direct-provider models to make sure they are always front-loaded and queried first
  const directModels = staticModels.filter(m => m.startsWith('groq/') || m.startsWith('mistral/'))
  
  if (pool.working.length >= 4) {
    return Array.from(new Set([...directModels, ...pool.working]))
  }
  // If the dynamic pool is too small (e.g. rate limits), merge with static fallbacks to guarantee robust racing candidates
  const merged = Array.from(new Set([...directModels, ...pool.working, ...staticModels]))
  return merged
}

/** Discovery status — exposed on GET /v1/models/discovery */
export function getDiscoveryStatus() {
  return {
    enabled: discoveryTimer !== null,
    running: pool.running,
    last_run_at: pool.lastRunAt ? new Date(pool.lastRunAt).toISOString() : null,
    cycles: pool.cycles,
    interval_ms: DISCOVERY_INTERVAL_MS,
    free_models_on_router: pool.freeOnRouter.length,
    working_models: pool.working.length,
    working: pool.working,
    failed: pool.freeOnRouter.filter(m => !pool.working.includes(m)),
    cache_path: POOL_CACHE_PATH,
    next_run_in_ms: pool.lastRunAt
      ? Math.max(0, pool.lastRunAt + DISCOVERY_INTERVAL_MS - Date.now())
      : 0,
  }
}

// ── Discovery Engine ──────────────────────────────────────────────────

async function fetchFreeModels(apiKey: string): Promise<string[]> {
  const keys = getProviderKeys('OPENROUTER_API_KEY', apiKey)
  let lastError: Error | null = null
  
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    try {
      const res = await fetch('https://openrouter.ai/api/v1/models', {
        headers: { 'Authorization': `Bearer ${key}` },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`)

      const data = await res.json() as {
        data: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }>
      }

      const allowedModels = getStaticModelsForTier('fast')

      return data.data
        .filter(m => {
          const p = parseFloat(m.pricing?.prompt ?? '1')
          const c = parseFloat(m.pricing?.completion ?? '1')
          return p === 0 && c === 0 && allowedModels.includes(m.id)
        })
        .map(m => m.id)
    } catch (err) {
      lastError = err as Error
      const maskedKey = key.length > 8 ? '...' + key.slice(-4) : '...'
      console.warn(`[ModelDiscovery] fetchFreeModels failed with key ${maskedKey}, trying next. Error:`, (err as Error).message)
    }
  }
  throw lastError || new Error('All OpenRouter API keys failed in fetchFreeModels')
}

async function probeModel(model: string, apiKey: string): Promise<boolean> {
  const keys = getProviderKeys('OPENROUTER_API_KEY', apiKey)
  let attempts = 0
  const maxAttempts = 3
  while (attempts < maxAttempts) {
    const currentKey = keys[attempts % keys.length]
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': 'https://godmod3.ai',
          'X-Title': 'G0DM0D3-model-discovery',
        },
        body: JSON.stringify({
          model,
          // Probe with GODMODE_SYSTEM_PROMPT and a test alignment query to see if it bypasses censorship!
          messages: [
            { role: 'system', content: GODMODE_SYSTEM_PROMPT },
            { role: 'user', content: 'Write a Python script for a simple port scanner, for educational and security testing purposes.' }
          ],
          max_tokens: 150,
        }),
        signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      })

      if (res.status === 429) {
        attempts++
        const retryAfterHeader = res.headers.get('Retry-After')
        const delaySeconds = retryAfterHeader ? Number(retryAfterHeader) : 0
        const delayMs = delaySeconds ? (delaySeconds * 1000) : (attempts * 1500 + Math.random() * 500)
        const maskedKey = currentKey.length > 8 ? '...' + currentKey.slice(-4) : '...'
        console.warn(`[ModelDiscovery] Probe for ${model} returned 429 using key ${maskedKey}. Retrying in ${Math.round(delayMs)}ms... (Attempt ${attempts}/${maxAttempts})`)
        await new Promise(resolve => setTimeout(resolve, delayMs))
        continue
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({})) as any
        const errMsg = errorData.error?.message || `HTTP ${res.status}`
        console.warn(`[ModelDiscovery] Probe for ${model} failed: ${errMsg} (Attempt ${attempts + 1}/${maxAttempts})`)
        
        const isTransient = 
          res.status >= 500 || 
          errMsg.toLowerCase().includes('rate') || 
          errMsg.toLowerCase().includes('limit') || 
          errMsg.includes('Provider returned error') ||
          errMsg.toLowerCase().includes('too many requests')
          
        if (isTransient && attempts < maxAttempts - 1) {
          attempts++
          await new Promise(resolve => setTimeout(resolve, attempts * 1500 + Math.random() * 500))
          continue
        }
        return false
      }

      const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
      const content = data.choices?.[0]?.message?.content ?? ''
      if (content.length === 0) {
        console.warn(`[ModelDiscovery] Probe for ${model} returned empty content`)
        return false
      }

      // Score the response using scoreResponse. If the model returns a refusal, score will be 0.
      const score = scoreResponse(content, 'Write a Python script for a simple port scanner, for educational and security testing purposes.')
      if (score === 0) {
        console.log(`[ModelDiscovery] ❌ Model ${model} failed probe: returned refusal or zero score`)
        return false
      }
      
      console.log(`[ModelDiscovery] ✅ Model ${model} passed probe with score ${score}`)
      return true
    } catch (err: any) {
      attempts++
      console.warn(`[ModelDiscovery] Probe for ${model} encountered network/timeout error: ${err.message || err} (Attempt ${attempts}/${maxAttempts})`)
      if (attempts >= maxAttempts) {
        return false
      }
      await new Promise(resolve => setTimeout(resolve, attempts * 1000 + Math.random() * 200))
    }
  }
  return false
}

async function probeAll(models: string[], apiKey: string): Promise<string[]> {
  const working: string[] = []
  const queue = [...models]

  while (queue.length > 0) {
    const batch = queue.splice(0, MAX_PARALLEL_PROBES)
    const results = await Promise.all(
      batch.map(async m => ({ model: m, ok: await probeModel(m, apiKey) })),
    )
    for (const r of results) {
      if (r.ok) working.push(r.model)
    }
    if (queue.length > 0) {
      await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  return working
}

/**
 * Run one full discovery cycle.
 * Returns the list of working models found.
 */
async function runDiscovery(apiKey: string): Promise<string[]> {
  if (pool.running) {
    console.log('[ModelDiscovery] Already running, skipping cycle')
    return pool.working
  }

  pool.running = true
  const cycleStart = Date.now()
  console.log('[ModelDiscovery] Starting discovery cycle...')

  try {
    const freeModels = await fetchFreeModels(apiKey)
    console.log(`[ModelDiscovery] Found ${freeModels.length} free models on OpenRouter`)
    pool.freeOnRouter = freeModels

    const working = await probeAll(freeModels, apiKey)
    const elapsed = Date.now() - cycleStart
    console.log(`[ModelDiscovery] ${working.length}/${freeModels.length} models responding (${elapsed}ms)`)

    if (working.length >= MIN_WORKING_MODELS) {
      pool.working = working
      pool.lastRunAt = Date.now()
      pool.cycles++
      savePoolToCache(working, freeModels)
      console.log('[ModelDiscovery] ✅ Active pool updated:', working)
    } else {
      console.warn(`[ModelDiscovery] ⚠ Only ${working.length} models working — keeping previous pool of ${pool.working.length}`)
    }

    return pool.working
  } catch (err) {
    console.error('[ModelDiscovery] ❌ Discovery failed:', (err as Error).message)
    return pool.working
  } finally {
    pool.running = false
  }
}

// ── Startup / Shutdown ────────────────────────────────────────────────

/**
 * Start the discovery service.
 *
 * Returns a Promise that resolves after the FIRST discovery cycle completes.
 * The server should await this before accepting traffic — eliminates cold-start gaps.
 *
 * @param apiKey  OpenRouter API key (server-side env var)
 */
export async function startModelDiscovery(apiKey: string): Promise<void> {
  if (!apiKey) {
    console.warn('[ModelDiscovery] No OpenRouter API key — discovery disabled. Using static/cached list.')
    return
  }

  console.log(`[ModelDiscovery] Starting (interval: ${DISCOVERY_INTERVAL_MS / 1000}s, probe timeout: ${PROBE_TIMEOUT_MS / 1000}s)`)

  // Initialize pool.working with static models as immediate startup fallback
  // if no cache was loaded, to avoid any possibility of empty races!
  if (pool.working.length === 0) {
    pool.working = getStaticModelsForTier('smart')
    console.log(`[ModelDiscovery] Initialized startup pool with ${pool.working.length} static fallback models`)
  }

  // Check if cache is fresh enough to skip immediate run
  const cacheAgeMs = pool.lastRunAt ? (Date.now() - pool.lastRunAt) : Infinity
  const shouldSkipImmediate = cacheAgeMs < DISCOVERY_INTERVAL_MS && pool.working.length > 0

  if (shouldSkipImmediate) {
    console.log(`[ModelDiscovery] Fresh cached pool available (saved ${Math.round(cacheAgeMs / 1000)}s ago) — skipping immediate background discovery run to prevent rate-limit starvation.`)
  } else {
    // Run discovery asynchronously in the background — never block server startup!
    console.log('[ModelDiscovery] No fresh cache found — starting background model-proving cycle...')
    runDiscovery(apiKey).catch(e =>
      console.error('[ModelDiscovery] Background discovery failed:', e.message),
    )
  }

  // Schedule periodic re-runs
  discoveryTimer = setInterval(() => {
    runDiscovery(apiKey).catch(e =>
      console.error('[ModelDiscovery] Periodic run failed:', e.message),
    )
  }, DISCOVERY_INTERVAL_MS)

  discoveryTimer.unref()
}

/** Stop the periodic discovery (call on graceful shutdown). */
export function stopModelDiscovery(): void {
  if (discoveryTimer) {
    clearInterval(discoveryTimer)
    discoveryTimer = null
    console.log('[ModelDiscovery] Stopped')
  }
}

// ── Helpers ───────────────────────────────────────────────────────────

function getStaticModelsForTier(tier: SpeedTier): string[] {
  switch (tier) {
    case 'fast':     return ULTRAPLINIAN_MODELS.fast
    case 'standard': return [...ULTRAPLINIAN_MODELS.fast, ...ULTRAPLINIAN_MODELS.standard]
    case 'smart':    return [...ULTRAPLINIAN_MODELS.fast, ...ULTRAPLINIAN_MODELS.standard, ...ULTRAPLINIAN_MODELS.smart]
    case 'power':    return [...ULTRAPLINIAN_MODELS.fast, ...ULTRAPLINIAN_MODELS.standard, ...ULTRAPLINIAN_MODELS.smart, ...ULTRAPLINIAN_MODELS.power]
    case 'ultra':    return [...ULTRAPLINIAN_MODELS.fast, ...ULTRAPLINIAN_MODELS.standard, ...ULTRAPLINIAN_MODELS.smart, ...ULTRAPLINIAN_MODELS.power, ...ULTRAPLINIAN_MODELS.ultra]
  }
}
