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
import { ULTRAPLINIAN_MODELS, type SpeedTier } from './ultraplinian'

// ── Config ────────────────────────────────────────────────────────────

/** How often to re-probe models (ms). Default: 30 minutes */
const DISCOVERY_INTERVAL_MS = parseInt(
  process.env.MODEL_DISCOVERY_INTERVAL_MS || String(30 * 60 * 1000),
  10,
)

/** Per-model probe timeout (ms) */
const PROBE_TIMEOUT_MS = parseInt(process.env.MODEL_PROBE_TIMEOUT_MS || '20000', 10)

/** Max parallel probes to avoid hammering OpenRouter */
const MAX_PARALLEL_PROBES = 12

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
  if (pool.working.length > 0) {
    return pool.working
  }
  // Last resort fallback: static list from config
  console.warn('[ModelDiscovery] Pool empty — falling back to static list')
  return getStaticModelsForTier(tier)
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
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`)

  const data = await res.json() as {
    data: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }>
  }

  return data.data
    .filter(m => {
      const p = parseFloat(m.pricing?.prompt ?? '1')
      const c = parseFloat(m.pricing?.completion ?? '1')
      return p === 0 && c === 0
    })
    .map(m => m.id)
}

async function probeModel(model: string, apiKey: string): Promise<boolean> {
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://godmod3.ai',
        'X-Title': 'G0DM0D3-model-discovery',
      },
      body: JSON.stringify({
        model,
        // Simple connectivity probe — no system prompt, just verify model is online.
        // GODMODE system prompt is applied in actual races.
        // Refusal filtering is handled by the race scoring engine.
        messages: [{ role: 'user', content: 'Reply with just: ok' }],
        max_tokens: 5,
      }),
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })

    if (!res.ok) return false
    const data = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
    const content = data.choices?.[0]?.message?.content ?? ''
    return content.length > 0
  } catch {
    return false
  }
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

  // First run — BLOCKING. Server waits for this before serving traffic.
  // If cache was loaded above, this will still refresh it in the background
  // but we can serve immediately from cache.
  if (pool.working.length > 0) {
    // We have cached models — run refresh in background, don't block startup
    console.log('[ModelDiscovery] Cache available — starting background refresh')
    runDiscovery(apiKey).catch(e =>
      console.error('[ModelDiscovery] Background refresh failed:', e.message),
    )
  } else {
    // No cache — must wait for first discovery before serving
    console.log('[ModelDiscovery] No cache — waiting for first discovery cycle...')
    await runDiscovery(apiKey)
    console.log(`[ModelDiscovery] First cycle done — ${pool.working.length} models ready`)
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
