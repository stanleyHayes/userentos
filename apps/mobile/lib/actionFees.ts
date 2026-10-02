/**
 * The GH₵5 pay-per-action fees (product brief §08): signing an agreement and
 * exporting the rental passport. They are digital unlocks, which the app
 * does not sell, so it only explains them; viewing stays free everywhere.
 */
export function isFeeRequired(error: unknown): boolean {
  const e = error as { status?: number; fee?: unknown } | null
  return e?.status === 402 && !!e.fee
}
