/**
 * TRUST-2 policy engine (spec §11). The detectors and the model produce
 * evidence; this decides. Thresholds live here, versioned, so they can be
 * tuned without retraining and every decision can be explained.
 *
 * The rules, in order of precedence (spec §11):
 *  1. a clear phone number, email, platform handle or messaging link → block
 *  2. a disguised one recovered by the normalizer → block
 *  3. a contact detail completed across recent messages → block
 *  4. a high-precision contact phrase, unless the model reads the message as
 *     a benign mention or as talk about the policy → block
 *  5. contact intent (share / request / move off RentOS / pay outside) from
 *     the model, backed by supporting evidence in the text (an app name, a
 *     handle, digits or a contact phrase) → block, in shadow by default
 *  6. anything else → allow
 * The model never blocks on its own reading alone, and a mention of an app or
 * of the policy itself is allowed (§12).
 */
import type { RuleHit } from './detectors.js'
import type { IntentPrediction } from './model.js'
import type { ContextResult } from './context.js'

export const POLICY_VERSION = 'trust2-policy-1'

export const THRESHOLDS = {
  /** Structure recovered only after undoing a disguise. */
  obfuscatedStructure: 0.85,
  /** Model probability of contact intent (share + request + move off) needed for rule 3 with strong support. */
  intentWithSupport: 0.75,
  /** Strong support: an app name, a handle, digits or a contact phrase. */
  support: 0.6,
  /** With only weak support (contact vocabulary such as "number" or "call"), the model must be this sure. */
  intentWithWeakSupport: 0.95,
  /** Reassembled across messages. */
  crossTurn: 0.85,
  /** Benign readings (policy talk, a passing mention) at or above this hold back rule 3. */
  benignVeto: 0.35,
  /** Benign readings at or above this override a contact phrase (rule 4). */
  phraseVeto: 0.6,
} as const

export type ReasonCode =
  | 'EXACT_PHONE' | 'OBFUSCATED_PHONE' | 'EXACT_EMAIL' | 'OBFUSCATED_EMAIL' | 'SOCIAL_HANDLE'
  | 'MESSAGING_LINK' | 'EXTERNAL_LINK' | 'MESSAGING_APP' | 'CONTACT_REQUEST' | 'SHARE_INTENT'
  | 'MOVE_OFF_PLATFORM' | 'PAY_OUTSIDE' | 'CROSS_MESSAGE_ASSEMBLY' | 'SEMANTIC_CAMOUFLAGE'

/** Coarse reasons the client may see (§14); internal codes stay server-side. */
export type UserReason = 'OFF_PLATFORM_CONTACT' | 'CONTACT_ACROSS_MESSAGES'

export interface PolicyInput {
  hits: RuleHit[]
  intent: IntentPrediction
  context?: ContextResult
  text: string
}

/** What a block rests on: a contact detail, one completed across messages, a contact phrase, or the model's reading alone. */
export type DecisionBasis = 'structure' | 'context' | 'phrase' | 'model'

export interface PolicyDecision {
  decision: 'ALLOW' | 'BLOCK'
  basis: DecisionBasis | null
  reasonCodes: ReasonCode[]
  riskScore: number
  userReason: UserReason | null
  scores: { structure: number; intent: number; context: number }
}

const COVER_WORDS = /\b(population|amount|score|year|code|reference|ref|invoice|id|coordinates|password|otp|serial|order|room|age|date|price|meter|account|ticket|receipt)\b/i

function structureCodes(hits: RuleHit[]): { codes: ReasonCode[]; score: number; blocking: boolean } {
  const codes = new Set<ReasonCode>()
  let score = 0
  let blocking = false
  for (const hit of hits) {
    if (hit.view === 'context') continue
    if (hit.kind === 'phone' && hit.confidence >= THRESHOLDS.obfuscatedStructure) {
      codes.add(hit.obfuscated ? 'OBFUSCATED_PHONE' : 'EXACT_PHONE'); blocking = true
    } else if (hit.kind === 'email' && hit.confidence >= THRESHOLDS.obfuscatedStructure) {
      codes.add(hit.obfuscated ? 'OBFUSCATED_EMAIL' : 'EXACT_EMAIL'); blocking = true
    } else if (hit.kind === 'handle' && hit.detector !== 'handle.at' && hit.confidence >= THRESHOLDS.obfuscatedStructure) {
      codes.add('SOCIAL_HANDLE'); blocking = true
    } else if (hit.kind === 'domain' && hit.detector === 'domain.messaging') {
      codes.add('MESSAGING_LINK'); blocking = true
    } else if (hit.kind === 'domain' && hit.confidence >= 0.8) {
      codes.add('EXTERNAL_LINK'); blocking = true
    }
    if (hit.kind === 'phone' || hit.kind === 'email' || hit.kind === 'handle' || hit.kind === 'domain') score = Math.max(score, hit.confidence)
  }
  return { codes: [...codes], score, blocking }
}

export function decide({ hits, intent, context, text }: PolicyInput): PolicyDecision {
  const structure = structureCodes(hits)
  const p = intent.probabilities
  const contactIntent = p.SHARE_CONTACT + p.REQUEST_CONTACT + p.MOVE_OFF_PLATFORM
  const benign = p.DISCUSS_CONTACT_POLICY + p.BENIGN_CONTACT_REFERENCE
  const phraseHits = hits.filter((h) => h.kind === 'share' || h.kind === 'request' || h.kind === 'move_off')
  const policyTalk = hits.some((h) => h.kind === 'policy')
  const supporting = Math.max(0, ...hits.filter((h) => h.kind === 'app' || h.kind === 'handle' || h.kind === 'phone' || h.kind === 'share' || h.kind === 'request' || h.kind === 'move_off').map((h) => h.confidence))
  const lexical = hits.some((h) => h.kind === 'lexicon')
  const contextScore = context?.assemblyScore ?? 0
  const codes = new Set<ReasonCode>(structure.codes)

  const intentCodes = () => {
    for (const hit of phraseHits) {
      if (hit.detector === 'intent.pay_outside_phrase') codes.add('PAY_OUTSIDE')
      else if (hit.kind === 'request') codes.add('CONTACT_REQUEST')
      else if (hit.kind === 'share') codes.add('SHARE_INTENT')
      else codes.add('MOVE_OFF_PLATFORM')
    }
    if (!phraseHits.length) {
      const top = p.REQUEST_CONTACT >= p.SHARE_CONTACT && p.REQUEST_CONTACT >= p.MOVE_OFF_PLATFORM ? 'CONTACT_REQUEST' : p.SHARE_CONTACT >= p.MOVE_OFF_PLATFORM ? 'SHARE_INTENT' : 'MOVE_OFF_PLATFORM'
      codes.add(top)
    }
    if (hits.some((h) => h.kind === 'app')) codes.add('MESSAGING_APP')
  }

  let block = structure.blocking
  let basis: DecisionBasis | null = block ? 'structure' : null
  // A detail completed across messages outranks phrasing and the model: it is
  // structure, and a model-only (shadow) block must never stand in for it.
  if (!block && contextScore >= THRESHOLDS.crossTurn) {
    block = true
    basis = 'context'
    codes.add('CROSS_MESSAGE_ASSEMBLY')
  }
  if (!block && !policyTalk) {
    const strongPhrase = phraseHits.some((h) => h.confidence >= 0.8)
    if (strongPhrase && (!intent.available || benign < THRESHOLDS.phraseVeto)) {
      // A high-precision phrase blocks unless the model reads it as benign.
      block = true
      basis = 'phrase'
    } else if (intent.available && benign < THRESHOLDS.benignVeto && ((contactIntent >= THRESHOLDS.intentWithSupport && supporting >= THRESHOLDS.support) || (contactIntent >= THRESHOLDS.intentWithWeakSupport && lexical))) {
      block = true
      basis = 'model'
    }
    if (block) intentCodes()
  }
  if (block && (codes.has('EXACT_PHONE') || codes.has('OBFUSCATED_PHONE')) && COVER_WORDS.test(text)) codes.add('SEMANTIC_CAMOUFLAGE')

  const riskScore = Math.min(1, Math.max(structure.score * (structure.blocking ? 1 : 0.6), contactIntent * (benign < THRESHOLDS.benignVeto ? 1 : 0.5), contextScore))
  return {
    decision: block ? 'BLOCK' : 'ALLOW',
    basis,
    reasonCodes: block ? [...codes] : [],
    riskScore: block ? Math.max(riskScore, 0.9) : riskScore,
    userReason: block ? (codes.has('CROSS_MESSAGE_ASSEMBLY') && codes.size === 1 ? 'CONTACT_ACROSS_MESSAGES' : 'OFF_PLATFORM_CONTACT') : null,
    scores: { structure: structure.score, intent: contactIntent, context: contextScore },
  }
}
