/**
 * Money helpers. Amounts are stored as GHS major units in `Number` fields
 * (a full migration to integer pesewas is a separate, API-breaking change).
 * Until then, EVERY balance-affecting computation must round through here
 * so float drift (0.1 + 0.2 !== 0.3) never reaches a persisted balance.
 */

/** Round to 2 decimal places (pesewas), killing IEEE-754 carry. */
export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100
}

export function addMoney(a: number, b: number): number {
  return round2(round2(a) + round2(b))
}

export function subtractMoney(a: number, b: number): number {
  return round2(round2(a) - round2(b))
}
