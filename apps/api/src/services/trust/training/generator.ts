/**
 * TRUST-2 synthetic and adversarial data (spec §8.2, §13.5, §18).
 *
 * A reproducible generator rather than a hand-written list: every example
 * comes from a seeded random stream, carries the template family it came from
 * (so training and evaluation can be split by family, §8.3) and the recipe of
 * transforms applied to it (so a failure can be reproduced exactly).
 *
 * Used by src/scripts/trainContactModel.ts to train the intent model and by
 * the release-blocking evaluation suites in src/__tests__/trust-*.test.ts.
 * Nothing here runs when a message is screened.
 */
import type { IntentLabel } from '../model.js'

export type Rng = () => number

/** mulberry32: small, fast and good enough for data generation. */
export function makeRng(seed: number): Rng {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const pick = <T>(r: Rng, items: readonly T[]): T => items[Math.floor(r() * items.length)]
const chance = (r: Rng, p: number) => r() < p
const int = (r: Rng, min: number, max: number) => min + Math.floor(r() * (max - min + 1))

export interface Example {
  text: string
  label: IntentLabel
  /** Template family, for splits that keep a family out of training (§8.3). */
  family: string
  /** Contains a reachable identifier (phone, email, handle or link). */
  leak: boolean
  /** What the policy must decide. */
  block: boolean
  recipe: string[]
}

export interface Turn { text: string; offsetSec: number }
export interface Sequence {
  turns: Turn[]
  /** The sequence leaks a contact detail: some turn must be stopped before it completes. */
  block: boolean
  family: string
  recipe: string[]
}

// ─── Contact entities ───

export const GH_MOBILE_PREFIXES = ['20', '23', '24', '25', '26', '27', '28', '29', '50', '53', '54', '55', '56', '57', '59'] as const

/** A Ghana mobile number in local form: 0 + prefix + 7 digits. */
export function ghanaMobile(r: Rng): string {
  let rest = ''
  for (let i = 0; i < 7; i++) rest += String(int(r, 0, 9))
  return `0${pick(r, GH_MOBILE_PREFIXES)}${rest}`
}

const FIRST = ['kofi', 'kwame', 'ama', 'akosua', 'yaw', 'esi', 'kojo', 'abena', 'kwabena', 'adwoa', 'efua', 'kwesi', 'afia', 'yaa', 'nana', 'selorm', 'edem', 'mawuli', 'dela', 'elikem', 'ato', 'ekow', 'fiifi', 'araba', 'naa', 'nii', 'stan', 'grace', 'michael', 'joyce', 'emmanuel', 'priscilla', 'daniel', 'linda']
const LAST = ['mensah', 'boateng', 'owusu', 'asante', 'agyeman', 'appiah', 'osei', 'darko', 'addo', 'quaye', 'ofori', 'amoah', 'annan', 'badu', 'bonsu', 'danso', 'frimpong', 'tetteh', 'laryea', 'hayford', 'adjei', 'acheampong']
const BUSINESS = ['homes', 'realty', 'properties', 'estates', 'rentals', 'gh', 'housing', 'lettings', 'agency', 'realestate']
const PROVIDERS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'ymail.com', 'proton.me', 'live.com']

function localPart(r: Rng): string {
  const a = pick(r, FIRST)
  const b = chance(r, 0.6) ? pick(r, LAST) : pick(r, BUSINESS)
  const sep = pick(r, ['.', '_', '', ''])
  const digits = chance(r, 0.4) ? String(int(r, 1, 99)) : ''
  return `${a}${sep}${b}${digits}`
}

export function emailAddress(r: Rng): string {
  return `${localPart(r)}@${pick(r, PROVIDERS)}`
}

export function handleName(r: Rng): string {
  const a = pick(r, FIRST)
  const b = pick(r, [...BUSINESS, ...LAST])
  return `${a}${pick(r, ['_', '.', '', '_'])}${b}${chance(r, 0.4) ? int(r, 1, 999) : ''}`
}

// ─── Phone transforms (§8.2) ───

const WORDS_EN = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine']
const HOMOPHONES: Record<string, string[]> = { 0: ['oh', 'o'], 1: ['won'], 2: ['to', 'too'], 4: ['for', 'fore'], 8: ['ate'] }
const WORDS_TWI = ['hwee', 'baako', 'mmienu', 'mmiensa', 'anan', 'anum', 'nsia', 'nson', 'nwotwe', 'nkron']
const LEET: Record<string, string[]> = { 0: ['O', 'o'], 1: ['l', 'I', '|'], 2: ['Z'], 5: ['S', '$'], 8: ['B'], 9: ['g'] }
const FULLWIDTH = (d: string) => String.fromCharCode(0xff10 + Number(d))
const CYRILLIC_O = 'О'
const SEPARATORS = [' ', '-', '.', '/', '_', ':', ';', ' - ', ' / ', ', ', '•', '|', '~', '*']
const EMOJI = ['💬', '📞', '🏠', '✨', '🔥', '👉', '⭐', '🙏', '😊', '💯']

export type DigitMap = 'digits' | 'words' | 'mixed_words' | 'homophones' | 'twi' | 'leet' | 'fullwidth' | 'homoglyph'
export type Joiner = 'none' | 'space' | 'grouped' | 'separator' | 'random_separators' | 'emoji' | 'newline'

function mapDigit(r: Rng, digit: string, mode: DigitMap): string {
  switch (mode) {
    case 'words': return digit === '0' && chance(r, 0.3) ? 'oh' : WORDS_EN[Number(digit)]
    case 'mixed_words': return chance(r, 0.5) ? WORDS_EN[Number(digit)] : digit
    case 'homophones': return HOMOPHONES[digit] && chance(r, 0.7) ? pick(r, HOMOPHONES[digit]) : WORDS_EN[Number(digit)]
    case 'twi': return chance(r, 0.8) ? WORDS_TWI[Number(digit)] : WORDS_EN[Number(digit)]
    case 'leet': return LEET[digit] && chance(r, 0.35) ? pick(r, LEET[digit]) : digit
    case 'fullwidth': return chance(r, 0.7) ? FULLWIDTH(digit) : digit
    case 'homoglyph': return digit === '0' && chance(r, 0.6) ? CYRILLIC_O : digit
    default: return digit
  }
}

const isWordMode = (mode: DigitMap) => mode === 'words' || mode === 'mixed_words' || mode === 'homophones' || mode === 'twi'

function join(r: Rng, tokens: string[], joiner: Joiner, wordy: boolean): string {
  if (wordy) {
    // Number words need a boundary between them.
    if (joiner === 'none' || joiner === 'space' || joiner === 'grouped') return tokens.join(' ')
    if (joiner === 'separator') { const sep = pick(r, [' ', ', ', ' - ', '-', ' . ']); return tokens.join(sep) }
    if (joiner === 'emoji') return tokens.map((t, i) => (i && chance(r, 0.5) ? `${pick(r, EMOJI)} ${t}` : t)).join(' ')
    if (joiner === 'newline') return tokens.map((t, i) => (i && chance(r, 0.25) ? `\n${t}` : t)).join(' ')
    return tokens.map((t, i) => (i ? `${pick(r, [' ', ', ', '-', ' '])}${t}` : t)).join('')
  }
  switch (joiner) {
    case 'none': return tokens.join('')
    case 'space': return tokens.join(' ')
    case 'grouped': {
      const groups = pick(r, [[3, 3, 4], [4, 3, 3], [3, 7], [4, 6], [2, 4, 4]])
      const out: string[] = []
      let at = 0
      for (const size of groups) { out.push(tokens.slice(at, at + size).join('')); at += size }
      if (at < tokens.length) out.push(tokens.slice(at).join(''))
      const sep = pick(r, [' ', '-', '.', ' '])
      const joined = out.filter(Boolean).join(sep)
      return chance(r, 0.15) ? joined.replace(/^(\d{3})/, '($1)') : joined
    }
    case 'separator': { const sep = pick(r, SEPARATORS); return tokens.join(sep) }
    case 'random_separators': return tokens.map((t, i) => (i ? `${chance(r, 0.6) ? pick(r, SEPARATORS) : ''}${t}` : t)).join('')
    case 'emoji': return tokens.map((t, i) => (i && chance(r, 0.6) ? `${pick(r, EMOJI)}${t}` : t)).join('')
    case 'newline': return tokens.map((t, i) => (i && chance(r, 0.3) ? `\n${t}` : t)).join('')
    default: return tokens.join('')
  }
}

/** "double four", "triple zero": merge runs of the same digit (words only). */
function repeats(r: Rng, digits: string[]): string[] {
  const out: string[] = []
  for (let i = 0; i < digits.length; i++) {
    let run = 1
    while (i + run < digits.length && digits[i + run] === digits[i] && run < 3) run++
    if (run >= 2 && chance(r, 0.8)) { out.push(`${run === 2 ? 'double' : 'triple'}|${digits[i]}`); i += run - 1 } else out.push(digits[i])
  }
  return out
}

export interface Disguised { text: string; recipe: string[] }

export const DIGIT_MAPS: DigitMap[] = ['digits', 'digits', 'words', 'mixed_words', 'homophones', 'twi', 'leet', 'fullwidth', 'homoglyph']
export const JOINERS: Joiner[] = ['none', 'space', 'grouped', 'separator', 'random_separators', 'emoji', 'newline']

/** A phone number disguised with 1–3 composed transforms (§8.2). */
export function disguisePhone(r: Rng, local: string, options: { maps?: DigitMap[]; joiners?: Joiner[]; intl?: boolean } = {}): Disguised {
  const recipe: string[] = []
  let digits = local
  if (options.intl ?? chance(r, 0.2)) {
    const form = pick(r, ['+233', '233', '00233', '+233 '])
    digits = `${form.trim()}${local.slice(1)}`
    recipe.push(`intl:${form.trim()}`)
  }
  const plus = digits.startsWith('+')
  const body = (plus ? digits.slice(1) : digits).split('')
  const map = pick(r, options.maps ?? DIGIT_MAPS)
  const joiner = pick(r, options.joiners ?? JOINERS)
  recipe.push(`map:${map}`, `join:${joiner}`)
  const wordy = isWordMode(map)
  let tokens: string[]
  if (wordy && chance(r, 0.3)) {
    recipe.push('repeats')
    tokens = repeats(r, body).map((t) => (t.includes('|') ? `${t.split('|')[0]} ${mapDigit(r, t.split('|')[1], map)}` : mapDigit(r, t, map)))
  } else {
    tokens = body.map((d) => mapDigit(r, d, map))
  }
  const text = `${plus ? '+' : ''}${join(r, tokens, joiner, wordy)}`
  return { text, recipe }
}

/** An email disguised by verbalisation, brackets, spacing or case (§8.2). */
export function disguiseEmail(r: Rng, email: string): Disguised {
  const [local, domain] = email.split('@')
  const [host, ...tld] = domain.split('.')
  const mode = pick(r, ['plain', 'verbal', 'bracket', 'spaced', 'upper', 'verbal_spaced_local'])
  const dot = tld.join('.')
  switch (mode) {
    case 'verbal': return { text: `${local.replace(/\./g, pick(r, [' dot ', '.']))} at ${host} dot ${dot.replace(/\./g, ' dot ')}`, recipe: ['email:verbal'] }
    case 'bracket': {
      const [o, c] = pick(r, [['[', ']'], ['(', ')'], ['{', '}'], ['<', '>']])
      return { text: `${local}${o}at${c}${host}${o}dot${c}${dot}`, recipe: ['email:bracket'] }
    }
    case 'spaced': return { text: email.split('').join(' '), recipe: ['email:spaced'] }
    case 'upper': return { text: email.toUpperCase(), recipe: ['email:upper'] }
    case 'verbal_spaced_local': return { text: `${local} @ ${host} . ${dot}`, recipe: ['email:spaced_symbols'] }
    default: return { text: email, recipe: ['email:plain'] }
  }
}

// ─── Message templates ───

const fill = (template: string, slots: Record<string, string>) => template.replace(/\{(\w+)\}/g, (_, key: string) => slots[key] ?? '')

const SHARE_PHONE = [
  'my number is {phone}', 'call me on {phone}', 'reach me on {phone}', 'whatsapp me on {phone}', 'text me {phone}',
  'my whatsapp is {phone}', 'my line is {phone}', 'here is my number {phone}', '{phone} is my number', 'contact me on {phone}',
  'you can reach me at {phone}', 'my digits: {phone}', 'call {phone} for viewing', 'for quick response call {phone}',
  'my number be {phone}', 'abeg call me {phone}', 'chale this is my line {phone}', 'me noma ne {phone}', 'flash me on {phone}',
  'send momo to {phone}', 'pay the deposit to my momo {phone}', '{phone}', '{phone} whatsapp only', 'my wife\'s number {phone}',
  'Hi, interested? {phone}', 'Viewing available, call/WhatsApp {phone}', 'dial {phone}', 'ring me {phone}',
  'my mobile money number is {phone}',
  'office line {phone}',
  'call my caretaker on {phone}',
  '{phone} (call after 5)',
  "if I don't reply, try {phone}",
  'whatsapp only: {phone}',
]
const SHARE_EMAIL = [
  'my email is {email}', 'email me at {email}', 'send the documents to {email}', 'reach me via {email}', '{email}',
  'contact {email} for details', 'my gmail is {email}', 'write to me {email}', 'drop me a mail at {email}',
]
const SHARE_HANDLE = [
  'my IG is @{handle}', 'add me on snap {handle}', 'find me on instagram @{handle}', 'follow me on tiktok @{handle}',
  'my telegram is @{handle}', 'IG: {handle}', 'insta {handle}', 'search {handle} on facebook', 'look up @{handle} on insta',
  'my facebook page is {handle}', 'snapchat: {handle}', 'tg @{handle}', '@{handle} on IG', 'DM me on insta @{handle}',
]
const SHARE_LINK = [
  'chat me here wa.me/{intl}', 'https://wa.me/{intl}', 'join my channel t.me/{handle}', 'facebook.com/{handle}',
  'see more at instagram.com/{handle}', 'bit.ly/{handle}', 'my site {handle}.com has more houses', 'visit www.{handle}.com',
  'hxxps://{handle}.com', '{handle} dot com', 'linktr.ee/{handle}', 'tiktok.com/@{handle}',
]
const REQUEST = [
  'send me your number', 'what is your number', "what's your whatsapp", 'can I get your phone number', 'drop your digits',
  'give me your contact', 'do you have whatsapp?', 'are you on telegram?', 'please send your email', 'what is your email address',
  'send where I can reach you', 'how can I reach you directly?', 'your number pls', 'abeg send your number', 'you dey whatsapp?',
  'give me your line', 'wo noma ne sen?', 'can I have your WhatsApp number', 'DM me your number', 'inbox me your contact',
  'what be your number', 'share your IG', "what's your insta?", 'send your contacts so we talk', 'drop your WhatsApp number',
  'how do I contact you outside here?', 'kindly share your phone number', 'pls your contact', 'where can I message you?',
  'mind sharing your WhatsApp?',
  'which number do you use for whatsapp?',
  'let me have your mobile number',
  'can you send your email so I send the docs?',
  'is there a number I can call you on?',
  'drop your IG handle',
  'what is your telegram username?',
  'gimme your digits',
  'what number can I reach you on?',
  'your contact please, I want to call',
  'send me a line I can call you',
  'how do I get you on phone?',
]
const MOVE_OFF = [
  "let's continue on WhatsApp", "let's talk on the green app", 'message me elsewhere', 'find me on the photo app',
  'we can discuss this outside the app', 'call me', 'flash me', 'inbox me', "let's do this offline", 'pay me directly',
  'send the money to my momo', "we don't need RentOS for this", 'avoid the app fees and pay cash', 'pay cash in hand when you come',
  "I'll WhatsApp you", 'let me call you, it is easier', 'chat me on telegram', "let's move this to WhatsApp", 'continue on IG',
  'make we talk for WhatsApp', 'give me a call', 'beep me', 'fre me', 'talk to me on facebook', 'hit me up on snap',
  'we can deal directly without the app', 'skip the platform, pay me straight', 'I will send you my number', 'let us speak privately elsewhere',
  'transfer the advance to my account directly', 'meet me and we sign outside the app', 'reach out on whatsapp',
  'I prefer we talk on telegram, much easier',
  'this app is slow, whatsapp is better',
  'let us finish this on phone',
  'come to my office and pay there, no need for the app',
  'we can settle the rent between us',
  'text me later on my line',
  "I'll ping you on IG",
  'catch me on facebook messenger',
  'better we talk privately',
  'I go call you, wait',
  'pay the agent fee to me in cash',
  'no need to book through RentOS, just come',
]
const POLICY = [
  "why can't I send my number here?", 'the app blocked my message', 'is it allowed to share phone numbers on RentOS?',
  'RentOS hides phone numbers right?', 'I understand we must keep chatting here', 'our policy blocks WhatsApp numbers',
  'I tried to share my contact but it was blocked', 'why does RentOS block emails?', 'ok I will keep the conversation on RentOS',
  'the rules say no phone numbers, fine', 'is it safe to pay through the app?', 'RentOS said I should not share contact details',
  "I know we can't exchange numbers here", 'why are contacts not allowed?',
  'does RentOS allow calling the agent?',
  'so all messages stay on the app?',
  'I see the app removed my contact, why?',
  'must the rent be paid through RentOS?',
  'what happens if I share my number by mistake?',
  'why is my message not going?',
  'the system said contact details are not allowed',
  'fine, we will chat here then',
  'is the payment protected if I use RentOS?',
  'it says keep the conversation on RentOS',
]
const BENIGN_REFERENCE = [
  'I saw this listing on Facebook', 'WhatsApp is slow today', 'my phone battery died, sorry for the late reply',
  'I emailed my employer for the letter', 'I will message you here when I arrive', 'the agent called me yesterday about another house',
  'I found you on Instagram ads', 'my phone was off', "I'll reply here once I'm home", 'check your RentOS messages',
  'send the photos here please', 'my email is verified on RentOS now', 'the network is bad, messages are delayed',
  'I shared the listing link with my sister on WhatsApp', 'telegram was down this morning', 'I lost my phone last week',
  'is there a phone signal in the area?', 'does the house have internet?', 'notify me here if the price changes',
  'I got your listing from a friend on Facebook',
  'my phone screen is cracked so typing is slow',
  'the landlord already has my email on RentOS',
  'I will check my email for the agreement',
  'WhatsApp status showed me this area',
  'did you get my message here?',
  'sorry I missed your message, network issues',
  'my number changed so I updated my RentOS profile',
  'the app notification came late',
  "I'll message you once I finish work",
  'my brother uses Instagram to find apartments',
  'I received the SMS alert from RentOS',
  'I called the bank about the transfer',
  'the caretaker was on phone when I came',
  'please reply here when you can',
]
const NO_CONTACT = [
  'is the house still available?', 'how much is the rent?', 'the rent is GH₵ {price} per month', 'can I come for viewing on {date}?',
  'I can pay {months} months advance', 'does it have water and light?', 'how many bedrooms?', 'it has {beds} bedrooms and {baths} baths',
  'is the place fenced with a gate?', 'what time can I see it?', "let's meet at {time}", 'my budget is {price} cedis',
  'the plot is {plot}', 'is it negotiable?', 'the price is GH₵ {sale} for sale', 'the listing ref is {ref}', 'digital address {gps}',
  'house number {house}, {street}', 'room {room} is vacant', 'built in {year}', 'floor area {sqm} sqm', 'agent fee is {pct}%',
  'can you reduce it to {price}?', 'I will be there by {time} on {date}', 'the lease runs from {year} to {year2}', 'is there parking for {cars} cars?',
  'thank you, I like it', 'ok noted', 'please send more photos of the kitchen', 'is the area safe at night?', 'how far from the main road?',
  'the meter is prepaid', 'water flows {days} days a week', 'the deposit is {price}', 'we are {people} people', 'I work at the hospital nearby',
  'the total for {months} months is GH₵ {total}', 'ECG prepaid meter number is not needed', 'GH₵ {price} including service charge',
  'move in on {date}?', 'I can do {price}, final', 'the trotro station is {mins} minutes away', 'Act 220 says advance is max 6 months',
  'can I pay the advance in two parts?',
  'the gate closes at {time}',
  'there is a borehole and a poly tank',
  'how much is the service charge per month?',
  'I need a 2 bedroom close to {street}',
  'the bathroom tiles need fixing',
  'is it self-contained?',
  'any chamber and hall available?',
  'the compound is shared with {people} families',
  'I will bring my documents on {date}',
  'can you send the tenancy agreement here?',
  'GH₵ {price} is too much for me',
  'what is the minimum lease?',
  'electricity is prepaid, water is metered',
  'my move-in date is flexible',
  'does the landlord allow pets?',
  'the rent increase is {pct}% this year',
  'can I see the receipt for the deposit?',
  'it is {mins} minutes walk to the junction',
  'the place has {beds} rooms and a store room',
  'kindly confirm the viewing for {date} at {time}',
  'is the {sqm} sqm including the yard?',
  'I paid GH₵ {price} through RentOS',
  'the property ref {ref} looks good',
  'is {gps} the correct digital address?',
  'I like the one at house {house}, {street}',
  'between {price} and {total} is my range',
]

/** Cover words for semantic camouflage (§13.3), with matched genuine values. */
const CAMOUFLAGE: Array<{ template: string; genuine: (r: Rng) => string }> = [
  { template: 'the population of my town is {v}', genuine: (r) => `${int(r, 2, 900)},${String(int(r, 0, 999)).padStart(3, '0')}` },
  { template: 'my invoice number is {v}', genuine: (r) => `INV-${int(r, 2020, 2026)}-${String(int(r, 1, 9999)).padStart(4, '0')}` },
  { template: 'the score was {v}', genuine: (r) => `${int(r, 0, 5)}-${int(r, 0, 5)}` },
  { template: 'use this reference {v}', genuine: (r) => `RNT-${int(r, 10000, 99999)}` },
  { template: 'the coordinates are {v}', genuine: (r) => `5.${int(r, 5000, 6999)}, -0.${int(r, 1000, 2999)}` },
  { template: 'serial no: {v}', genuine: (r) => `SN-${int(r, 10000, 99999)}-AX` },
  { template: 'order {v} is ready', genuine: (r) => `#${int(r, 10000, 99999)}` },
  { template: 'the year is {v}', genuine: (r) => String(int(r, 1990, 2030)) },
  { template: 'price: {v}', genuine: (r) => `GH₵ ${int(r, 300, 9000).toLocaleString('en-US')}` },
  { template: 'my lucky numbers are {v}', genuine: (r) => `${int(r, 1, 49)}, ${int(r, 1, 49)} and ${int(r, 1, 49)}` },
  { template: 'room number {v}', genuine: (r) => String(int(r, 1, 450)) },
  { template: 'the amount due is {v}', genuine: (r) => `GH₵ ${int(r, 100, 20000).toLocaleString('en-US')}.00` },
  { template: 'the code is {v}', genuine: (r) => String(int(r, 1000, 999999)) },
  { template: 'my ID is {v}', genuine: (r) => `GHA-${int(r, 100000000, 999999999)}-${int(r, 0, 9)}` },
  { template: 'meter number {v}', genuine: (r) => `P${int(r, 100000, 999999)}` },
  { template: 'my age is {v}', genuine: (r) => String(int(r, 18, 80)) },
  { template: 'the date was {v}', genuine: (r) => `${int(r, 1, 28)}/${int(r, 1, 12)}/${int(r, 2020, 2026)}` },
]

function benignSlots(r: Rng): Record<string, string> {
  const year = int(r, 1995, 2026)
  return {
    price: int(r, 300, 15000).toLocaleString('en-US'),
    sale: int(r, 150, 3000).toLocaleString('en-US') + ',000',
    total: int(r, 1500, 120000).toLocaleString('en-US'),
    date: pick(r, [`${int(r, 1, 28)}/${int(r, 1, 12)}/${int(r, 2025, 2027)}`, `${int(r, 1, 28)}th ${pick(r, ['Oct', 'November', 'Dec', 'January'])}`, pick(r, ['Monday', 'Saturday', 'tomorrow', 'next week Friday'])]),
    time: pick(r, [`${int(r, 7, 11)}am`, `${int(r, 1, 6)}pm`, `${int(r, 7, 18)}:${pick(r, ['00', '15', '30', '45'])}`]),
    months: String(pick(r, [3, 6, 12, 24])), beds: String(int(r, 1, 6)), baths: String(int(r, 1, 4)), plot: `${int(r, 50, 120)} by ${int(r, 50, 100)}`,
    ref: pick(r, ['7KQ2M9A', 'H4TN8PX', 'R2D7Q3K', 'M8W5ZPA', 'C3VJ7TR']), gps: `${pick(r, ['GA', 'AK', 'GT', 'CR', 'GE'])}-${int(r, 100, 999)}-${int(r, 1000, 9999)}`,
    house: String(int(r, 1, 120)), street: pick(r, ['Oxford Street', '3rd Avenue', 'Spintex Road', 'Lagos Avenue', 'Ring Road']), room: String(int(r, 1, 40)),
    year: String(year), year2: String(year + int(r, 1, 3)), sqm: String(int(r, 40, 400)), pct: String(int(r, 5, 10)), cars: String(int(r, 1, 4)),
    days: String(int(r, 2, 7)), people: String(int(r, 2, 6)), mins: String(int(r, 2, 25)),
  }
}

const NOISE_PREFIX = ['', '', '', 'hi ', 'hello ', 'pls ', 'ok ', 'boss ', 'chale ', 'abeg ', 'massa ', 'madam ', 'sir ', 'bro ']
const NOISE_SUFFIX = ['', '', '', ' pls', ' thanks', '!', ' 🙏', ' ok?', ' asap', ' 👍', '.', ' boss']

function noise(r: Rng, text: string): string {
  let out = `${pick(r, NOISE_PREFIX)}${text}${pick(r, NOISE_SUFFIX)}`
  if (chance(r, 0.25)) out = out.toUpperCase()
  else if (chance(r, 0.4)) out = out.charAt(0).toUpperCase() + out.slice(1)
  return out
}


// ─── Phrase grammar ───
// Templates teach the model phrasings; the grammar teaches it constructions,
// so a held-out frame tests whether it generalises to wording it never saw.

type Frame = (r: Rng) => string
const opt = (r: Rng, items: readonly string[]) => pick(r, items)

const YOUR = ['your', 'ur', 'yr', 'your own']
const CONTACT_NOUN = ['number', 'phone number', 'mobile number', 'whatsapp', 'whatsapp number', 'contact', 'contacts', 'line', 'digits', 'email', 'email address', 'IG', 'insta', 'telegram', 'snap', 'handle', 'details', 'cell']
const APP = ['whatsapp', 'telegram', 'signal', 'IG', 'instagram', 'snapchat', 'facebook', 'imo', 'messenger', 'the green app', 'the photo app', 'tiktok']
const REACH = ['call', 'reach', 'text', 'whatsapp', 'contact', 'ring', 'get']
const Q = ['?', '', '??', ' pls?', '?']

const REQUEST_FRAMES: Frame[] = [
  (r) => `${opt(r, ['send me', 'give me', 'drop', 'share', 'can I get', 'can I have', 'could you send', 'mind sharing', 'let me have', 'I need', 'forward', 'text me', 'dm me', 'pass me'])} ${opt(r, YOUR)} ${opt(r, CONTACT_NOUN)}${opt(r, ['', ' pls', ' please', ' so I call you', ' so we talk', ' asap', ' for the viewing'])}`,
  (r) => `${opt(r, ['what is', "what's", 'whats', 'what be'])} ${opt(r, YOUR)} ${opt(r, CONTACT_NOUN)}${opt(r, Q)}`,
  (r) => `${opt(r, ['which', 'what'])} ${opt(r, ['number', 'line', 'email', 'whatsapp number'])} ${opt(r, ['do you use', 'are you on', 'can I use', 'is best'])}${opt(r, [' for whatsapp', ' to reach you', '', ' for calls'])}${opt(r, Q)}`,
  (r) => `${opt(r, ['do you have', 'are you on', 'you dey', 'do you use', 'are you active on'])} ${opt(r, APP)}${opt(r, Q)}`,
  (r) => `is there a ${opt(r, ['number', 'line', 'way', 'email'])} I can ${opt(r, REACH)} you ${opt(r, ['on', 'with', 'through', 'outside here'])}${opt(r, Q)}`,
  (r) => `how ${opt(r, ['can', 'do', 'will'])} I ${opt(r, REACH)} you ${opt(r, ['outside here', 'directly', 'on phone', 'privately', 'personally', 'off the app'])}${opt(r, Q)}`,
  (r) => `where can I ${opt(r, ['dm', 'message', 'call', 'text', 'reach', 'find'])} you${opt(r, [' outside', ' privately', '', ' later'])}${opt(r, Q)}`,
]

const LETS = ["let's", 'lets', 'let us', 'we can', 'we should', 'can we', 'better we', 'I prefer we', 'make we', 'why not']
const TALK = ['talk', 'chat', 'continue', 'discuss this', 'move this', 'speak', 'finish this', 'sort this out', 'yarn', 'deal']
const MOVE_OFF_FRAMES: Frame[] = [
  (r) => `${opt(r, LETS)} ${opt(r, TALK)} on ${opt(r, APP)}${opt(r, ['', ' instead', ', it is faster', ' later', ' tonight'])}`,
  (r) => `${opt(r, LETS)} ${opt(r, TALK)} ${opt(r, ['outside the app', 'offline', 'privately', 'elsewhere', 'in private', 'directly', 'on phone', 'by phone', 'over the phone', 'off RentOS'])}`,
  (r) => `${opt(r, ["I'll", 'I will', 'let me', 'lemme', 'I go', "I'm going to"])} ${opt(r, ['call', 'text', 'whatsapp', 'ring', 'phone', 'ping', 'DM', 'email', 'flash'])} you${opt(r, ['', ' later', ' tonight', ' after work', ' on my other line', ' in a bit'])}`,
  (r) => `${opt(r, ['call', 'flash', 'beep', 'ring', 'text', 'whatsapp', 'DM', 'inbox', 'email', 'phone'])} me${opt(r, [' later', ' tonight', ' on my line', ' on whatsapp', ' after 5', ' when you see this', ' pls', ' asap'])}`,
  (r) => `${opt(r, ['pay', 'send', 'transfer', 'give me'])} ${opt(r, ['the rent', 'the deposit', 'the advance', 'the money', 'the agent fee', 'it', 'the viewing fee'])} ${opt(r, ['to me directly', 'to my momo', 'into my account', 'in cash', 'cash in hand', 'outside the app', 'straight to me', 'when you come, no app'])}`,
  (r) => `${opt(r, ['no need to use', "we don't need", 'forget', 'skip', "let's avoid", 'bypass', 'we can do without'])} ${opt(r, ['RentOS', 'the app', 'the platform', 'the app fees', 'this app'])}${opt(r, ['', ', just come', ', pay me', ' for this'])}`,
  (r) => `${opt(r, ['find', 'add', 'follow', 'message', 'look for', 'catch'])} me on ${opt(r, APP)}${opt(r, ['', ' later', ' for more pictures', ' boss'])}`,
]

const POLICY_FRAMES: Frame[] = [
  (r) => `${opt(r, ['why', 'how come', 'why oh why'])} ${opt(r, ["can't I", 'is it not allowed to', "won't the app let me", 'does it stop me when I try to'])} ${opt(r, ['share', 'send', 'give', 'post'])} ${opt(r, ['my', 'our'])} ${opt(r, ['number', 'whatsapp', 'email', 'contact'])}${opt(r, Q)}`,
  (r) => `${opt(r, ['the app', 'RentOS', 'the system', 'it'])} ${opt(r, ['blocked', 'stopped', 'removed', 'rejected'])} my ${opt(r, ['message', 'number', 'contact', 'text'])}${opt(r, ['', ', why', ' again', ' earlier'])}`,
  (r) => `is it ${opt(r, ['allowed', 'okay', 'safe', 'against the rules'])} to ${opt(r, ['share', 'send', 'exchange'])} ${opt(r, ['numbers', 'contacts', 'emails', 'phone numbers'])} ${opt(r, ['here', 'on RentOS', 'in this chat'])}${opt(r, Q)}`,
  (r) => `${opt(r, ['ok', 'alright', 'fine', 'noted'])}, ${opt(r, ['we will', "I'll", 'let us'])} ${opt(r, ['keep', 'continue'])} ${opt(r, ['the chat', 'chatting', 'everything', 'the conversation'])} ${opt(r, ['here', 'on RentOS', 'in the app'])}`,
  (r) => `${opt(r, ['I understand', 'noted', 'fine', 'got it'])}, no ${opt(r, ['numbers', 'contacts', 'phone numbers', 'emails'])} ${opt(r, ['on RentOS', 'here', 'in the chat'])}`,
]

const BENIGN_FRAMES: Frame[] = [
  (r) => `${opt(r, ['my phone', 'my battery', 'my network', 'my data'])} ${opt(r, ['died', 'is off', 'was off', 'is bad', 'finished'])}${opt(r, ['', ', sorry', ', that is why I was quiet', ' yesterday'])}`,
  (r) => `${opt(r, ['I saw', 'I found', 'I got', 'my friend sent me'])} ${opt(r, ['the listing', 'your house', 'this place', 'the flat'])} on ${opt(r, ['facebook', 'instagram', 'whatsapp status', 'tiktok', 'twitter', 'a whatsapp group'])}`,
  (r) => `${opt(r, ["I'll", 'I will'])} ${opt(r, ['reply', 'message you', 'answer', 'update you', 'confirm'])} here ${opt(r, ['later', 'soon', "when I'm free", "once I'm home", 'after work', 'tomorrow'])}`,
  (r) => `${opt(r, ['I', 'my sister', 'my husband', 'my boss'])} ${opt(r, ['use', 'uses'])} ${opt(r, ['whatsapp', 'instagram', 'facebook', 'telegram'])} ${opt(r, ['for business', 'a lot', 'to find houses', 'for work'])}`,
  (r) => `${opt(r, ['did you', 'have you'])} ${opt(r, ['get', 'see', 'receive', 'read'])} my message here${opt(r, Q)}`,
  (r) => `${opt(r, ['the', 'my'])} ${opt(r, ['email', 'SMS', 'notification', 'alert'])} from RentOS came ${opt(r, ['late', 'this morning', 'twice', 'just now'])}`,
  (r) => `${opt(r, ['I', 'we'])} called ${opt(r, ['the bank', 'my employer', 'the plumber', 'the electrician', 'ECG', 'the caretaker'])} ${opt(r, ['about', 'for'])} ${opt(r, ['the transfer', 'the letter', 'the leak', 'the meter', 'the keys'])}`,
]

/** One sentence from the grammar, with its family id. */
export function grammarExample(r: Rng, label: 'REQUEST_CONTACT' | 'MOVE_OFF_PLATFORM' | 'DISCUSS_CONTACT_POLICY' | 'BENIGN_CONTACT_REFERENCE'): { text: string; family: string } {
  const frames = label === 'REQUEST_CONTACT' ? REQUEST_FRAMES : label === 'MOVE_OFF_PLATFORM' ? MOVE_OFF_FRAMES : label === 'DISCUSS_CONTACT_POLICY' ? POLICY_FRAMES : BENIGN_FRAMES
  const i = int(r, 0, frames.length - 1)
  return { text: frames[i](r), family: `${label.toLowerCase()}_g:${i}` }
}

/** Family ids: the template index, so a split can hold whole families out. */
const fam = (group: string, index: number) => `${group}:${index}`

export interface GenerateOptions {
  /** Relative weights per label. */
  mix?: Partial<Record<IntentLabel | 'CAMOUFLAGE_POS' | 'CAMOUFLAGE_NEG', number>>
}

const DEFAULT_MIX = {
  NO_CONTACT: 30, SHARE_CONTACT: 26, REQUEST_CONTACT: 10, MOVE_OFF_PLATFORM: 10,
  DISCUSS_CONTACT_POLICY: 5, BENIGN_CONTACT_REFERENCE: 7, CAMOUFLAGE_POS: 6, CAMOUFLAGE_NEG: 6,
}

/** One labelled example. */
export function generateExample(r: Rng, mix = DEFAULT_MIX): Example {
  const entries = Object.entries(mix) as [keyof typeof DEFAULT_MIX, number][]
  const total = entries.reduce((s, [, w]) => s + w, 0)
  let roll = r() * total
  let kind = entries[0][0]
  for (const [key, weight] of entries) { roll -= weight; if (roll <= 0) { kind = key; break } }

  switch (kind) {
    case 'SHARE_CONTACT': {
      const which = pick(r, ['phone', 'phone', 'phone', 'email', 'handle', 'link'] as const)
      if (which === 'phone') {
        const i = int(r, 0, SHARE_PHONE.length - 1)
        const d = disguisePhone(r, ghanaMobile(r))
        return { text: noise(r, fill(SHARE_PHONE[i], { phone: d.text })), label: 'SHARE_CONTACT', family: fam('share_phone', i), leak: true, block: true, recipe: d.recipe }
      }
      if (which === 'email') {
        const i = int(r, 0, SHARE_EMAIL.length - 1)
        const d = disguiseEmail(r, emailAddress(r))
        return { text: noise(r, fill(SHARE_EMAIL[i], { email: d.text })), label: 'SHARE_CONTACT', family: fam('share_email', i), leak: true, block: true, recipe: d.recipe }
      }
      if (which === 'handle') {
        const i = int(r, 0, SHARE_HANDLE.length - 1)
        return { text: noise(r, fill(SHARE_HANDLE[i], { handle: handleName(r) })), label: 'SHARE_CONTACT', family: fam('share_handle', i), leak: true, block: true, recipe: ['handle'] }
      }
      const i = int(r, 0, SHARE_LINK.length - 1)
      return { text: noise(r, fill(SHARE_LINK[i], { handle: handleName(r).replace(/\./g, ''), intl: `233${ghanaMobile(r).slice(1)}` })), label: 'SHARE_CONTACT', family: fam('share_link', i), leak: true, block: true, recipe: ['link'] }
    }
    case 'REQUEST_CONTACT': {
      if (chance(r, 0.5)) { const g = grammarExample(r, 'REQUEST_CONTACT'); return { text: noise(r, g.text), label: 'REQUEST_CONTACT', family: g.family, leak: false, block: true, recipe: ['grammar'] } }
      const i = int(r, 0, REQUEST.length - 1)
      return { text: noise(r, REQUEST[i]), label: 'REQUEST_CONTACT', family: fam('request', i), leak: false, block: true, recipe: [] }
    }
    case 'MOVE_OFF_PLATFORM': {
      if (chance(r, 0.5)) { const g = grammarExample(r, 'MOVE_OFF_PLATFORM'); return { text: noise(r, g.text), label: 'MOVE_OFF_PLATFORM', family: g.family, leak: false, block: true, recipe: ['grammar'] } }
      const i = int(r, 0, MOVE_OFF.length - 1)
      return { text: noise(r, MOVE_OFF[i]), label: 'MOVE_OFF_PLATFORM', family: fam('move_off', i), leak: false, block: true, recipe: [] }
    }
    case 'DISCUSS_CONTACT_POLICY': {
      if (chance(r, 0.5)) { const g = grammarExample(r, 'DISCUSS_CONTACT_POLICY'); return { text: noise(r, g.text), label: 'DISCUSS_CONTACT_POLICY', family: g.family, leak: false, block: false, recipe: ['grammar'] } }
      const i = int(r, 0, POLICY.length - 1)
      return { text: noise(r, POLICY[i]), label: 'DISCUSS_CONTACT_POLICY', family: fam('policy', i), leak: false, block: false, recipe: [] }
    }
    case 'BENIGN_CONTACT_REFERENCE': {
      if (chance(r, 0.5)) { const g = grammarExample(r, 'BENIGN_CONTACT_REFERENCE'); return { text: noise(r, g.text), label: 'BENIGN_CONTACT_REFERENCE', family: g.family, leak: false, block: false, recipe: ['grammar'] } }
      const i = int(r, 0, BENIGN_REFERENCE.length - 1)
      return { text: noise(r, BENIGN_REFERENCE[i]), label: 'BENIGN_CONTACT_REFERENCE', family: fam('benign_ref', i), leak: false, block: false, recipe: [] }
    }
    case 'CAMOUFLAGE_POS': {
      const i = int(r, 0, CAMOUFLAGE.length - 1)
      const d = disguisePhone(r, ghanaMobile(r), { maps: ['digits', 'digits', 'mixed_words', 'leet'], joiners: ['none', 'none', 'space', 'grouped', 'separator'] })
      return { text: noise(r, fill(CAMOUFLAGE[i].template, { v: d.text })), label: 'SHARE_CONTACT', family: fam('camouflage', i), leak: true, block: true, recipe: ['camouflage', ...d.recipe] }
    }
    case 'CAMOUFLAGE_NEG': {
      const i = int(r, 0, CAMOUFLAGE.length - 1)
      return { text: noise(r, fill(CAMOUFLAGE[i].template, { v: CAMOUFLAGE[i].genuine(r) })), label: 'NO_CONTACT', family: fam('camouflage_neg', i), leak: false, block: false, recipe: ['camouflage_neg'] }
    }
    default: {
      const i = int(r, 0, NO_CONTACT.length - 1)
      return { text: noise(r, fill(NO_CONTACT[i], benignSlots(r))), label: 'NO_CONTACT', family: fam('no_contact', i), leak: false, block: false, recipe: [] }
    }
  }
}

export function generateExamples(seed: number, count: number, mix?: GenerateOptions['mix']): Example[] {
  const r = makeRng(seed)
  const merged = { ...DEFAULT_MIX, ...(mix ?? {}) } as typeof DEFAULT_MIX
  return Array.from({ length: count }, () => generateExample(r, merged))
}

// ─── Cross-message sequences (§13.5) ───

const FILLERS = ['ok', 'wait', 'hold on', 'sorry', 'are you there?', 'hello', '👍', 'yes', 'noted', 'the place looks nice', 'is it still available?', 'I like the kitchen', 'what about parking?', 'lol', 'one sec', 'network is bad']

function digitPieces(r: Rng, digits: string, style: 'digit' | 'groups' | 'words' | 'symbols' | 'mixed'): string[] {
  const chars = digits.split('')
  if (style === 'digit') return chars
  if (style === 'words') return chars.map((d) => (d === '0' && chance(r, 0.3) ? 'oh' : WORDS_EN[Number(d)]))
  if (style === 'symbols') {
    const out: string[] = []
    for (let i = 0; i < chars.length; i += 2) out.push(`${chars[i]}${chars[i + 1] ?? ''}${pick(r, ['@', '$', '-', '^', '!', '*', '#', ''])}`)
    return out
  }
  const out: string[] = []
  let at = 0
  while (at < chars.length) {
    const size = Math.min(chars.length - at, int(r, 1, 4))
    const piece = chars.slice(at, at + size)
    out.push(style === 'mixed' && chance(r, 0.4) ? piece.map((d) => WORDS_EN[Number(d)]).join(' ') : piece.join(''))
    at += size
  }
  return out
}

function withFillers(r: Rng, pieces: string[], fillerRate: number): string[] {
  const out: string[] = []
  pieces.forEach((p, i) => {
    if (i > 0 && chance(r, fillerRate)) out.push(pick(r, FILLERS))
    out.push(p)
  })
  return out
}

function timed(r: Rng, texts: string[], maxGapSec: number): Turn[] {
  let t = 0
  return texts.map((text) => { t += int(r, 3, maxGapSec); return { text, offsetSec: t } })
}

/** A contact detail split across several messages, or a matching benign conversation. */
export function generateSequence(r: Rng, positive: boolean): Sequence {
  if (!positive) {
    const style = pick(r, ['answers', 'prices', 'dates', 'counts'] as const)
    const pool = {
      answers: () => [pick(r, ['2500', '1800', '3000']), pick(r, ['6', '12', '24']), pick(r, ['1200', '900', '2000']), 'ok', pick(r, ['3', '2'])],
      prices: () => [`${int(r, 1, 9)}000`, 'or', `${int(r, 1, 9)}500`, 'final', `${int(r, 1, 9)}00`],
      dates: () => [String(int(r, 1, 28)), pick(r, ['Oct', '10', 'November']), String(int(r, 2025, 2027)), 'at', `${int(r, 7, 12)}`, `${pick(r, ['30', '00'])}`],
      counts: () => [String(int(r, 1, 5)), 'bedrooms', String(int(r, 1, 3)), 'baths', String(int(r, 1, 4)), 'cars'],
    }[style]()
    return { turns: timed(r, withFillers(r, pool, 0.3), 90), block: false, family: `seq_neg:${style}`, recipe: [style] }
  }
  const kind = pick(r, ['phone', 'phone', 'phone', 'phone', 'email', 'handle'] as const)
  if (kind === 'phone') {
    const style = pick(r, ['digit', 'groups', 'words', 'symbols', 'mixed'] as const)
    const intl = chance(r, 0.2)
    const local = ghanaMobile(r)
    const digits = intl ? `233${local.slice(1)}` : local
    const pieces = digitPieces(r, digits, style)
    const fillerRate = pick(r, [0, 0, 0.2, 0.35])
    let texts = withFillers(r, pieces, fillerRate)
    // Sometimes the last piece hides in an ordinary sentence (§13.5).
    if (style === 'groups' && chance(r, 0.25)) texts = [...texts.slice(0, -1), `and ${texts[texts.length - 1]} too`]
    return { turns: timed(r, texts, 60), block: true, family: `seq_phone:${style}`, recipe: [style, intl ? 'intl' : 'local', `fillers:${fillerRate}`] }
  }
  if (kind === 'email') {
    const local = localPart(r)
    const provider = pick(r, PROVIDERS)
    const [host, tld] = provider.split('.')
    const texts = pick(r, [
      [local, `at ${host}`, `dot ${tld}`],
      [local, '@', provider],
      [`${local}@`, provider],
      [local, `@${host}`, `.${tld}`],
    ])
    return { turns: timed(r, withFillers(r, texts, 0.2), 60), block: true, family: 'seq_email', recipe: ['email'] }
  }
  const handle = handleName(r)
  const texts = pick(r, [
    ['insta', handle],
    ['my ig', `is ${handle}`],
    ['snap', `@${handle}`],
    ['find me on insta', `user name ${handle.replace(/\./g, ' dot ')}`],
  ])
  return { turns: timed(r, texts, 60), block: true, family: 'seq_handle', recipe: ['handle'] }
}

export function generateSequences(seed: number, count: number, positiveShare = 0.6): Sequence[] {
  const r = makeRng(seed)
  return Array.from({ length: count }, () => generateSequence(r, r() < positiveShare))
}
