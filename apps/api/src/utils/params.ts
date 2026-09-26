import { z } from 'zod'

// Express v5 params can be string | string[]. This helper normalizes to string.
export function param(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

// Escape user-supplied input before using it inside a MongoDB $regex / RegExp,
// to prevent catastrophic-backtracking ReDoS and regex injection.
export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Optional boolean query-string flag.
 *
 * z.coerce.boolean() runs Boolean(value), and Boolean('false') is true — so
 * `?asWorker=false` was read as asWorker=true. Only 'true' and '1' count as
 * true here; any other value that is present ('false', '0', '') is false.
 * Absent stays undefined, so `.default(false)` still applies.
 */
export function queryBoolean() {
  return z.preprocess((value) => {
    const raw = Array.isArray(value) ? value[0] : value
    if (raw === undefined) return undefined
    return raw === true || raw === 'true' || raw === '1'
  }, z.boolean().optional())
}

// An empty query value (`?floorArea=`) means "not given". Without this,
// z.coerce.number() turns '' into 0 and fails .positive().
export const blankToUndefined = (value: unknown) => (typeof value === 'string' && value.trim() === '' ? undefined : value)
