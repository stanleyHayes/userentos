/**
 * "Am I being abused?" — the public rental-law check.
 *
 * Two layers, and the split between them is the whole design.
 *
 * THE STATUTE IS DETERMINISTIC. Whether six months advance is lawful and
 * eight months is not is arithmetic against Rent Act s.25. That belongs in
 * rentLaw.ts, not in a model, and it is the layer that decides whether
 * something is a VIOLATION.
 *
 * THE TOPIC IS LEARNED. Which area of law a complaint is about is a language
 * problem — "he wants me out by Friday or my things go on the street" is an
 * eviction complaint containing none of the obvious keywords. That is the
 * classifier's job, and all it does is name the subject.
 *
 * The model never gets to assert that a crime occurred. It says "this is
 * about rent advance"; s.25 says whether the amount is lawful.
 *
 * Why it is built this way: the previous version matched keywords, so "my
 * landlord asked for 3 months rent advance which I paid happily" was reported
 * as an Excessive Rent Advance violation at HIGH severity with a stated
 * penalty of imprisonment. So was "my landlord did not ask for any advance
 * and has been fair". A tenant acting on either goes to Rent Control to
 * accuse someone who did nothing wrong.
 */
import { envOptional } from '../../utils/env.js'
import { logger } from '../../utils/logger.js'
import { RENT_LAW, assessAdvance, type AdvanceVerdict } from './rentLaw.js'

export interface Violation {
  law: string
  violation: string
  explanation: string
  maxPenalty: string
}

export type Severity = 'high' | 'medium' | 'low'

/** What the classifier can say. Mirrors app/legal/taxonomy.py. */
export const LEGAL_LABELS: Record<string, { title: string; law: string; severity: Severity; explanation: string; maxPenalty: string }> = {
  excessive_advance: {
    title: 'Excessive Rent Advance',
    law: RENT_LAW.advanceCitation,
    severity: 'high',
    explanation: `Under Ghanaian law a landlord cannot demand more than ${RENT_LAW.maxAdvanceMonths} months rent in advance. A demand for ${RENT_LAW.maxAdvanceMonths + 1} months or more is illegal regardless of what the tenancy agreement says.`,
    maxPenalty: 'Fine up to 500 penalty units or imprisonment up to 6 months, or both',
  },
  illegal_eviction: {
    title: 'Illegal Eviction',
    law: RENT_LAW.evictionCitation,
    severity: 'high',
    explanation: 'Your landlord cannot evict you without a court order. Self-help evictions — changing locks, removing your belongings, or threatening you — are illegal in Ghana.',
    maxPenalty: 'Fine or imprisonment up to 3 months',
  },
  illegal_rent_increase: {
    title: 'Illegal Rent Increase',
    law: 'Rent Act, 1963 (Act 220), Section 25(2)',
    severity: 'medium',
    explanation: 'Rent cannot be increased during an existing lease without proper notice and agreement. Increases must follow the legal procedure and cannot be arbitrary.',
    maxPenalty: 'Fine up to 250 penalty units',
  },
  deposit_withholding: {
    title: 'Security Deposit Violation',
    law: RENT_LAW.advanceCitation,
    severity: 'medium',
    explanation: 'A security deposit is refundable at the end of a tenancy, less legitimate deductions for unpaid rent or damage beyond normal wear and tear. It cannot simply be kept.',
    maxPenalty: 'Refund ordered by Rent Control, plus possible fine',
  },
  utility_disconnection: {
    title: 'Illegal Disconnection of Utilities',
    law: RENT_LAW.evictionCitation,
    severity: 'high',
    explanation: 'Cutting water or electricity to force a tenant out is a self-help eviction and is illegal, whatever the state of the rent account.',
    maxPenalty: 'Fine or imprisonment up to 3 months',
  },
  entry_without_notice: {
    title: 'Violation of Right to Quiet Enjoyment',
    law: 'Rent Act, 1963 (Act 220) — quiet enjoyment',
    severity: 'medium',
    explanation: 'A landlord must give reasonable notice before entering. Entering at will, or letting others in while you are out, breaches your right to quiet enjoyment.',
    maxPenalty: 'Order to cease, plus possible damages',
  },
  receipt_refusal: {
    title: 'Refusal to Issue Rent Receipt',
    law: RENT_LAW.receiptCitation,
    severity: 'low',
    explanation: 'You are entitled to a receipt for every rent payment. Refusing to issue one is an offence, and it leaves you without proof of payment.',
    maxPenalty: 'Fine',
  },
  repairs_neglect: {
    title: 'Failure to Maintain the Premises',
    law: RENT_LAW.maintenanceCitation,
    severity: 'medium',
    explanation: 'The landlord is responsible for keeping the structure and installations in repair. Persistent refusal to fix serious defects is a breach of that duty.',
    maxPenalty: 'Repair order, rent abatement, or damages',
  },
  harassment: {
    title: 'Harassment or Intimidation',
    law: 'Rent Act, 1963 (Act 220) — quiet enjoyment; Criminal Offences Act, 1960',
    severity: 'high',
    explanation: 'Threats, intimidation and abuse aimed at making you leave are unlawful, and threats of violence are a criminal matter for the Police.',
    maxPenalty: 'Criminal prosecution depending on the conduct',
  },
  discrimination: {
    title: 'Discrimination',
    law: 'Constitution of Ghana, Article 17; CHRAJ mandate',
    severity: 'high',
    explanation: 'Refusing to let a property on grounds such as ethnicity, religion, disability or marital status is discrimination, and CHRAJ can investigate it.',
    maxPenalty: 'CHRAJ investigation and remedial orders',
  },
}

export interface ClassifierScore {
  label: string
  probability: number
  threshold: number
  predicted: boolean
}

export interface ClassifierResult {
  labels: string[]
  scores: ClassifierScore[]
  abstained: boolean
  evidence: number
  modelVersion: string
}

const CLASSIFIER_TIMEOUT_MS = 2500

/**
 * Ask the ML service to classify the complaint.
 *
 * Returns null rather than throwing. This sits behind a public landing-page
 * form: if the classifier is down, the page must still answer from the
 * deterministic layer and the keyword fallback, not show an error.
 */
export async function classifyComplaint(text: string): Promise<ClassifierResult | null> {
  const baseUrl = envOptional('ML_SERVICE_URL')
  if (!baseUrl) return null

  try {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
    const apiKey = envOptional('ML_API_KEY')
    if (apiKey) headers['x-api-key'] = apiKey

    const res = await fetch(`${baseUrl.replace(/\/+$/, '')}/legal/classify`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(CLASSIFIER_TIMEOUT_MS),
    })
    if (!res.ok) {
      logger.warn(`[abuseCheck] classifier returned ${res.status}`)
      return null
    }
    return (await res.json()) as ClassifierResult
  } catch (err) {
    logger.warn(`[abuseCheck] classifier unavailable: ${(err as Error).message}`)
    return null
  }
}

export interface AdvanceFinding {
  verdict: AdvanceVerdict['kind']
  months?: number
  message: string
}

/**
 * Turn the statutory reading of the advance into something a person can act on.
 *
 * "Lawful" is a real answer and is returned as one. Telling a worried tenant
 * that three months is within the law is the single most useful thing this
 * feature can do, and the previous version could not say it.
 */
export function describeAdvance(text: string): AdvanceFinding | null {
  const verdict = assessAdvance(text)
  switch (verdict.kind) {
    case 'violation':
      return {
        verdict: 'violation',
        months: verdict.months,
        message: `You described ${verdict.months} months of rent advance. The legal maximum is ${RENT_LAW.maxAdvanceMonths} months (${RENT_LAW.advanceCitation}), so this demand is above the limit.`,
      }
    case 'lawful':
      return {
        verdict: 'lawful',
        months: verdict.months,
        message: `You described ${verdict.months} months of rent advance. The legal maximum is ${RENT_LAW.maxAdvanceMonths} months (${RENT_LAW.advanceCitation}), so this is within the law.`,
      }
    case 'unclear':
      return {
        verdict: 'unclear',
        message: `You mentioned rent advance but not how many months. The legal maximum is ${RENT_LAW.maxAdvanceMonths} months — tell us the number and we can say whether it is lawful.`,
      }
    default:
      return null
  }
}
