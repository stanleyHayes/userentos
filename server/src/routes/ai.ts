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

const router = Router()

const chatSchema = z.object({
  messages: z.array(z.object({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1),
  })),
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
}

// Keywords / pattern matchers for known Ghanaian rental law violations
const violationRules: Array<{
  keywords: string[][]  // groups of keywords — at least one word from each group must appear
  violation: Violation
  severity: 'high' | 'medium' | 'low'
}> = [
  {
    keywords: [['advance', 'upfront', 'pay ahead', 'year advance', 'years advance', '2 year', '3 year', '1 year', '12 month', '24 month', '18 month', '8 month', '9 month', '10 month', '11 month']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 25',
      violation: 'Excessive Rent Advance',
      explanation: 'Under Ghanaian law, landlords cannot demand more than 6 months advance rent. Any demand for 7 months or more is illegal, regardless of what the tenancy agreement says.',
      maxPenalty: 'Fine up to 500 penalty units or imprisonment up to 6 months, or both',
    },
    severity: 'high',
  },
  {
    keywords: [['evict', 'kick out', 'throw out', 'remove me', 'vacate', 'leave the house', 'leave the room', 'locked out', 'changed lock', 'change the lock', 'padlock', 'bolt the door']],
    violation: {
      law: 'Rent Control Act (Act 220), Sections 17-20',
      violation: 'Illegal Eviction',
      explanation: 'Your landlord cannot evict you without a court order. Self-help evictions — such as changing locks, removing your belongings, or threatening you — are illegal in Ghana.',
      maxPenalty: 'Fine or imprisonment up to 3 months',
    },
    severity: 'high',
  },
  {
    keywords: [['increase', 'raise', 'hike', 'double', 'triple', 'went up', 'going up', 'new price', 'higher rent']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 25(2)',
      violation: 'Illegal Rent Increase',
      explanation: 'Landlords cannot increase rent during an existing lease without proper notice and agreement. Rent increases must follow legal procedures and cannot be arbitrary.',
      maxPenalty: 'Fine up to 250 penalty units',
    },
    severity: 'medium',
  },
  {
    keywords: [['deposit', 'security deposit', 'caution money'], ['return', 'refund', 'give back', 'won\'t give', 'not return', 'not giving', 'kept', 'keeping', 'refuse']],
    violation: {
      law: 'Rent Control Act (Act 220), Section 25(4)',
      violation: 'Security Deposit Violation',
      explanation: 'Your landlord is required to return your security deposit at the end of your tenancy, minus any legitimate deductions for damages. Refusing to return the deposit without justification is illegal.',
      maxPenalty: 'Court order for refund plus damages',
    },
    severity: 'medium',
  },
  {
    keywords: [['water', 'electricity', 'power', 'light', 'utilit', 'ecg', 'gwcl'], ['cut', 'disconnect', 'off', 'shut', 'no water', 'no light', 'no power', 'no electricity']],
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
    keywords: [['repair', 'fix', 'broken', 'leak', 'crack', 'roof', 'plumbing', 'toilet', 'ceiling', 'maintenance', 'mould', 'mold', 'structural', 'not fixed', 'falling apart']],
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

function analyzeQuery(query: string): AbuseCheckResponse {
  const lowerQuery = query.toLowerCase()
  const matchedViolations: Array<{ violation: Violation; severity: 'high' | 'medium' | 'low' }> = []

  for (const rule of violationRules) {
    // Each group in rule.keywords must have at least one matching keyword
    const allGroupsMatch = rule.keywords.every(group =>
      group.some(keyword => lowerQuery.includes(keyword))
    )

    if (allGroupsMatch) {
      matchedViolations.push({ violation: rule.violation, severity: rule.severity })
    }
  }

  // Also check for the common "advance + amount" pattern specifically
  const advancePattern = /(?:advance|upfront|pay ahead).*?(\d+)\s*(?:month|year)/i
  const advanceMatch = query.match(advancePattern)
  if (advanceMatch) {
    const unit = advanceMatch[0].toLowerCase().includes('year') ? 12 : 1
    const amount = parseInt(advanceMatch[1], 10) * unit
    if (amount > 6) {
      const alreadyHasAdvanceViolation = matchedViolations.some(v => v.violation.violation === 'Excessive Rent Advance')
      if (!alreadyHasAdvanceViolation) {
        matchedViolations.push({
          violation: violationRules[0].violation,
          severity: 'high',
        })
      }
    }
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

  const result = analyzeQuery(parsed.data.query)
  success(res, result)
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
