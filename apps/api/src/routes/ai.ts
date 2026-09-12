import { Router } from 'express'
import { z } from 'zod'
import { authenticate, requireRole } from '../middleware/auth.js'
import {
  chat,
  generateText,
  generatePropertyListing,
  formalizeText,
  translatePropertyText,
  scoreListingQuality,
  getClient,
  ANTHROPIC_MODEL,
  type ChatMessage,
  type ToneOption,
} from '../services/ai.js'
import { success, error } from '../utils/response.js'
import { aiLimiter, publicLimiter } from '../middleware/rateLimit.js'
import { assessAdvance } from '../services/legal/rentLaw.js'
import {
  LEGAL_LABELS,
  classifyComplaint,
  describeAdvance,
  type Violation as LegalViolation,
} from '../services/legal/abuseCheck.js'
import {
  listComplaints,
  recordComplaint,
  reviewComplaint,
  scoreClassifier,
} from '../services/legal/complaintLog.js'

const router = Router()

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(4000),
  })).min(1).max(50),
  language: z.enum(['en', 'tw', 'ga', 'ee']).default('en'),
})

router.post('/chat', authenticate, aiLimiter, async (req, res) => {
  const parsed = chatSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const reply = await chat(parsed.data.messages as ChatMessage[], parsed.data.language)
  success(res, { reply })
})

/* ================================================================
   Text generation — expand short prompts into polished descriptions.
   ================================================================ */

const generateSchema = z.object({
  prompt: z.string().min(3, 'Please provide a short description to expand.'),
  context: z.string().min(1, 'Context is required.'),
  language: z.enum(['en', 'tw', 'ga', 'ee']).default('en'),
})

router.post('/generate', authenticate, aiLimiter, async (req, res) => {
  const parsed = generateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const text = await generateText(parsed.data.prompt, parsed.data.context, parsed.data.language)
    success(res, { text })
  } catch (err) {
    const e = err as { message?: string }
    error(res, e.message || 'Failed to generate text', 500)
  }
})

/* ================================================================
   PUBLIC abuse-check endpoint — no authentication required.
   Rule-based analysis of rental situations against Ghanaian law.
   ================================================================ */

const abuseCheckSchema = z.object({
  query: z.string().min(5, 'Please describe your situation in more detail.'),
})

interface Violation {
  law: string
  violation: string
  explanation: string
  maxPenalty: string
}

const ADVANCE_VIOLATION: Violation = {
  law: LEGAL_LABELS.excessive_advance.law,
  violation: LEGAL_LABELS.excessive_advance.title,
  explanation: LEGAL_LABELS.excessive_advance.explanation,
  maxPenalty: LEGAL_LABELS.excessive_advance.maxPenalty,
}

interface AbuseCheckResponse {
  isViolation: boolean
  severity: 'high' | 'medium' | 'low' | null
  violations: Violation[]
  nextSteps: string[]
  contacts: {
    rentControl: { name: string; phone: string; location: string }
    chraj: { name: string; phone: string }
  }
  signUpCta: string
  /**
   * What the statute says about any advance mentioned — including when it is
   * LAWFUL. Telling a worried tenant that three months is within the law is
   * the most useful thing this feature does, and the keyword version could
   * not say it.
   */
  advance?: { verdict: string; months?: number; message: string }
  /** Which layers answered, so the result can be judged and reproduced. */
  analysis?: { source: 'model+statute' | 'keywords+statute'; modelVersion?: string; abstained?: boolean }
}

// Keywords / pattern matchers for known Ghanaian rental law violations
const violationRules: Array<{
  keywords: string[][]  // groups of keywords — at least one word from each group must appear
  violation: Violation
  severity: 'high' | 'medium' | 'low'
}> = [
  /*
   * NOTE: there is deliberately no keyword rule for rent advance.
   *
   * It used to be the first rule here, matching the bare word "advance", so
   * "my landlord asked for 3 months rent advance which I paid happily" — a
   * lawful arrangement — was reported as an Excessive Rent Advance violation
   * at HIGH severity, with a stated penalty of imprisonment. So was "my
   * landlord did not ask for any advance and has been fair".
   *
   * Whether an advance is lawful depends on the number of months against the
   * s.25 six-month limit. That is arithmetic, and it is done in
   * services/legal/rentLaw.ts.
   */
  {
    keywords: [['evict', 'evicting', 'kick out', 'kicked out', 'throw out', 'threw out', 'throw me out', 'remove me', 'locked out', 'lock me out', 'changed the lock', 'changed lock', 'change the lock', 'padlock', 'padlocked', 'bolt the door', 'chase me out', 'must leave', 'pack out']],
    violation: {
      law: 'Rent Control Act (Act 220), Sections 17-20',
      violation: 'Illegal Eviction',
      explanation: 'Your landlord cannot evict you without a court order. Self-help evictions — such as changing locks, removing your belongings, or threatening you — are illegal in Ghana.',
      maxPenalty: 'Fine or imprisonment up to 3 months',
    },
    severity: 'high',
  },
  {
    keywords: [['increased', 'increase', 'raised', 'hiked', 'doubled', 'tripled', 'went up', 'going up', 'new price', 'higher rent'], ['without notice', 'no notice', 'middle of', 'arbitrar', 'immediately', 'twice this year', 'again', 'without agreement', 'without any']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 25(2)',
      violation: 'Illegal Rent Increase',
      explanation: 'Landlords cannot increase rent during an existing lease without proper notice and agreement. Rent increases must follow legal procedures and cannot be arbitrary.',
      maxPenalty: 'Fine up to 250 penalty units',
    },
    severity: 'medium',
  },
  {
    keywords: [['deposit', 'security deposit', 'caution money'], ['refuses to return', 'refuse to return', 'refuses to refund', 'refuse to refund', 'will not return', 'will not refund', 'won\'t give', 'won\'t return', 'not returned', 'not refunded', 'not giving', 'never returned', 'is keeping', 'has kept', 'withheld', 'withholding']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 25(4)',
      violation: 'Security Deposit Violation',
      explanation: 'Your landlord is required to return your security deposit at the end of your tenancy, minus any legitimate deductions for damages. Refusing to return the deposit without justification is illegal.',
      maxPenalty: 'Court order for refund plus damages',
    },
    severity: 'medium',
  },
  {
    keywords: [['water', 'electricity', 'power', 'light', 'utility', 'utilities', 'ecg', 'gwcl'], ['cut', 'cut off', 'disconnected', 'disconnect', 'switched off', 'shut off', 'removed the meter', 'no water', 'no light', 'no power', 'no electricity']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 12',
      violation: 'Illegal Disconnection of Utilities (Self-Help Eviction)',
      explanation: 'Your landlord cannot cut off your water, electricity, or other utilities as a way to force you out or punish you. This is considered a form of illegal self-help eviction.',
      maxPenalty: 'Fine or imprisonment up to 3 months',
    },
    severity: 'high',
  },
  {
    keywords: [['enter', 'came in', 'barge', 'broke in', 'walk in', 'inspect', 'intrude', 'privacy'], ['without permission', 'no permission', 'no notice', 'didn\'t tell', 'didn\'t ask', 'without telling', 'without asking', 'without consent']],
    violation: {
      law: 'Common Law — Right to Quiet Enjoyment',
      violation: 'Violation of Right to Quiet Enjoyment',
      explanation: 'You have a legal right to peaceful and undisturbed use of your rented property. Your landlord must give reasonable notice before entering and cannot enter without your permission except in emergencies.',
      maxPenalty: 'Damages and injunction through court',
    },
    severity: 'medium',
  },
  {
    keywords: [['receipt', 'proof of payment', 'record of payment'], ['refuse', 'won\'t give', 'no receipt', 'doesn\'t give', 'never give', 'not giving', 'won\'t provide', 'don\'t get']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 23',
      violation: 'Refusal to Issue Rent Receipt',
      explanation: 'Your landlord is legally required to provide a receipt for every rent payment. Refusing to issue receipts is a violation of the Rent Control Act.',
      maxPenalty: 'Fine up to 100 penalty units',
    },
    severity: 'low',
  },
  {
    keywords: [['broken', 'leaking', 'leak', 'crack', 'collapsed', 'mould', 'mold', 'falling apart', 'not fixed', 'never fixed'], ['refuses to fix', 'refuse to fix', 'will not fix', 'won\'t fix', 'refuses to repair', 'will not repair', 'has ignored', 'ignores', 'nothing is done', 'nothing has been done', 'not fixed', 'never fixed', 'still not']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 12(1)',
      violation: 'Failure to Maintain Premises',
      explanation: 'Your landlord has a legal duty to keep the property in a habitable condition and carry out necessary structural repairs. Refusing to fix essential repairs like plumbing, roofing, or structural damage is a violation.',
      maxPenalty: 'Court order to carry out repairs plus damages',
    },
    severity: 'medium',
  },
  {
    keywords: [['sublet', 'subletting', 'sub-let', 'sub let'], ['refuse', 'won\'t allow', 'denied', 'not allowed', 'reject']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 14',
      violation: 'Unreasonable Refusal of Subletting',
      explanation: 'While subletting typically requires landlord consent, a landlord cannot unreasonably refuse a request to sublet. If you have a valid reason for subletting and the proposed sub-tenant is suitable, an outright refusal may be unlawful.',
      maxPenalty: 'Court declaration of unreasonable refusal',
    },
    severity: 'low',
  },
]

const defaultContacts = {
  rentControl: { name: 'Rent Control Department', phone: '+233 30 266 2288', location: 'Accra Metropolitan Area, Behind the General Post Office, Accra' },
  chraj: { name: 'Commission on Human Rights and Administrative Justice (CHRAJ)', phone: '+233 30 266 2150' },
}

/** Word-boundary phrase match, so "off" does not match "office". */
function matchesPhrase(haystack: string, phrase: string): boolean {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`, 'i').test(haystack)
}

function analyzeQuery(
  query: string,
  options: { useKeywordRules?: boolean } = {},
): AbuseCheckResponse {
  const { useKeywordRules = true } = options
  const lowerQuery = query.toLowerCase()
  const matchedViolations: Array<{ violation: Violation; severity: 'high' | 'medium' | 'low' }> = []

  for (const rule of useKeywordRules ? violationRules : []) {
    // Each group in rule.keywords must have at least one matching keyword.
    // Matched on word boundaries, not as substrings: `includes('off')` was
    // true for "office" and `includes('fix')` for "fixed the tap the same
    // day", which is how lawful situations became accusations.
    const allGroupsMatch = rule.keywords.every(group =>
      group.some(keyword => matchesPhrase(lowerQuery, keyword))
    )

    if (allGroupsMatch) {
      matchedViolations.push({ violation: rule.violation, severity: rule.severity })
    }
  }

  // Rent advance is decided by statute, not keywords: assessAdvance reads the
  // number of months and compares it with the s.25 limit. It can also return
  // "lawful", which no keyword rule could ever do.
  const advance = assessAdvance(query)
  if (advance.kind === 'violation') {
    matchedViolations.push({ violation: ADVANCE_VIOLATION, severity: 'high' })
  }

  if (matchedViolations.length === 0) {
    return {
      isViolation: false,
      severity: null,
      violations: [],
      nextSteps: [
        'Try to describe your situation in more detail',
        'Include specifics like: rent advance demands, eviction threats, utility disconnections, repair refusals, or receipt issues',
        'You can also visit the Rent Control Department in person for free advice',
        'Call the Rent Control Department at +233 30 266 2288',
      ],
      contacts: defaultContacts,
      signUpCta: 'Sign up for RentOS to access our AI legal assistant and file digital disputes.',
    }
  }

  // Determine overall severity — take the highest
  const severityOrder: Record<string, number> = { high: 3, medium: 2, low: 1 }
  const highestSeverity = matchedViolations.reduce(
    (max, v) => severityOrder[v.severity] > severityOrder[max] ? v.severity : max,
    'low' as 'high' | 'medium' | 'low'
  )

  const nextSteps = [
    'Document everything: save receipts, photos, messages, and any written communication with your landlord.',
    'File a complaint with the Rent Control Department — it is free and they will mediate.',
  ]

  if (highestSeverity === 'high') {
    nextSteps.push('If you feel physically threatened, contact the Ghana Police Service immediately.')
    nextSteps.push('Contact CHRAJ if you believe discrimination is involved.')
  }

  nextSteps.push('Consider filing a digital dispute through RentOS for faster tracking and resolution.')
  nextSteps.push('Consult a lawyer if the situation involves significant financial loss.')

  return {
    isViolation: true,
    severity: highestSeverity,
    violations: matchedViolations.map(v => v.violation),
    nextSteps,
    contacts: defaultContacts,
    signUpCta: 'Sign up for RentOS to file a digital dispute and track your case online.',
  }
}

router.post('/abuse-check', publicLimiter, async (req, res) => {
  const parsed = abuseCheckSchema.safeParse(req.body)
  if (!parsed.success) {
    error(res, parsed.error.issues[0].message)
    return
  }

  const query = parsed.data.query

  /*
   * The classifier is the better instrument, so when it answers, the keyword
   * rules stand down entirely rather than adding findings it declined to
   * make. They disagree in exactly the direction that matters: the keyword
   * rules said "returned my full deposit within two weeks" was a Security
   * Deposit Violation, while the classifier — correctly — said nothing.
   *
   * They remain as the fallback for when the ML service is unreachable,
   * because a public page must still answer.
   */
  const classified = await classifyComplaint(query)
  const useKeywords = !classified || classified.abstained
  const result = analyzeQuery(query, { useKeywordRules: useKeywords })

  // The statutory reading of the advance, attached whatever the classifier
  // says — including "this is lawful".
  const advance = describeAdvance(query)
  if (advance) result.advance = advance

  /*
   * The classifier names the SUBJECT of the complaint; it never decides that
   * a violation occurred. Rent advance is the clear case: the model may say
   * "this is about advance", but only s.25 arithmetic adds the violation, so
   * a lawful three-month advance can never be turned into an accusation by a
   * confident model.
   */
  if (classified && !classified.abstained) {
    const known = new Set(result.violations.map(v => v.violation))
    for (const label of classified.labels) {
      const entry = LEGAL_LABELS[label]
      if (!entry) continue
      if (label === 'excessive_advance') continue // statute decides this one
      if (known.has(entry.title)) continue
      result.violations.push({
        law: entry.law,
        violation: entry.title,
        explanation: entry.explanation,
        maxPenalty: entry.maxPenalty,
      } satisfies LegalViolation)
      known.add(entry.title)
    }

    if (result.violations.length > 0) {
      result.isViolation = true
      const order: Record<string, number> = { high: 3, medium: 2, low: 1 }
      result.severity = result.violations.reduce<'high' | 'medium' | 'low'>((max, v) => {
        const key = Object.values(LEGAL_LABELS).find(l => l.title === v.violation)?.severity ?? 'low'
        return order[key] > order[max] ? key : max
      }, 'low')
    }
  }

  const source = classified ? 'model+statute' as const : 'keywords+statute' as const
  result.analysis = {
    source,
    modelVersion: classified?.modelVersion,
    abstained: classified?.abstained,
  }

  success(res, result)

  /*
   * Stored after the response, redacted, for a reviewer to turn into training
   * data. The classifier is trained on phrasings we imagined; this is how it
   * gets phrasings people used. Fire-and-forget — a worried tenant's answer
   * must never fail because the training row could not be written.
   */
  void recordComplaint({
    text: query,
    predictedLabels: classified?.labels ?? [],
    scores: (classified?.scores ?? []).map(s => ({
      label: s.label, probability: s.probability, threshold: s.threshold,
    })),
    abstained: classified?.abstained ?? false,
    source,
    modelVersion: classified?.modelVersion,
    advanceVerdict: advance?.verdict as 'violation' | 'lawful' | 'unclear' | undefined,
    advanceMonths: advance?.months,
  })
})

/* ================================================================
   AI Writing Assistant — extended endpoints
   ================================================================ */

const listingSchema = z.object({
  propertyType: z.string().min(1),
  location: z.string().min(1),
  bedrooms: z.number().int().min(0),
  bathrooms: z.number().int().min(0),
  amenities: z.array(z.string()).default([]),
  price: z.number().positive(),
  rules: z.array(z.string()).default([]),
  nearby: z.string().optional(),
  targetTenant: z.string().optional(),
  furnished: z.boolean().optional(),
  parking: z.boolean().optional(),
  water: z.boolean().optional(),
  electricity: z.boolean().optional(),
  security: z.boolean().optional(),
  sizeSqm: z.number().positive().optional(),
  floor: z.number().int().positive().optional(),
  tone: z.enum(['professional', 'luxury', 'simple', 'friendly', 'urgent', 'student', 'family', 'commercial']).default('professional'),
  language: z.enum(['en', 'tw', 'ga', 'ee']).default('en'),
})

router.post('/listing', authenticate, requireRole('landlord', 'property_manager', 'admin'), aiLimiter, async (req, res) => {
  const parsed = listingSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await generatePropertyListing(
      parsed.data,
      parsed.data.tone as ToneOption,
      parsed.data.language,
    )
    success(res, result)
  } catch (err) {
    const e = err as { message?: string }
    error(res, e.message || 'Failed to generate listing', 500)
  }
})

const formalizeSchema = z.object({
  text: z.string().min(3),
  language: z.enum(['en', 'tw', 'ga', 'ee']).default('en'),
})

router.post('/formalize', authenticate, requireRole('landlord', 'property_manager', 'admin'), aiLimiter, async (req, res) => {
  const parsed = formalizeSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await formalizeText(parsed.data.text, parsed.data.language)
    success(res, { text: result })
  } catch (err) {
    const e = err as { message?: string }
    error(res, e.message || 'Failed to formalize text', 500)
  }
})

const translateSchema = z.object({
  text: z.string().min(3),
  targetLanguage: z.enum(['en', 'tw', 'ga', 'ee']),
})

router.post('/translate', authenticate, requireRole('landlord', 'property_manager', 'admin'), aiLimiter, async (req, res) => {
  const parsed = translateSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  try {
    const result = await translatePropertyText(parsed.data.text, parsed.data.targetLanguage)
    success(res, { text: result })
  } catch (err) {
    const e = err as { message?: string }
    error(res, e.message || 'Failed to translate text', 500)
  }
})

const qualitySchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  propertyType: z.string().optional(),
  location: z.string().optional(),
  bedrooms: z.number().int().min(0).optional(),
  bathrooms: z.number().int().min(0).optional(),
  amenities: z.array(z.string()).optional(),
  price: z.number().positive().optional(),
  rules: z.array(z.string()).optional(),
  nearby: z.string().optional(),
})

router.post('/listing-quality', authenticate, requireRole('landlord', 'property_manager', 'admin'), aiLimiter, async (req, res) => {
  const parsed = qualitySchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const result = scoreListingQuality(parsed.data)
  success(res, result)
})

/* ================================================================
   AI Case Summary — summarize a dispute for rent control officers
   ================================================================ */

const caseSummarySchema = z.object({
  caseTitle: z.string().min(1),
  description: z.string().min(10),
  tenantStatement: z.string().optional(),
  landlordStatement: z.string().optional(),
  evidence: z.array(z.string()).optional(),
  language: z.enum(['en', 'tw', 'ga', 'ee']).default('en'),
})

router.post('/case-summary', authenticate, requireRole('government', 'admin', 'legal_officer'), aiLimiter, async (req, res) => {
  const parsed = caseSummarySchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const { caseTitle, description, tenantStatement, landlordStatement, evidence, language } = parsed.data

  const lang = language === 'en' ? 'English'
    : language === 'tw' ? 'Twi'
      : language === 'ga' ? 'Ga'
        : 'Ewe'

  const prompt = `Case: ${caseTitle}\n\nDescription: ${description}\n${tenantStatement ? `\nTenant Statement: ${tenantStatement}` : ''}${landlordStatement ? `\nLandlord Statement: ${landlordStatement}` : ''}${evidence?.length ? `\nEvidence: ${evidence.join(', ')}` : ''}`

  const systemPrompt = `You are RentOS AI Legal Assistant, summarizing rental dispute cases for Ghanaian Rent Control Officers.

Write in ${lang}.

Provide a structured summary with these sections:
1. **Key Facts** — bullet points of the essential facts
2. **Tenant Claims** — what the tenant alleges
3. **Landlord Position** — what the landlord argues (if provided)
4. **Legal Issues** — which Ghanaian rental laws may apply
5. **Recommended Next Steps** — actions the officer should take
6. **Risk Assessment** — low/medium/high risk of escalation

Keep it concise and professional. Do NOT include markdown code fences.`

  try {
    const response = await getClient().messages.create({
      model: ANTHROPIC_MODEL,
      max_tokens: 1200,
      system: systemPrompt,
      messages: [{ role: 'user', content: prompt }],
    })

    const block = response.content[0]
    if (block.type !== 'text') { error(res, 'Unexpected response type', 500); return }

    success(res, { summary: block.text.trim() })
  } catch (err) {
    const e = err as { status?: number; message?: string }
    if (e.status === 401) { error(res, 'AI is not configured. Please set ANTHROPIC_API_KEY.', 500); return }
    console.error('[AI] Case summary error:', e.message)
    error(res, 'Failed to generate case summary', 500)
  }
})

export default router

/* ================================================================
   Complaint review — admin only.

   The classifier is trained on authored phrasings. These endpoints are how
   real ones get labelled and fed back, and how the model is scored against
   what people actually wrote rather than against text we invented.
   ================================================================ */

const reviewSchema = z.object({
  labels: z.array(z.string().max(64)).max(10),
  note: z.string().max(2000).optional(),
})

router.get('/complaints', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const result = await listComplaints({
      page: Number(req.query.page) || 1,
      limit: Number(req.query.limit) || 25,
      unreviewedOnly: req.query.unreviewed === 'true',
      abstainedOnly: req.query.abstained === 'true',
      label: typeof req.query.label === 'string' ? req.query.label : undefined,
    })
    success(res, result)
  } catch (err) {
    error(res, (err as Error).message || 'Failed to list complaints', 500)
  }
})

router.post('/complaints/:id/review', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  const parsed = reviewSchema.safeParse(req.body)
  if (!parsed.success) { error(res, parsed.error.issues[0].message); return }

  const known = new Set(Object.keys(LEGAL_LABELS))
  const unknown = parsed.data.labels.filter(l => !known.has(l))
  if (unknown.length > 0) {
    // A reviewer inventing a label silently poisons the next corpus.
    error(res, `Unknown label(s): ${unknown.join(', ')}`)
    return
  }

  try {
    const updated = await reviewComplaint(String(req.params.id), parsed.data.labels, req.user!.userId, parsed.data.note)
    if (!updated) { error(res, 'Complaint not found', 404); return }
    success(res, updated)
  } catch (err) {
    error(res, (err as Error).message || 'Failed to record review', 500)
  }
})

router.get('/complaints/scorecard', authenticate, requireRole('admin', 'super_admin'), async (req, res) => {
  try {
    const days = Math.min(3650, Math.max(1, Number(req.query.days) || 365))
    const scorecard = await scoreClassifier(new Date(Date.now() - days * 86_400_000))
    success(res, {
      windowDays: days,
      ...scorecard,
      note: scorecard.reviewed === 0
        ? 'No complaints have been reviewed yet. Until they are, the only accuracy figures '
          + 'available come from scripts/train_legal.py, which measures the model against '
          + 'authored text rather than against what people actually wrote.'
        : undefined,
    })
  } catch (err) {
    error(res, (err as Error).message || 'Failed to build scorecard', 500)
  }
})
