/**
 * A small gazetteer of Ghanaian places, used to derive a map pin from a written
 * address.
 *
 * This exists because a listing with no coordinates is invisible on the map,
 * and asking a landlord to re-pin a property they listed months ago is a poor
 * trade against placing them on their own neighbourhood to start with.
 *
 * Accuracy: neighbourhood-level. A pin derived here says "this listing is in
 * Osu", not "this listing is at 22 Oxford Street" — which is why anything
 * derived is worth confirming with the landlord's own pin. Coordinates supplied
 * by a human always win over these.
 */

export interface Place { lat: number; lng: number }

/** Keys are lowercased; look-ups normalise before matching. */
const NEIGHBOURHOODS: Record<string, Place> = {
  // ── Greater Accra ──
  'east legon': { lat: 5.6353, lng: -0.1552 },
  'jungle road': { lat: 5.6353, lng: -0.1552 },
  cantonments: { lat: 5.5780, lng: -0.1770 },
  'sixth street': { lat: 5.5780, lng: -0.1770 },
  spintex: { lat: 5.6265, lng: -0.1017 },
  osu: { lat: 5.5570, lng: -0.1780 },
  'oxford street': { lat: 5.5570, lng: -0.1780 },
  'ring road': { lat: 5.5710, lng: -0.2020 },
  dzorwulu: { lat: 5.6100, lng: -0.2000 },
  'roman ridge': { lat: 5.6000, lng: -0.1930 },
  madina: { lat: 5.6836, lng: -0.1660 },
  ridge: { lat: 5.5620, lng: -0.1980 },
  trasacco: { lat: 5.6480, lng: -0.1400 },
  dansoman: { lat: 5.5450, lng: -0.2620 },
  kaneshie: { lat: 5.5620, lng: -0.2350 },
  labone: { lat: 5.5620, lng: -0.1720 },
  achimota: { lat: 5.6180, lng: -0.2280 },
  'teshie-nungua': { lat: 5.5900, lng: -0.0930 },
  teshie: { lat: 5.5830, lng: -0.1050 },
  nungua: { lat: 5.6000, lng: -0.0760 },
  airport: { lat: 5.6050, lng: -0.1720 },
  'airport residential': { lat: 5.6050, lng: -0.1720 },
  'liberation link': { lat: 5.5990, lng: -0.1780 },
  'independence avenue': { lat: 5.5560, lng: -0.1870 },
  adenta: { lat: 5.7060, lng: -0.1680 },
  'industrial area': { lat: 5.6700, lng: 0.0170 },
  'community 20': { lat: 5.6620, lng: -0.0090 },
  'community 25': { lat: 5.6470, lng: -0.0250 },

  // ── Ashanti ──
  ahodwo: { lat: 6.6720, lng: -1.6300 },
  nhyiaeso: { lat: 6.6790, lng: -1.6250 },
  ayeduase: { lat: 6.6780, lng: -1.5670 },
  asokwa: { lat: 6.6650, lng: -1.6000 },

  // ── Western ──
  'beach road': { lat: 4.8890, lng: -1.7550 },

  // ── Central ──
  abura: { lat: 5.1200, lng: -1.2680 },
  'new market': { lat: 5.5340, lng: -0.4160 },

  // ── Northern ──
  vittin: { lat: 9.4260, lng: -0.8360 },

  // ── Volta / Bono ──
  central: { lat: 6.6110, lng: 0.4720 }, // Ho Central — only reached via Ho
  'new town': { lat: 7.3390, lng: -2.3260 }, // Sunyani New Town
}

const CITIES: Record<string, Place> = {
  accra: { lat: 5.6037, lng: -0.1870 },
  tema: { lat: 5.6698, lng: -0.0166 },
  kumasi: { lat: 6.6885, lng: -1.6244 },
  takoradi: { lat: 4.8845, lng: -1.7554 },
  'cape coast': { lat: 5.1053, lng: -1.2466 },
  tamale: { lat: 9.4008, lng: -0.8393 },
  ho: { lat: 6.6110, lng: 0.4720 },
  sunyani: { lat: 7.3390, lng: -2.3260 },
  kasoa: { lat: 5.5340, lng: -0.4160 },
  koforidua: { lat: 6.0940, lng: -0.2590 },
  sekondi: { lat: 4.9340, lng: -1.7040 },
  obuasi: { lat: 6.2000, lng: -1.6800 },
  techiman: { lat: 7.5860, lng: -1.9390 },
  wa: { lat: 10.0600, lng: -2.5010 },
  bolgatanga: { lat: 10.7850, lng: -0.8510 },
  bolgatanga_east: { lat: 10.7850, lng: -0.8510 },
  winneba: { lat: 5.3510, lng: -0.6230 },
  akosombo: { lat: 6.2990, lng: 0.0510 },
}

function normalise(value?: string): string {
  return (value ?? '').trim().toLowerCase()
}

/**
 * Deterministic offset from a seed string, so two listings in one
 * neighbourhood do not stack on the exact same pixel — and so the same listing
 * lands in the same spot on every run. Math.random() here would make pins
 * wander on each reseed.
 */
function jitter(seed: string): { dLat: number; dLng: number } {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  // Two independent-ish values in [-0.5, 0.5], scaled to roughly ±1.5km.
  const a = ((h >>> 8) % 1000) / 1000 - 0.5
  const b = ((h >>> 18) % 1000) / 1000 - 0.5
  return { dLat: a * 0.028, dLng: b * 0.028 }
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6

export interface AddressLike {
  street?: string
  city?: string
  region?: string
  neighborhood?: string
}

/**
 * Best-effort pin for an address. Matches the neighbourhood first, then a
 * street name that happens to be a known area, then the city. Returns null
 * when nothing matches — better an unplotted listing than one dropped in the
 * wrong town.
 */
export function resolveCoordinates(address: AddressLike, seed = ''): Place | null {
  const city = normalise(address.city)
  const hood = normalise(address.neighborhood)
  const street = normalise(address.street)

  // 'Central' and 'New Town' are generic; only trust them alongside their city.
  const generic = hood === 'central' || hood === 'new town'
  let base: Place | undefined =
    (!generic || city === 'ho' || city === 'sunyani' ? NEIGHBOURHOODS[hood] : undefined)

  if (!base) {
    base = Object.entries(NEIGHBOURHOODS).find(([key]) => key.length > 4 && street.includes(key))?.[1]
  }
  if (!base) base = CITIES[city]
  if (!base) return null

  const { dLat, dLng } = jitter(seed || `${street}|${hood}|${city}`)
  return { lat: round6(base.lat + dLat), lng: round6(base.lng + dLng) }
}
