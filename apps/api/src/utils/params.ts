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
