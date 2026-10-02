/**
 * TRUST-2: the contact-leakage screen (spec §4). Every message and every piece
 * of published text passes through here before anyone else can see it.
 *
 *   normalizer → detectors → intent model → conversation context → policy → audit
 *
 * A stopped message is not sent, not redacted and not stored: the author keeps
 * their text, sees why, and can rephrase (§14). Only a masked record is kept
 * (models/TrustDecision.ts).
 *
 * Modes (TRUST2_MODE): `enforce` (default) stops messages; `shadow` records
 * what would have been stopped and lets everything through; `off` skips the
 * screen. In enforce mode a contact detail, one completed across messages, or
 * a high-precision contact phrase is always stopped. A block that rests on the
 * intent model's reading alone is enforced only for TRUST2_MODEL_ENFORCE_PERCENT
 * of authors (0–100, default 0): it is recorded in shadow for review until
 * real-message labels show it is precise enough (spec §19, docs/trust/RUNBOOK.md).
 *
 * Failure handling (§15): if the pipeline throws, a small set of
 * high-precision patterns decides instead; if even that fails, the message is
 * held back and the author is asked to try again (fail closed).
 */
import { Types } from 'mongoose'
import { normalize, NORMALIZER_VERSION } from './normalizer.js'
import { runDetectors, maskForAudit, type RuleHit } from './detectors.js'
import { reconstruct, type ContextMessage, type ContextResult } from './context.js'
import { extractFeatures, hash, FEATURE_VERSION } from './features.js'
import { predictIntent, type IntentPrediction } from './model.js'
import { CONTACT_INTENT_MODEL } from './model/contactIntentModel.js'
import { decide, POLICY_VERSION, type PolicyDecision, type ReasonCode, type UserReason } from './policy.js'
import { strikeCount, escalate, WARN_AT, STRIKE_WARNING } from './strikes.js'
import { textDigest } from './digest.js'
import { TrustDecision, type TrustChannel } from '../../models/TrustDecision.js'
import { logger } from '../../utils/logger.js'

export type { TrustChannel } from '../../models/TrustDecision.js'
export type TrustMode = 'enforce' | 'shadow' | 'off'

export function trustMode(): TrustMode {
  const raw = (process.env.TRUST2_MODE ?? '').trim().toLowerCase()
  return raw === 'shadow' || raw === 'off' ? raw : 'enforce'
}

/** Share of authors whose model-only blocks are enforced (the canary). */
export function modelEnforcePercent(): number {
  const raw = process.env.TRUST2_MODEL_ENFORCE_PERCENT
  const value = raw === undefined || raw.trim() === '' ? NaN : Number(raw)
  return Number.isFinite(value) && value >= 0 && value <= 100 ? value : 0
}

/** Stable per author, so a canary author is in or out for every message. */
export function inRollout(authorId: string, percent = modelEnforcePercent()): boolean {
  if (percent >= 100) return true
  if (percent <= 0) return false
  return hash(`trust2:${authorId}`) % 100 < percent
}

/** Allowed messages at or above this risk are kept (masked) for threshold tuning. */
const NEAR_MISS = 0.6

export const VERSIONS = {
  model: CONTACT_INTENT_MODEL.version,
  normalizer: NORMALIZER_VERSION,
  feature: FEATURE_VERSION,
  policy: POLICY_VERSION,
}

const CONVERSATIONAL: ReadonlySet<TrustChannel> = new Set<TrustChannel>(['chat', 'enquiry', 'viewing', 'application'])

/** What the author is told (§14): what happened and what to do, never which pattern matched. */
export function blockMessage(channel: TrustChannel, reason: UserReason): string {
  if (!CONVERSATIONAL.has(channel)) {
    return "This can't be saved because it contains contact details (a phone number, email, link or social handle) or asks people to contact or pay you outside RentOS. Enquiries reach you through RentOS messages, with an SMS alert, so remove those details and try again."
  }
  if (reason === 'CONTACT_ACROSS_MESSAGES') {
    return "This message wasn't sent. Together with your last few messages, it spells out contact details. Keep the conversation, the viewing and the payment on RentOS, where you're protected."
  }
  return "This message wasn't sent because it looks like it shares contact details or moves the conversation off RentOS. Keep the conversation, the viewing and the payment on RentOS, where you're protected."
}

export const UNAVAILABLE_MESSAGE = "We couldn't check this message just now, so it wasn't sent. Please try again in a moment."

export interface Evaluation {
  policy: PolicyDecision
  hits: RuleHit[]
  intent: IntentPrediction
  context?: ContextResult
}

export interface EvaluateOptions {
  /**
   * Articles may cite ordinary websites. Messaging, social and short links,
   * and every phone, email and handle, are still stopped.
   */
  allowExternalLinks?: boolean
}

/** The whole pipeline, pure and synchronous: what the evaluation suites run. */
export function evaluate(text: string, history: readonly ContextMessage[] = [], now = new Date(), options: EvaluateOptions = {}): Evaluation {
  const views = normalize(text)
  const detected = runDetectors(views)
  if (options.allowExternalLinks) detected.hits = detected.hits.filter((hit) => hit.detector !== 'domain.external')
  const intent = predictIntent(extractFeatures(views, detected))
  const context = history.length ? reconstruct(text, [...history], now) : undefined
  const hits = context ? [...detected.hits, ...context.hits] : detected.hits
  return { policy: decide({ hits, intent, context, text }), hits, intent, context }
}

// The fallback is independent of the normalizer, detectors and model on purpose.
const FALLBACK_PHONE = /(?:\+?233|\b0)[\s.-]*[235]\d(?:[\s.-]*\d){7}\b/
const FALLBACK_EMAIL = /[a-z0-9._%+-]+@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/i
const FALLBACK_LINK = /\b(?:wa\.me|wa\.link|chat\.whatsapp\.com|t\.me|m\.me|instagram\.com|facebook\.com|tiktok\.com|snapchat\.com)\b/i

export function fallbackDecision(text: string): PolicyDecision {
  const codes: ReasonCode[] = []
  if (FALLBACK_PHONE.test(text)) codes.push('EXACT_PHONE')
  if (FALLBACK_EMAIL.test(text)) codes.push('EXACT_EMAIL')
  if (FALLBACK_LINK.test(text)) codes.push('MESSAGING_LINK')
  const block = codes.length > 0
  return {
    decision: block ? 'BLOCK' : 'ALLOW',
    basis: block ? 'structure' : null,
    reasonCodes: codes,
    riskScore: block ? 1 : 0,
    userReason: block ? 'OFF_PLATFORM_CONTACT' : null,
    scores: { structure: block ? 1 : 0, intent: 0, context: 0 },
  }
}

export interface ScreenInput {
  text: string
  authorId: string
  channel: TrustChannel
  conversationId?: string
  /** The author's own recent messages in this conversation (chat only), for §13. */
  history?: readonly ContextMessage[]
  targetType?: string
  targetId?: string
  now?: Date
  allowExternalLinks?: boolean
}

export interface ScreenResult {
  /** What the caller does: false means do not send or save. */
  allowed: boolean
  /** What the screen concluded, whether or not it was applied. */
  decision: 'ALLOW' | 'BLOCK'
  enforced: boolean
  mode: TrustMode
  userReason: UserReason | null
  /** The explanation for the author when not allowed. */
  message: string | null
  decisionId: string | null
  reasonCodes: ReasonCode[]
  riskScore: number
  latencyMs: number
  degraded: boolean
}

const ALLOW_OFF: Omit<ScreenResult, 'latencyMs'> = {
  allowed: true, decision: 'ALLOW', enforced: false, mode: 'off', userReason: null, message: null, decisionId: null, reasonCodes: [], riskScore: 0, degraded: false,
}

export async function screenOutbound(input: ScreenInput): Promise<ScreenResult> {
  const mode = trustMode()
  const started = performance.now()
  if (mode === 'off' || !input.text.trim()) return { ...ALLOW_OFF, mode, latencyMs: 0 }
  const now = input.now ?? new Date()

  let evaluation: Evaluation | null = null
  let policy: PolicyDecision
  let degraded = false
  try {
    evaluation = evaluate(input.text, input.history ?? [], now, { allowExternalLinks: input.allowExternalLinks })
    policy = evaluation.policy
  } catch (err) {
    logger.error(`[trust] screen failed, using the fallback: ${(err as Error).message}`)
    degraded = true
    try {
      policy = fallbackDecision(input.text)
    } catch {
      return { ...ALLOW_OFF, allowed: false, decision: 'BLOCK', enforced: true, mode, message: UNAVAILABLE_MESSAGE, latencyMs: performance.now() - started, degraded: true }
    }
  }
  const latencyMs = Math.round((performance.now() - started) * 100) / 100

  const block = policy.decision === 'BLOCK'
  let enforced = block && mode === 'enforce' && (policy.basis !== 'model' || degraded || inRollout(input.authorId))
  const keep = block || policy.riskScore >= NEAR_MISS
  const decisionId = keep ? new Types.ObjectId() : null
  const digest = keep ? textDigest(input.text) : undefined

  // A reviewer found this exact text was stopped by mistake: let it through.
  let overrideOf: string | undefined
  if (enforced && digest) {
    try {
      const overturned = await TrustDecision.findOne({ authorId: input.authorId, textDigest: digest, 'review.status': 'overturned' }).select('_id').lean()
      if (overturned) { overrideOf = String(overturned._id); enforced = false }
    } catch (err) {
      logger.warn(`[trust] overturned-decision lookup failed: ${(err as Error).message}`)
    }
  }

  if (decisionId) {
    try {
      await TrustDecision.create({
        _id: decisionId,
        authorId: input.authorId,
        channel: input.channel,
        conversationId: input.conversationId,
        targetType: input.targetType,
        targetId: input.targetId,
        decision: policy.decision,
        enforced,
        mode: mode === 'enforce' ? 'enforce' : 'shadow',
        reasonCodes: policy.reasonCodes,
        basis: policy.basis ?? undefined,
        userReason: enforced ? policy.userReason ?? undefined : undefined,
        riskScore: policy.riskScore,
        scores: policy.scores,
        intentLabel: evaluation?.intent.available ? evaluation.intent.label : undefined,
        ruleHits: (evaluation?.hits ?? []).slice(0, 20),
        maskedExcerpt: maskForAudit(input.text),
        textDigest: digest,
        overrideOf,
        contributingMessageIds: evaluation?.context?.contributingIds ?? [],
        versions: VERSIONS,
        latencyMs,
        degraded,
      })
    } catch (err) {
      logger.error(`[trust] could not record decision for ${input.authorId}: ${(err as Error).message}`)
    }
  }

  let message: string | null = null
  if (enforced) {
    message = blockMessage(input.channel, policy.userReason ?? 'OFF_PLATFORM_CONTACT')
    try {
      const strikes = await strikeCount(input.authorId, now)
      if (strikes >= WARN_AT) message = `${message} ${STRIKE_WARNING}`
      void escalate(input.authorId, strikes, now)
    } catch (err) {
      logger.warn(`[trust] strike count failed for ${input.authorId}: ${(err as Error).message}`)
    }
  }

  return {
    allowed: !enforced,
    decision: policy.decision,
    enforced,
    mode,
    userReason: enforced ? policy.userReason : null,
    message,
    decisionId: decisionId ? decisionId.toString() : null,
    reasonCodes: policy.reasonCodes,
    riskScore: policy.riskScore,
    latencyMs,
    degraded,
  }
}

/**
 * Screens several fields of one piece of published text (a listing's title,
 * description and rules) as one: a number split across two fields is still a
 * number. Fields are joined on new lines.
 */
export function screenFields(input: Omit<ScreenInput, 'text' | 'history'> & { fields: Array<string | undefined | null> }): Promise<ScreenResult> {
  const text = input.fields.filter((f): f is string => typeof f === 'string' && f.trim().length > 0).join('\n')
  return screenOutbound({ ...input, text })
}

/** The 422 body a blocked write returns; clients keep the text and show `error`. */
export function blockedBody(result: ScreenResult) {
  return { success: false, error: result.message ?? UNAVAILABLE_MESSAGE, blocked: true, reason: result.userReason, decisionId: result.decisionId }
}
