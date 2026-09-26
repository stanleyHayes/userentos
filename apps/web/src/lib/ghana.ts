/**
 * Ghana-specific input helpers — phone and Ghana Card auto-formatting plus the
 * city list used by signup/profile dropdowns (free-text city entry is avoided
 * so locations stay consistent and searchable).
 */

/**
 * Every Ghanaian city/town, sorted. Copied from country-state-city 3.2.1: the
 * package bundles every city in the world (~2 MB gzipped) and made every page
 * download it for these 121 names.
 */
export const GHANA_CITIES: readonly string[] = [
  'Aboso', 'Aburi', 'Accra', 'Aflao', 'Agogo', 'Akim Oda', 'Akim Swedru', 'Akropong', 'Akwatia',
  'Anloga', 'Aowin', 'Apam', 'Asamankese', 'Asunafo North', 'Asunafo South', 'Asutifi North',
  'Asutifi South', 'Atebubu-Amantin', 'Atsiaman', 'Axim', 'Banda', 'Bawku', 'Begoro', 'Bekwai',
  'Berekum East', 'Berekum West', 'Bia East', 'Bia West', 'Biakoye', 'Bibiani',
  'Bibiani-Anhwiaso-Bekwai', 'Bodi', 'Bole', 'Bolgatanga', 'Bunkpurugu-Nyakpanduri', 'Cape Coast',
  'Central Gonja', 'Chereponi', 'Dome', 'Dormaa Central', 'Dormaa East', 'Dormaa West', 'Dunkwa',
  'East Gonja', 'East Mamprusi', 'Ejura', 'Elmina', 'Foso', 'Gbawe', 'Ho', 'Hohoe', 'Jaman North',
  'Jaman South', 'Jasikan', 'Juaboso', 'Kadjebi', 'Kasoa', 'Keta', 'Kete Krachi', 'Kibi',
  'Kintampo North', 'Kintampo South', 'Koforidua', 'Konongo', 'Kpandae', 'Kpandu', 'Krachi East',
  'Krachi Nchumuru', 'Krachi West', 'Kumasi', 'Mampong', 'Mamprugu-Moagduri', 'Medina Estates',
  'Mpraeso', 'Mumford', 'Navrongo', 'Nkoranza North', 'Nkoranza South', 'Nkwanta North',
  'Nkwanta South', 'North East Gonja', 'North Gonja', 'Nsawam', 'Nungua', 'Obuase', 'Prestea',
  'Pru East', 'Pru West', 'Salaga', 'Saltpond', 'Savelugu', 'Sawla-Tuna-Kalba', 'Sefwi-Akontombra',
  'Sefwi-Wiawso', 'Sekondi-Takoradi', 'Sene East', 'Sene West', 'Shama Junction', 'Suaman',
  'Suhum', 'Sunyani', 'Sunyani West', 'Swedru', 'Tafo', 'Tain', 'Takoradi', 'Tamale', 'Tano North',
  'Tano South', 'Tarkwa', 'Techiman', 'Techiman North', 'Tema', 'Teshi Old Town', 'Wa', 'Wenchi',
  'West Gonja', 'West Mamprusi', 'Winneba', 'Yendi', 'Yunyoo-Nasuan',
]

/** Strip a phone input down to its digits (drops +, spaces, dashes). */
export function phoneDigits(value: string): string {
  return value.replace(/\D/g, '')
}

/**
 * Auto-format a Ghanaian phone number as the user types.
 * Local:      0244123456      → 024 412 3456
 * Intl:       233244123456    → +233 24 412 3456
 */
export function formatPhoneGH(value: string): string {
  const digits = phoneDigits(value)
  if (!digits) return ''

  if (digits.startsWith('233')) {
    const d = digits.slice(0, 12) // 233 + 9 digits
    const parts = [d.slice(0, 3), d.slice(3, 5), d.slice(5, 8), d.slice(8, 12)].filter(Boolean)
    return `+${parts.join(' ')}`
  }

  const d = digits.slice(0, 10)
  return [d.slice(0, 3), d.slice(3, 6), d.slice(6, 10)].filter(Boolean).join(' ')
}

/** Ghana Card format: GHA-XXXXXXXXX-X (9 digits + check character). */
export const GHANA_CARD_RE = /^GHA-\d{9}-[0-9A-Z]$/

/**
 * Auto-format a Ghana Card ID as the user types — the GHA- prefix and the
 * separating dashes are inserted automatically.
 */
export function formatGhanaCard(value: string): string {
  let body = value.toUpperCase().replace(/[^0-9A-Z]/g, '')
  if (body.startsWith('GHA')) body = body.slice(3)
  body = body.slice(0, 10)

  let out = 'GHA'
  if (body.length > 0) out += `-${body.slice(0, 9)}`
  if (body.length > 9) out += `-${body.slice(9)}`
  return out
}
