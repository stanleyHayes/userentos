/**
 * Placements that a public surface actually serves (spec §9).
 *
 * Products can only be sold for these — selling 'homepage' or 'city' when
 * nothing reads them took money for a placement that could never deliver.
 * Kept free of imports so the model and the serving code can both use it
 * without importing each other.
 */
export const SPONSORED_PLACEMENTS = ['search_top'] as const
export type SponsoredPlacementName = (typeof SPONSORED_PLACEMENTS)[number]

export function isSponsoredPlacement(value: unknown): value is SponsoredPlacementName {
  return (SPONSORED_PLACEMENTS as readonly unknown[]).includes(value)
}
