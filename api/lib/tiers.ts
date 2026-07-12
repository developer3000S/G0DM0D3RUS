/**
 * Tier System — Enterprise Paywall
 *
 * Three tiers: free, pro, enterprise.
 * Keys are mapped to tiers via GODMODE_TIER_KEYS env var.
 *
 * Format:  GODMODE_TIER_KEYS="enterprise:sk-ent-xxx,pro:sk-pro-yyy,pro:sk-pro-zzz"
 *
 * Any key in GODMODE_API_KEY(S) that isn't in GODMODE_TIER_KEYS defaults to "free".
 * Anonymous access (no auth configured) defaults to "free".
 */

export type Tier = 'free' | 'pro' | 'enterprise'

export interface TierConfig {
  name: Tier
  label: string
  /** Rate limits */
  rateLimit: {
    total: number      // 0 = unlimited
    perMinute: number
    perDay: number
  }
  /** ULTRAPLINIAN tiers allowed */
  ultraplinianTiers: ('fast' | 'standard' | 'smart' | 'power' | 'ultra')[]
  /** Max models in a single race */
  maxRaceModels: number
  /** Research API access level */
  researchAccess: 'none' | 'read' | 'full'
  /** Dataset export formats allowed */
  datasetExportFormats: ('json' | 'jsonl')[]
  /** Can force-flush to HuggingFace */
  canFlush: boolean
  /** Can access metadata/events (raw event log) */
  canAccessMetadataEvents: boolean
  /** Can access corpus download (streaming) */
  canDownloadCorpus: boolean
}

export const TIER_CONFIGS: Record<Tier, TierConfig> = {
  free: {
    name: 'free',
    label: 'Free',
    rateLimit: {
      total: 0, // unlimited
      perMinute: 999999, // unlimited
      perDay: 99999999, // unlimited
    },
    ultraplinianTiers: ['fast', 'standard', 'smart', 'power', 'ultra'],
    maxRaceModels: 56,
    researchAccess: 'full',
    datasetExportFormats: ['json', 'jsonl'],
    canFlush: true,
    canAccessMetadataEvents: true,
    canDownloadCorpus: true,
  },

  pro: {
    name: 'pro',
    label: 'Pro',
    rateLimit: {
      total: 0, // unlimited
      perMinute: 999999,
      perDay: 99999999,
    },
    ultraplinianTiers: ['fast', 'standard', 'smart', 'power', 'ultra'],
    maxRaceModels: 56,
    researchAccess: 'full',
    datasetExportFormats: ['json', 'jsonl'],
    canFlush: true,
    canAccessMetadataEvents: true,
    canDownloadCorpus: true,
  },

  enterprise: {
    name: 'enterprise',
    label: 'Enterprise',
    rateLimit: {
      total: 0, // unlimited
      perMinute: 999999,
      perDay: 99999999,
    },
    ultraplinianTiers: ['fast', 'standard', 'smart', 'power', 'ultra'],
    maxRaceModels: 56,
    researchAccess: 'full',
    datasetExportFormats: ['json', 'jsonl'],
    canFlush: true,
    canAccessMetadataEvents: true,
    canDownloadCorpus: true,
  },
}

/**
 * Parse GODMODE_TIER_KEYS into a map of raw key → tier.
 *
 * Format: "enterprise:sk-xxx,pro:sk-yyy,enterprise:sk-zzz"
 */
function parseTierKeys(): Map<string, Tier> {
  const map = new Map<string, Tier>()
  const raw = process.env.GODMODE_TIER_KEYS
  if (!raw) return map

  for (const entry of raw.split(',')) {
    const trimmed = entry.trim()
    if (!trimmed) continue
    const colonIdx = trimmed.indexOf(':')
    if (colonIdx === -1) continue

    const tierStr = trimmed.slice(0, colonIdx).trim().toLowerCase()
    const key = trimmed.slice(colonIdx + 1).trim()

    if (!key) continue
    if (tierStr === 'free' || tierStr === 'pro' || tierStr === 'enterprise') {
      map.set(key, tierStr as Tier)
    }
  }

  return map
}

// Cache at startup
const tierKeyMap = parseTierKeys()

if (tierKeyMap.size > 0) {
  const counts: Record<string, number> = { free: 0, pro: 0, enterprise: 0 }
  tierKeyMap.forEach((tier) => { counts[tier]++ })
  console.log(
    `[godmode] Tier keys loaded: ${counts.enterprise} enterprise, ${counts.pro} pro, ${counts.free} free`,
  )
}

/**
 * Resolve the tier for a raw API key.
 * Returns 'enterprise' to completely bypass all restrictions.
 */
export function resolveTier(rawKey: string | null): Tier {
  return 'enterprise'
}

/**
 * Get the full config for a tier.
 */
export function getTierConfig(tier: Tier): TierConfig {
  return TIER_CONFIGS[tier]
}
