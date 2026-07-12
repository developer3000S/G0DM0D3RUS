/**
 * Model Discovery Service
 *
 * Periodically fetches free models from OpenRouter, probes each with a
 * lightweight request, and maintains a live pool of confirmed-working models.
 *
 * The ULTRAPLINIAN engine reads `getActiveModels()` instead of the static list,
 * so the race tier adapts automatically without restarts.
 *
 * Flow:
 *   1. On startup  — run first discovery immediately (warm-up)
 *   2. Every N min — re-run discovery (default: 30 min)
 *   3. Each probe  — POST /chat/completions with max_tokens=1 (cheapest possible)
 *   4. Model ok    — response has non-empty content
 *   5. Model fail  — any HTTP error or empty content → excluded from pool
 *
 * The static ULTRAPLINIAN_MODELS.fast list is used as a seed / fallback:
 *   - If discovery has never run yet → use static list
 *   - If discovery returns 0 working models → keep last known good pool
 */

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

// ── State ─────────────────────────────────────────────────────────────

interface ModelPool {
  /** All working models confirmed in last discovery */
  working: string[]
  /** All known free models from OpenRouter /models endpoint */
  freeOnRouter: string[]
  /** Timestamp of last successful discovery */
  lastRunAt: number | null
  /** Whether discovery is currently running */
  running: boolean
  /** Number of discovery cycles completed */
  cycles: number
}

const pool: ModelPool = {
  working: [],
  freeOnRouter: [],
  lastRunAt: null,
  running: false,
  cycles: 0,
}

let discoveryTimer: ReturnType<typeof setInterval> | null = null

// ── Public API ────────────────────────────────────────────────────────

/**
 * Get the current active model pool for a given tier.
 * Falls back to the static list if discovery hasn't run yet.
 */
export function getActiveModels(tier: SpeedTier = 'fast'): string[] {
  if (pool.working.length > 0) {
    // All tiers share the same free pool when running without paid credits.
    // If you add paid model support later, map tiers here.
    return pool.working
  }
  // Fallback: return static tier list (may include currently-broken models)
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
    next_run_in_ms: pool.lastRunAt
      ? Math.max(0, pool.lastRunAt + DISCOVERY_INTERVAL_MS - Date.now())
      : 0,
  }
}

// ── Discovery Engine ──────────────────────────────────────────────────

/**
 * Fetch all free (price=0) models from OpenRouter.
 */
async function fetchFreeModels(apiKey: string): Promise<string[]> {
  const res = await fetch('https://openrouter.ai/api/v1/models', {
    headers: { 'Authorization': `Bearer ${apiKey}` },
    signal: AbortSignal.timeout(15000),
  })
  if (!res.ok) throw new Error(`OpenRouter /models HTTP ${res.status}`)

  const data = await res.json() as { data: Array<{ id: string; pricing?: { prompt?: string; completion?: string } }> }

  return data.data
    .filter(m => {
      const p = parseFloat(m.pricing?.prompt ?? '1')
      const c = parseFloat(m.pricing?.completion ?? '1')
      return p === 0 && c === 0
    })
    .map(m => m.id)
}

/**
 * Probe a single model with a minimal request.
 * Returns true if the model responds with non-empty content.
 */
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
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 3,
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

/**
 * Probe models in bounded-parallel batches.
 */
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
 */
async function runDiscovery(apiKey: string): Promise<void> {
  if (pool.running) {
    console.log('[ModelDiscovery] Already running, skipping cycle')
    return
  }

  pool.running = true
  const cycleStart = Date.now()
  console.log('[ModelDiscovery] Starting discovery cycle...')

  try {
    // Step 1: fetch free model list
    const freeModels = await fetchFreeModels(apiKey)
    console.log(`[ModelDiscovery] Found ${freeModels.length} free models on OpenRouter`)
    pool.freeOnRouter = freeModels

    // Step 2: probe all of them
    const working = await probeAll(freeModels, apiKey)
    const elapsed = Date.now() - cycleStart
    console.log(`[ModelDiscovery] ${working.length}/${freeModels.length} models responding (${elapsed}ms)`)

    // Step 3: update pool only if we got enough working models
    if (working.length >= MIN_WORKING_MODELS) {
      pool.working = working
      pool.lastRunAt = Date.now()
      pool.cycles++
      console.log('[ModelDiscovery] Active pool updated:', working)
    } else {
      console.warn(`[ModelDiscovery] Only ${working.length} models working — keeping previous pool of ${pool.working.length}`)
    }
  } catch (err) {
    console.error('[ModelDiscovery] Discovery failed:', (err as Error).message)
  } finally {
    pool.running = false
  }
}

// ── Startup / Shutdown ────────────────────────────────────────────────

/**
 * Start the discovery service.
 * Call once on server startup. Runs an immediate first pass, then
 * schedules periodic re-discovery.
 *
 * @param apiKey  OpenRouter API key (server-side env var)
 */
export function startModelDiscovery(apiKey: string): void {
  if (!apiKey) {
    console.warn('[ModelDiscovery] No OpenRouter API key — discovery disabled. Models fall back to static list.')
    return
  }

  console.log(`[ModelDiscovery] Starting (interval: ${DISCOVERY_INTERVAL_MS / 1000}s)`)

  // Immediate first run (non-blocking)
  runDiscovery(apiKey).catch(e =>
    console.error('[ModelDiscovery] Initial run failed:', e.message),
  )

  // Periodic re-runs
  discoveryTimer = setInterval(() => {
    runDiscovery(apiKey).catch(e =>
      console.error('[ModelDiscovery] Periodic run failed:', e.message),
    )
  }, DISCOVERY_INTERVAL_MS)

  // Don't hold the process open just for discovery
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
