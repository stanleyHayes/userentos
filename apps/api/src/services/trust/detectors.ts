/**
 * TRUST-2 deterministic detectors (spec §6.1). Each reads the normalized
 * views and reports evidence: what kind of contact structure, how confident,
 * which view it surfaced in, and whether it took de-obfuscation to find it.
 * Detectors never decide; the policy engine does (§11).
 *
 * Raw contact values stay in memory. Hits carry a masked form for audit.
 */
import { isValidPhoneNumber } from 'libphonenumber-js'
import type { NormalizedViews } from './normalizer.js'

export type HitKind = 'phone' | 'email' | 'handle' | 'domain' | 'app' | 'share' | 'request' | 'move_off' | 'policy' | 'lexicon'
export type HitView = 'original' | 'compact' | 'digitWords' | 'symbolDigits' | 'verbalEmail' | 'spaced' | 'context'

export interface RuleHit {
  detector: string
  kind: HitKind
  /** Structural confidence, 0..1. */
  confidence: number
  view: HitView
  /** Found only after undoing a disguise. */
  obfuscated: boolean
  /** Safe for logs: shape, never the value. */
  masked: string
}

export interface DetectorResult {
  hits: RuleHit[]
  /** Short digit chunks (2–8 digits), kept in memory for cross-message reconstruction. */
  digitFragments: string[]
  /** Raw phone candidates found in this message, in memory only. */
  phoneCandidates: string[]
}

// Ghana numbering plan: mobile prefixes in use, and fixed lines (03x).
const GH_MOBILE_PREFIX = '(?:20|23|24|25|26|27|28|29|50|53|54|55|56|57|59)'
const GH_MOBILE_LOCAL = new RegExp(`^0${GH_MOBILE_PREFIX}\\d{7}$`)
const GH_MOBILE_INTL = new RegExp(`^(?:00)?233${GH_MOBILE_PREFIX}\\d{7}$`)
const GH_MOBILE_NO_ZERO = new RegExp(`^${GH_MOBILE_PREFIX}\\d{7}$`)
const GH_LANDLINE = /^(?:0|(?:00)?233)3[0-9]\d{7}$/

export interface PhonePlausibility { score: number; detector: string }

/**
 * How much a digit string looks like a reachable phone number (§6.1 phone
 * detector). Ghana's numbering plan is checked first. A foreign number counts
 * only when it was written in international form (a + or 00 in front):
 * almost any long digit string is valid somewhere in the world, so reading
 * IDs, coordinates and invoice numbers as foreign phones would block them.
 */
export function phonePlausibility(digits: string, options: { explicitIntl?: boolean } = {}): PhonePlausibility | null {
  if (GH_MOBILE_LOCAL.test(digits)) return { score: 1, detector: 'phone.gh_mobile' }
  if (GH_MOBILE_INTL.test(digits)) return { score: 1, detector: 'phone.gh_mobile_intl' }
  if (GH_LANDLINE.test(digits)) return { score: 0.9, detector: 'phone.gh_landline' }
  if (GH_MOBILE_NO_ZERO.test(digits)) return { score: 0.85, detector: 'phone.gh_mobile_no_zero' }
  const explicit = options.explicitIntl || digits.startsWith('00')
  const intl = digits.startsWith('00') ? digits.slice(2) : digits
  if (explicit && intl.length >= 10 && intl.length <= 15 && !intl.startsWith('0') && isValidPhoneNumber(`+${intl}`)) return { score: 0.85, detector: 'phone.international' }
  if (digits.length >= 9 && digits.length <= 15) return { score: 0.35, detector: 'phone.long_digit_run' }
  return null
}

/** Digit strings that sit inside an ID or reference code: "GHA-884717462-5", "INV-2024-5238". */
function codeDigits(original: string): string[] {
  return [...original.matchAll(/\b[a-z]{2,5}[-/ ]?(\d[\d-]{4,})\b/gi)].map((m) => m[1].replace(/\D/g, ''))
}

const maskDigits = (digits: string) => `${digits.length}-digit number`

/** Clean numbers in the original text: "+233 24 412 3456", "024-412-3456", "(024) 4123456". */
const ORIGINAL_NUMBER = /(?:\+|\b)\(?\d[\d\s().-]{6,}\d\b/g

function phoneHits(views: NormalizedViews): { hits: RuleHit[]; candidates: string[]; fragments: string[] } {
  const hits: RuleHit[] = []
  const candidates: string[] = []
  const seen = new Set<string>()
  const inCodes = codeDigits(views.original)
  const add = (raw: string, view: HitView, obfuscated: boolean, fullFormatOnly = false) => {
    const explicitIntl = raw.startsWith('+')
    const digits = raw.replace(/\D/g, '')
    if (seen.has(digits)) return
    const plausible = phonePlausibility(digits, { explicitIntl })
    if (!plausible) return
    if (fullFormatOnly && plausible.detector === 'phone.gh_mobile_no_zero') return
    seen.add(digits)
    candidates.push(digits)
    // The short no-zero form inside an ID or reference code is the code, not a phone.
    // Full Ghana formats count anywhere: "invoice 0244123456" is still a number (§13.3).
    const insideCode = plausible.detector === 'phone.gh_mobile_no_zero' && inCodes.some((code) => code.includes(digits))
    hits.push({
      detector: insideCode ? 'phone.inside_code' : plausible.detector,
      kind: 'phone',
      confidence: insideCode ? 0.4 : plausible.score,
      view,
      obfuscated,
      masked: maskDigits(digits),
    })
  }

  for (const match of views.original.matchAll(ORIGINAL_NUMBER)) add(match[0].replace(/[^\d+]/g, ''), 'original', false)
  for (const match of views.digitWords.matchAll(/\d{6,}/g)) add(match[0], 'digitWords', true)
  // Digits spread out with spaces or symbols between them: "0 2 4 4 1 2 3 4 5 6".
  for (const match of views.digitWords.replace(/(\d)\s+(?=\d)/g, '$1').matchAll(/\d{9,}/g)) add(match[0], 'digitWords', true)
  for (const candidate of views.numberRunCandidates) add(candidate, 'digitWords', true)
  // One symbol standing in for any digit ("0@2$7-0^4 8 3 1 9", spec §18): a run
  // one digit short of a full Ghana number, with symbols inside it.
  for (const pattern of views.wildcardDigits) {
    for (let d = 0; d <= 9; d++) {
      const digits = pattern.replace('?', String(d))
      const plausible = phonePlausibility(digits)
      if (plausible && (plausible.detector === 'phone.gh_mobile' || plausible.detector === 'phone.gh_mobile_intl')) {
        if (!seen.has(pattern)) {
          seen.add(pattern)
          hits.push({ detector: 'phone.symbol_wildcard', kind: 'phone', confidence: 0.85, view: 'symbolDigits', obfuscated: true, masked: maskDigits(digits) })
        }
        break
      }
    }
  }
  // Disguised runs must reach a full Ghana or explicit international format:
  // the short no-zero form is too easy to hit by accident once symbols are read as digits.
  for (const run of views.symbolDigits) if (run.replace(/\D/g, '').length >= 9) add(run, 'symbolDigits', true, true)

  // Short chunks, for reassembly across messages (§13).
  const fragments = [...views.digitWords.matchAll(/\d{2,8}/g)].map((m) => m[0])
  return { hits, candidates, fragments }
}

const EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/g
const EMAIL_PROVIDERS = /\b[a-z0-9._-]{3,}\s*(?:@|\bat\b)\s*(?:gmail|googlemail|yahoo|ymail|outlook|hotmail|live|icloud|proton|protonmail|aol)\b/
/** "my gmail is kofi.mensah", "gmail: kofimensah22". */
const PROVIDER_IS = /\b(?:gmail|yahoo|ymail|outlook|hotmail|icloud|protonmail|proton)\s*(?:address|account|id)?\s*(?:is|:|-|=)\s*([a-z0-9][a-z0-9._-]{2,})/
const NOT_A_MAILBOX = new Set(['down', 'slow', 'working', 'not', 'full', 'blocked', 'fine', 'ok', 'okay', 'the', 'my', 'your', 'verified', 'open', 'closed', 'better', 'best', 'free', 'easy', 'hacked', 'gone', 'back', 'broken', 'off', 'on', 'there', 'here', 'also', 'still', 'better', 'faster', 'full', 'acting', 'giving', 'showing', 'asking', 'bad', 'good', 'what', 'where', 'how', 'same', 'different', 'old', 'new', 'linked'])

function emailHits(views: NormalizedViews): RuleHit[] {
  const hits: RuleHit[] = []
  const exact = new Set([...views.lower.matchAll(EMAIL)].map((m) => m[0]))
  exact.forEach(() => hits.push({ detector: 'email.exact', kind: 'email', confidence: 1, view: 'original', obfuscated: false, masked: '<email>' }))
  for (const view of ['compact', 'verbalEmail'] as const) {
    for (const match of views[view].matchAll(EMAIL)) {
      if (exact.has(match[0]) || [...exact].some((e) => match[0].includes(e))) continue
      hits.push({ detector: `email.${view}`, kind: 'email', confidence: 0.95, view, obfuscated: true, masked: '<email>' })
    }
  }
  if (!hits.length && EMAIL_PROVIDERS.test(views.spaced)) {
    hits.push({ detector: 'email.provider_mention', kind: 'email', confidence: 0.85, view: 'spaced', obfuscated: true, masked: '<email>' })
  }
  const named = views.lower.match(PROVIDER_IS)
  if (!hits.length && named && !NOT_A_MAILBOX.has(named[1])) {
    hits.push({ detector: 'email.provider_named', kind: 'email', confidence: 0.85, view: 'original', obfuscated: true, masked: '<email>' })
  }
  return hits
}

/**
 * Links that carry no way to reach a person: RentOS itself (sharing a listing
 * keeps people here), its image host (photos in a post), maps (directions to a
 * viewing) and government sites. A phone number inside any URL is still caught
 * by the phone detector.
 */
const SAFE_HOST = /(?:^|\.)(?:userentos\.com|gov\.gh)$|^res\.cloudinary\.com$|^maps\.google\.[a-z.]+$|^maps\.app\.goo\.gl$/
const GOOGLE_HOST = /^google\.[a-z.]+$/
const MESSAGING_DOMAINS = /\b(?:wa\.me|wa\.link|chat\.whatsapp\.com|api\.whatsapp\.com|t\.me|telegram\.me|m\.me|fb\.me|facebook\.com|fb\.com|instagram\.com|instagr\.am|tiktok\.com|snapchat\.com|x\.com|twitter\.com|threads\.net|linktr\.ee|bit\.ly|tinyurl\.com|signal\.me|discord\.gg|discord\.com|wechat\.com|viber\.com)\b/
const TLDS = '(?:com|net|org|gh|io|me|co|ly|app|info|biz|xyz|link|page|site|online|store|shop|live|tv|ng|uk|us)'
const URL_EXPLICIT = /\b(?:https?|hxxps?):\/\/[^\s]+|\bwww\.[^\s]+/g
const BARE_DOMAIN = new RegExp(`\\b((?:[a-z0-9_-]{2,}\\.)+${TLDS})\\b(\\/\\S*)?`, 'g')
const VERBAL_DOMAIN = new RegExp(`\\b([a-z0-9-]{2,})\\s*(?:dot|\\[dot\\]|\\(dot\\))\\s*${TLDS}\\b`, 'g')

function splitUrl(url: string): { host: string; path: string } {
  const rest = url.replace(/^(?:https?|hxxps?):\/\//, '').replace(/^www\./, '')
  const cut = rest.search(/[/?#]/)
  return cut === -1 ? { host: rest, path: '' } : { host: rest.slice(0, cut), path: rest.slice(cut) }
}

export function isSafeLink(host: string, path = ''): boolean {
  return SAFE_HOST.test(host) || (GOOGLE_HOST.test(host) && path.startsWith('/maps'))
}

function domainHits(views: NormalizedViews): RuleHit[] {
  const hits: RuleHit[] = []
  const lowerNoEmails = views.lower.replace(EMAIL, ' ')
  const links = new Map<string, string>()
  for (const match of lowerNoEmails.matchAll(URL_EXPLICIT)) {
    const { host, path } = splitUrl(match[0])
    links.set(host, links.get(host) ?? path)
  }
  // Bare domains outside the explicit URLs ("maps.app" inside a maps.app.goo.gl link is not a site).
  for (const match of lowerNoEmails.replace(URL_EXPLICIT, ' ').matchAll(BARE_DOMAIN)) {
    const { host } = splitUrl(match[1])
    if (!links.has(host)) links.set(host, match[2] ?? '')
  }
  // Short messaging links that a domain pattern misses (t.me, m.me, linktr.ee).
  const messagingAnywhere = MESSAGING_DOMAINS.test(lowerNoEmails) && ![...links.keys()].some((host) => MESSAGING_DOMAINS.test(host))
  if (messagingAnywhere) hits.push({ detector: 'domain.messaging', kind: 'domain', confidence: 1, view: 'original', obfuscated: false, masked: '<messaging link>' })
  for (const [host, path] of links) {
    if (isSafeLink(host, path)) continue
    const messaging = MESSAGING_DOMAINS.test(host)
    hits.push({ detector: messaging ? 'domain.messaging' : 'domain.external', kind: 'domain', confidence: messaging ? 1 : 0.8, view: 'original', obfuscated: false, masked: messaging ? '<messaging link>' : '<link>' })
  }
  for (const match of views.spaced.matchAll(VERBAL_DOMAIN)) {
    if (isSafeLink(`${match[1]}.com`)) continue
    hits.push({ detector: 'domain.verbalized', kind: 'domain', confidence: 0.85, view: 'spaced', obfuscated: true, masked: '<link>' })
  }
  return hits
}

const PLATFORMS = 'ig|insta|instagram|snap|snapchat|sc|tiktok|tik tok|tt|fb|facebook|twitter|telegram|tg|threads|x'
const PLATFORM_HANDLE = new RegExp(`\\b(?:${PLATFORMS})\\s*(?:handle|id|username|user name|name|account|page)?\\s*(?:is|:|-|=|@)\\s*@?([a-z0-9_.]{2,30})`, 'i')
const AT_HANDLE = /(?:^|[^\w@.])@([a-z0-9_](?:[a-z0-9_.]{1,28}[a-z0-9_])?)(?![\w.]*\.[a-z]{2,})/i
const SEARCH_HANDLE = new RegExp(`\\b(?:search|look up|find|follow|add)\\s+(?:me\\s+)?(?:for\\s+)?@?[a-z0-9_.]{2,30}(?:\\s+[a-z0-9_.]{2,30}){0,2}\\s+on\\s+(?:${PLATFORMS})\\b`, 'i')
/** "insta efuaboateng": a platform name opening a clause, then one long name-like token. */
const PLATFORM_THEN_NAME = /(?:^|[.!?,]\s*|\b(?:my|our|add|follow|dm|abeg|pls|please|hi|hello|chale|massa|madam|sir|bro|boss|ok|okay|yes|its|it\s*s)\s+)(?:ig|insta|instagram|snap|snapchat|tiktok|telegram|tg)\s+@?([a-z][a-z0-9_.]{5,29})(?=\s*(?:$|[.!?,;:)]|\s(?:pls|please|plz|ok|okay|boss|thanks|thank|asap|sir|madam|massa|bro|chale|abeg|for|add|follow|dm)\b))/i
const NOT_A_HANDLE = new Set(['account', 'accounts', 'stories', 'story', 'reels', 'photos', 'videos', 'profile', 'profiles', 'handle', 'username', 'channel', 'channels', 'status', 'today', 'yesterday', 'tonight', 'please', 'marketplace', 'business', 'advert', 'adverts', 'posts', 'page', 'pages', 'groups', 'group', 'people', 'users', 'followers', 'friends', 'community', 'everyone', 'someone', 'always', 'sometimes', 'already', 'before', 'nowadays', 'lately', 'recently', 'messages', 'chats', 'calls', 'updates', 'search', 'settings', 'verified', 'banned', 'blocked', 'hacked', 'deleted', 'removed', 'scams', 'scammers', 'ads'])

/** "ig kofi_homes", "insta kofi.mensah22": a platform name then a handle-shaped token (letters plus _ . or digits). */
const BARE_PLATFORMS = 'ig|insta|instagram|snap|snapchat|tiktok|telegram|tg|fb|facebook|twitter|threads'
const PLATFORM_BARE_HANDLE = new RegExp(`\\b(?:${BARE_PLATFORMS})\\s+(?:@\\s*)?(?=[a-z0-9_.]*[a-z])[a-z0-9]*[_.\\d][a-z0-9_.]*[a-z0-9_]`, 'i')
const PLATFORM_WORD = new RegExp(`\\b(?:${PLATFORMS}|whatsapp|wa)\\b`, 'i')

function handleHits(views: NormalizedViews): RuleHit[] {
  const hits: RuleHit[] = []
  if (PLATFORM_HANDLE.test(views.lower)) hits.push({ detector: 'handle.platform', kind: 'handle', confidence: 0.95, view: 'original', obfuscated: false, masked: '<handle>' })
  else if (PLATFORM_BARE_HANDLE.test(views.lower)) hits.push({ detector: 'handle.platform_bare', kind: 'handle', confidence: 0.9, view: 'original', obfuscated: false, masked: '<handle>' })
  if (SEARCH_HANDLE.test(views.spaced) || SEARCH_HANDLE.test(views.lower)) hits.push({ detector: 'handle.search', kind: 'handle', confidence: 0.85, view: 'spaced', obfuscated: true, masked: '<handle>' })
  const named = views.lower.match(PLATFORM_THEN_NAME)
  if (named && !NOT_A_HANDLE.has(named[1]) && !hits.some((h) => h.detector.startsWith('handle.platform'))) {
    hits.push({ detector: 'handle.platform_name', kind: 'handle', confidence: 0.85, view: 'original', obfuscated: false, masked: '<handle>' })
  }
  if (AT_HANDLE.test(views.lower)) {
    // An @handle on its own may be a mention; beside a platform name it is an account.
    const withPlatform = PLATFORM_WORD.test(views.spaced)
    hits.push({ detector: withPlatform ? 'handle.at_platform' : 'handle.at', kind: 'handle', confidence: withPlatform ? 0.9 : 0.7, view: 'original', obfuscated: false, masked: '<handle>' })
  }
  return hits
}

/** Messaging apps and their aliases (§5.1 app aliases). A mention alone is weak evidence. */
const APP_PATTERNS: Array<{ app: string; pattern: RegExp; view: 'compact' | 'spaced' | 'lower' }> = [
  { app: 'whatsapp', pattern: /w+h*a+t+s*'?s*a+p+|wh?ats?ap|wassap|watsap|whtsap/, view: 'compact' },
  { app: 'whatsapp', pattern: /\bw\s*[/.]\s*a\b|\bwa\s+me\b|\bgreen\s+app\b/, view: 'lower' },
  { app: 'instagram', pattern: /\bphoto\s+app\b|\bthe\s+gram\b/, view: 'lower' },
  { app: 'facebook', pattern: /\bblue\s+app\b/, view: 'lower' },
  { app: 'telegram', pattern: /tele\s*gram|telegrm/, view: 'spaced' },
  { app: 'signal', pattern: /\bsignal\s+(?:me|app)\b|\bon\s+signal\b/, view: 'spaced' },
  { app: 'messenger', pattern: /\bmessenger\b|\bfb\s+messenger\b/, view: 'spaced' },
  { app: 'instagram', pattern: /\binsta(?:gram)?\b|\big\b/, view: 'spaced' },
  { app: 'snapchat', pattern: /\bsnap(?:chat)?\b/, view: 'spaced' },
  { app: 'facebook', pattern: /\bfacebook\b|\bfb\b/, view: 'spaced' },
  { app: 'tiktok', pattern: /\btik\s*tok\b/, view: 'spaced' },
  { app: 'twitter', pattern: /\btwitter\b/, view: 'spaced' },
  { app: 'imo', pattern: /\b(?:on|dey|use|have)\s+imo\b|\bimo\s+(?:me|call)\b/, view: 'spaced' },
  { app: 'viber', pattern: /\bviber\b/, view: 'spaced' },
  { app: 'wechat', pattern: /\bwe\s*chat\b/, view: 'spaced' },
  { app: 'discord', pattern: /\bdiscord\b/, view: 'spaced' },
  { app: 'botim', pattern: /\bbotim\b/, view: 'spaced' },
]

function appHits(views: NormalizedViews): RuleHit[] {
  const hits: RuleHit[] = []
  const found = new Set<string>()
  for (const { app, pattern, view } of APP_PATTERNS) {
    if (found.has(app)) continue
    if (pattern.test(views[view])) {
      found.add(app)
      hits.push({ detector: `app.${app}`, kind: 'app', confidence: 0.6, view: view === 'compact' ? 'compact' : 'spaced', obfuscated: view === 'compact', masked: app })
    }
  }
  return hits
}

/**
 * High-precision intent phrases (§6.1 contact-request detector). Features for
 * the policy and the model, not a verdict on their own.
 */
const SHARE_PHRASES = /\b(?:my|our)\s+(?:number|no|digits|line|contact|cell|mobile|phone|email|e mail|mail|whatsapp|ig|insta|snap|handle|telegram|gmail)\s+(?:is|be|dey)\b(?!\s+(?:verified|correct|wrong|not|private|blocked|off|busy|switched|updated|changed|new|old|hidden|registered|linked|fine|ok|okay|working|the\s+same|same|on\s+rentos|in\s+my\s+profile|down|dead|faulty|spoilt|missing|lost|stolen))|\b(?:reach|call|text|whatsapp|email|mail|ping|beep|flash)\s+(?:me|us)\s+(?:on|at|via|through|with)\b|\byou\s+can\s+(?:get|reach|call|find)\s+me\s+(?:on|at|via)\b|\bme\s+noma\s+ne\b|\bhere\s+is\s+my\s+(?:number|line|contact|whatsapp|email)\b/
/** Messaging and social apps, and their nicknames, as they appear in the spaced view. */
const APPS = 'whatsapp|telegram|signal|ig|insta|instagram|snap|snapchat|facebook|fb|messenger|tiktok|imo|viber|wechat|botim|twitter|threads|the\\s+green\\s+app|green\\s+app|the\\s+photo\\s+app|photo\\s+app|the\\s+blue\\s+app|blue\\s+app'
/** Words for a contact detail, as they follow "your" in a request. */
const CONTACT_NOUNS = String.raw`(?:own\s+)?(?:(?:phone|mobile|cell|whatsapp|telephone|tel|personal|private|direct|office|other)\s+)?(?:number|no|digits|line|contact|contacts|cell|mobile|phone|whatsapp|email|e\s*mail|mail|email\s+address|ig|insta|instagram|snap|snapchat|handle|telegram|tg|username|user\s+name|facebook|fb|socials|contact\s+details)`
const REQUEST_PHRASES = new RegExp(String.raw`\b(?:send|give|drop|share|text|dm|pm|inbox|forward|pass|leave|post|let\s+me\s+have|may\s+i\s+have|i\s+need|i\s+want)\s+(?:me\s+|us\s+)?(?:your|ur|yr)\s+${CONTACT_NOUNS}\b|\b(?:mind\s+sharing|could\s+you\s+(?:share|send|give\s+me)|can\s+you\s+(?:share|send|give\s+me)|would\s+you\s+(?:share|send)|kindly\s+(?:share|send)|please\s+(?:share|send)|pls\s+(?:share|send))\s+(?:me\s+)?(?:your|ur|yr)\s+${CONTACT_NOUNS}\b|\bwhat\s*(?:s|is|be|was)\s+(?:your|ur|yr)\s+${CONTACT_NOUNS}\b|\b(?:do|are)\s+you\s+(?:have|on|use|active\s+on)\s+(?:${APPS})\b|\byou\s+dey\s+(?:${APPS})\b|\bgimme\s+(?:your|ur|yr)\s+${CONTACT_NOUNS}\b|\bcan\s+i\s+(?:get|have|take|collect)\s+(?:your|ur|yr)\s+${CONTACT_NOUNS}\b|\bhow\s+(?:can|do|will|could|would)\s+i\s+(?:reach|contact|call|get|text|whatsapp|phone)\s+you\s+(?:outside|directly|personally|privately|off|on\s+phone|by\s+phone|on\s+the\s+phone|on\s+(?:${APPS}))\b|\bwhere\s+can\s+i\s+(?:dm|message|reach|find|call|text)\s+you\b|\bsend\s+(?:me\s+)?where\s+i\s+can\s+reach\s+you\b|\b(?:your|ur)\s+(?:number|contact|digits|whatsapp|line)\s+(?:pls|please|plz)\b|\b(?:pls|please|plz|abeg|kindly)\s+(?:send\s+)?(?:your|ur)\s+(?:number|contact|contacts|digits|whatsapp|line|email|phone)\b|\bwo\s+noma\b|\bis\s+there\s+(?:a|any)\s+(?:way|number|line|email|means)\s+(?:i|we)\s+can\s+(?:reach|get|call|contact|text|whatsapp)\s+you\b|\b(?:send|give|drop)\s+(?:me\s+)?(?:a|your|ur)\s+(?:line|number|contact|way)\s+(?:i|we)\s+can\s+(?:call|reach|text|whatsapp|contact)\b|\b(?:which|what)\s+(?:number|line|whatsapp\s+number|email)\s+(?:do\s+you\s+use|are\s+you\s+on|can\s+i\s+use|is\s+best|is\s+good|works)\b`)
const MOVE_OFF_PHRASES = new RegExp(String.raw`\b(?:let\s*s|lets|let\s+us|we\s+can|we\s+should|can\s+we|better\s+we|i\s+prefer\s+we|make\s+we|why\s+not)\s+(?:talk|chat|continue|move|discuss|connect|speak|deal|yarn|finish|sort)\s+(?:this\s+|it\s+|this\s+out\s+)?(?:on|via|over|outside|elsewhere|offline|privately|directly|in\s+private|by\s+phone)\b|\boutside\s+(?:the|this)\s+(?:app|platform|site|chat)\b|\boutside\s+(?:here|rentos)\b|\boff\s+(?:the\s+)?(?:app|platform|rentos|site)\b|\b(?:inbox|dm|pm)\s+me\b|\bhit\s+me\s+up\s+on\b|\bmessage\s+me\s+(?:on|via|elsewhere|privately|directly)\b|\b(?:chat|talk)\s+(?:to\s+)?me\s+(?:up\s+)?on\b|\b(?:flash|beep|ring|phone)\s+me\b|\bcall\s+me\b|\b(?:whatsapp|telegram|signal|ig|insta|instagram|imo|messenger|the\s+green\s+app)\s+(?:is|will\s+be|would\s+be)\s+(?:better|easier|faster|more\s+convenient)\b|\b(?:email|e\s*mail|whatsapp|sms)\s+me\b(?!\s+(?:here|on\s+rentos|in\s+the\s+app|through\s+rentos|in\s+this\s+chat|on\s+the\s+app))|\bgive\s+me\s+a\s+(?:call|ring|buzz|flash)\b|\bcontinue\s+(?:this\s+)?(?:elsewhere|somewhere\s+else|on\s+another)\b|\b(?:find|add|follow|catch|message)\s+me\s+on\b|\bcontinue\s+(?:this\s+)?on\s+(?:whatsapp|telegram|ig|insta|instagram|snap|snapchat|facebook|fb|signal|imo|the\s+green\s+app)\b|\bmove\s+(?:this|it|the\s+chat|the\s+conversation)\s+to\b|\b(?:deal|sign|meet|transact|negotiate)\s+(?:directly|outside|privately|offline)\b|\bwithout\s+(?:the\s+)?(?:app|rentos|platform)\b|\bskip\s+(?:the\s+)?(?:app|platform|rentos)\b|\b(?:i\s*ll|i\s+will|let\s+me|lemme|i\s+go|i\s*m\s+going\s+to|i\s+am\s+going\s+to|i\s+fit)\s+(?:whatsapp|call|text|ring|phone|ping|dm|message|inbox|email|flash|beep)\s+you\b|\bi\s*(?:ll|will)\s+send\s+(?:you\s+)?my\s+(?:number|contact|whatsapp|email|digits|line)\b|\breach\s+out\s+on\b|\bspeak\s+privately\b|\bmake\s+we\s+(?:talk|chat|yarn)\s+for\b|\bfre\s+me\b|\b(?:do|take|finish|close|settle|handle|complete)\s+(?:this|it|the\s+deal|everything)\s+(?:offline|outside|privately|elsewhere|directly|off\s+the\s+app)\b|\b(?:don\s*t|do\s+not|dont|no)\s+need\s+(?:to\s+use\s+|for\s+)?(?:the\s+|this\s+)?(?:rentos|app|platform|app\s+fees?)\b|\bno\s+need\s+to\s+(?:book|pay|go|do\s+it)\s+(?:through|on|via)\s+(?:rentos|the\s+app|the\s+platform|this\s+app)\b|\b(?:forget|avoid|ditch|leave|bypass|skip)\s+(?:the\s+|this\s+)?(?:app|platform|rentos)\b|\b(?:speak|talk|chat|finish\s+this|continue|discuss\s+this|deal)\s+in\s+private\b|\b(?:call|text|ping|dm|message|msg|inbox|reach|contact|whatsapp|chat|talk\s+to|speak\s+to|find|add|follow|catch|look\s+for|search\s+for|hit|holla\s+at|ring|flash|beep|email)\s+(?:me|you|us)(?:\s+up)?\s+(?:on|via|through|over)\s+(?:${APPS})\b|\b(?:i\s*ll|i\s+will|let\s+me|lemme|i\s+go|i\s*m\s+going\s+to)\s+(?:ping|dm|message|inbox|email|flash|beep)\s+you\b`)
/** Moving the money off RentOS is moving the deal off it (the purpose of TRUST-2 on RentOS). */
const PAY_OUTSIDE_PHRASES = /\b(?:pay|send|transfer|move|put|give\s+me)\s+(?:the\s+|my\s+)?(?:(?:viewing|agent|service|booking)\s+)?(?:money|rent|deposit|advance|payment|fee|commission|balance|it|cash)?\s*(?:to|into|via|through|on)\s+(?:my|our)\s+(?:momo|mobile\s+money|account|bank|wallet|number|line)\b|\b(?:my|our)\s+(?:momo|mobile\s+money|bank|account)\s+(?:number|no|details|name)\b|\b(?:pay|deal|sign|settle)\s+(?:me\s+)?(?:directly|outside|offline|privately|straight)\b|\b(?:avoid|skip|dodge|bypass)\s+(?:the\s+)?(?:app|rentos|platform|fees?|charges?|commission)\b|\b(?:cash|money)\s+(?:in\s+)?hand\b|\bsend\s+momo\s+to\b|\b(?:pay|send|transfer|give\s+me)\s+(?:the\s+|my\s+)?(?:money|rent|deposit|advance|payment|agent\s+fee|fee|viewing\s+fee|commission|balance|it)\s+(?:straight|directly)\s+to\s+me\b|\b(?:settle|sort|handle|arrange|do)\s+(?:the\s+)?(?:rent|deal|payment|money|it|this|everything)\s+between\s+us\b|\bpay\s+(?:me\s+)?(?:there|at\s+(?:my|the)\s+office|in\s+person|by\s+hand)\b|\bwhen\s+you\s+come\s*,?\s*no\s+app\b|\bpay\s+(?:me\s+)?(?:in\s+)?cash\b|\b(?:pay|send|transfer|give)\s+(?:the\s+|my\s+)?(?:(?:viewing|agent|service|booking)\s+)?(?:money|rent|deposit|advance|payment|fee|commission|balance|it|cash)\s+(?:to\s+me\s+)?(?:directly|in\s+cash|by\s+hand|in\s+person|straight)\b/
const POLICY_PHRASES = /\b(?:why\s+(?:can\s*t|cant|can\s+not)\s+i|not\s+allowed\s+to|won\s*t\s+let\s+me|doesn\s*t\s+let\s+me|blocks?|blocked|blocking|policy|rules|against\s+the\s+rules|rentos\s+(?:says|said|asked))\b[^.]*\b(?:number|numbers|phone|whatsapp|email|contact|contacts|details)\b/

/**
 * Contact vocabulary: words for a contact detail or a channel ("number",
 * "line", "call", "text", "privately", "cash"). Weak on its own — ordinary
 * messages use these words — it is the supporting evidence the policy asks
 * for before acting on the model's reading of intent (§11, rule 3).
 */
const CONTACT_LEXICON = /\b(?:number|numbers|phone|mobile|cell|line|digits|contact|contacts|email|e mail|mail|whatsapp|handle|telegram|call|calls|calling|text|texting|ring|dm|inbox|ping|privately|offline|outside|directly|cash|momo)\b/

/** "send me your details": often a contact request, sometimes paperwork — support for the model, not a block on its own. */
const DETAILS_REQUEST = /\b(?:send|give|drop|share|forward|mind\s+sharing|can\s+i\s+(?:get|have))\s+(?:me\s+)?(?:your|ur|yr)\s+(?:own\s+)?(?:details|contact\s+details)\b|\bwhat\s*(?:s|is|be)\s+(?:your|ur|yr)\s+(?:own\s+)?(?:details|contact\s+details)\b/

function intentHits(views: NormalizedViews): RuleHit[] {
  const hits: RuleHit[] = []
  const text = views.spaced
  if (SHARE_PHRASES.test(text)) hits.push({ detector: 'intent.share_phrase', kind: 'share', confidence: 0.8, view: 'spaced', obfuscated: false, masked: 'share phrase' })
  if (REQUEST_PHRASES.test(text)) hits.push({ detector: 'intent.request_phrase', kind: 'request', confidence: 0.85, view: 'spaced', obfuscated: false, masked: 'request phrase' })
  else if (DETAILS_REQUEST.test(text)) hits.push({ detector: 'intent.details_request', kind: 'request', confidence: 0.65, view: 'spaced', obfuscated: false, masked: 'details request' })
  if (MOVE_OFF_PHRASES.test(text)) hits.push({ detector: 'intent.move_off_phrase', kind: 'move_off', confidence: 0.8, view: 'spaced', obfuscated: false, masked: 'move-off phrase' })
  if (PAY_OUTSIDE_PHRASES.test(text)) hits.push({ detector: 'intent.pay_outside_phrase', kind: 'move_off', confidence: 0.85, view: 'spaced', obfuscated: false, masked: 'pay-outside phrase' })
  if (POLICY_PHRASES.test(text)) hits.push({ detector: 'intent.policy_discussion', kind: 'policy', confidence: 0.7, view: 'spaced', obfuscated: false, masked: 'policy discussion' })
  if (CONTACT_LEXICON.test(text)) hits.push({ detector: 'lexicon.contact', kind: 'lexicon', confidence: 0.5, view: 'spaced', obfuscated: false, masked: 'contact vocabulary' })
  return hits
}

export function runDetectors(views: NormalizedViews): DetectorResult {
  const phone = phoneHits(views)
  return {
    hits: [...phone.hits, ...emailHits(views), ...domainHits(views), ...handleHits(views), ...appHits(views), ...intentHits(views)],
    digitFragments: phone.fragments,
    phoneCandidates: phone.candidates,
  }
}

/** A reviewer's view of a message: its shape, with contact values removed (§16). */
export function maskForAudit(text: string): string {
  return text
    .replace(/[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi, '<email>')
    .replace(/\b(?:https?|hxxps?):\/\/\S+|\bwww\.\S+/gi, '<link>')
    .replace(/(^|[^\w@])@[a-z0-9_.]{2,30}/gi, '$1<handle>')
    .replace(/\d/g, '#')
    .slice(0, 500)
}
