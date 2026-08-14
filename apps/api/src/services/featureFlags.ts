import crypto from 'crypto'
import { FeatureFlag, type IFeatureFlag } from '../models/FeatureFlag.js'

interface FlagContext {
  userId?: string
  role?: string
}

interface CacheEntry {
  flags: IFeatureFlag[]
  expiresAt: number
}

const TTL_MS = 60_000
let cache: CacheEntry | null = null

async function getAllFlags(): Promise<IFeatureFlag[]> {
  const now = Date.now()
  if (cache && cache.expiresAt > now) return cache.flags
  const flags = await FeatureFlag.find().lean<IFeatureFlag[]>()
  cache = { flags, expiresAt: now + TTL_MS }
  return flags
}

export function invalidateFlagCache() {
  cache = null
}

function deterministicHashPct(input: string): number {
  const hash = crypto.createHash('sha256').update(input).digest()
  // Take first 4 bytes as unsigned int
  const n = hash.readUInt32BE(0)
  return n % 100
}

export function evaluateFlag(flag: IFeatureFlag, ctx: FlagContext): boolean {
  // 1. Disabled list always takes precedence
  if (ctx.userId && flag.disabledForUserIds?.includes(ctx.userId)) return false

  // 2. Enabled user list
  if (ctx.userId && flag.enabledForUserIds?.includes(ctx.userId)) return true

  // 3. Role list
  if (ctx.role && (flag.enabledForRoles as string[] | undefined)?.includes(ctx.role)) return true

  // 4. Rollout percentage (deterministic by user+key)
  if (flag.rolloutPct > 0 && ctx.userId) {
    const bucket = deterministicHashPct(`${ctx.userId}:${flag.key}`)
    if (bucket < flag.rolloutPct) return true
  }

  // 5. Global enabled
  return !!flag.enabled
}

export async function isEnabled(key: string, ctx: FlagContext): Promise<boolean> {
  const flags = await getAllFlags()
  const flag = flags.find((f) => f.key === key)
  if (!flag) return false
  return evaluateFlag(flag, ctx)
}

export async function evaluateAllForContext(ctx: FlagContext): Promise<Record<string, boolean>> {
  const flags = await getAllFlags()
  const result: Record<string, boolean> = {}
  for (const flag of flags) {
    result[flag.key] = evaluateFlag(flag, ctx)
  }
  return result
}

export async function getAllRaw(): Promise<IFeatureFlag[]> {
  return getAllFlags()
}
