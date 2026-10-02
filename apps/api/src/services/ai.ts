import { createAiFetch } from './aiTransport.js'
import Anthropic from '@anthropic-ai/sdk'
import { retrieveLegalChunks, buildRagSystemPrompt } from './rag.js'

let client: Anthropic | null = null

// Claude Sonnet 4 (claude-sonnet-4-20250514) was retired and answers 404, which
// took every AI feature down. ANTHROPIC_MODEL still overrides this, but only
// with a model that accepts output_config.effort (Opus 4.5+, Sonnet 4.6+).
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL || 'claude-opus-5-5'

// Claude Opus 5.5's safety classifiers can decline a benign request (HTTP 200,
// stop_reason "refusal"). The server-side fallback re-runs that one request on
// Claude Opus 4.8 instead of failing the writer.
const REFUSAL_FALLBACKS: Partial<Record<string, string>> = { 'claude-opus-5-5': 'claude-opus-4-8' }

export function getClient(): Anthropic {
  if (client) return client
  const anthropicApiKey = process.env.ANTHROPIC_API_KEY
  if (!anthropicApiKey) {
    throw new Error('Missing required environment variable: ANTHROPIC_API_KEY')
  }
  // Opus 5.5 thinks before it answers, so replies take longer than Sonnet 4's
  // did; the transport deadline sits just inside the SDK's.
  client = new Anthropic({ apiKey: anthropicApiKey, maxRetries: 0, timeout: 65_000, fetch: createAiFetch('https://api.anthropic.com', { timeoutMs: 60_000 }) })
  return client
}

export { ANTHROPIC_MODEL }

/** The model declined the request. The message is ours, so it is safe to show. */
export class AiDeclinedError extends Error {
  constructor() {
    super('The AI assistant could not help with this request. Try rephrasing it.')
  }
}

interface Completion {
  system: string
  messages: Anthropic.Beta.BetaMessageParam[]
  /** Thinking counts toward this limit as well as the reply. */
  maxTokens: number
  /** low for anything a person waits on; medium for officers' case summaries. */
  effort: 'low' | 'medium'
  format?: Anthropic.Beta.BetaJSONOutputFormat
}

/**
 * Sends one request and returns the reply text. The text is collected from the
 * text blocks rather than read from content[0]: Opus 5.5 puts its thinking
 * block first, so content[0] is no longer the answer.
 */
export async function complete({ system, messages, maxTokens, effort, format }: Completion): Promise<string> {
  const fallback = REFUSAL_FALLBACKS[ANTHROPIC_MODEL]
  const response = await getClient().beta.messages.create({
    model: ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages,
    output_config: format ? { effort, format } : { effort },
    ...(fallback ? { betas: ['server-side-fallback-2026-06-01'], fallbacks: [{ model: fallback }] } : {}),
  })
  if (response.stop_reason === 'refusal') throw new AiDeclinedError()
  const text = response.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('').trim()
  if (!text) throw new Error('AI reply contained no text')
  return text
}

function langLabel(code: string): string {
  const map: Record<string, string> = {
    en: 'English', tw: 'Twi', ga: 'Ga', ee: 'Ewe', fa: 'Fante', fr: 'French',
  }
  return map[code] ?? 'English'
}

const SYSTEM_PROMPT = `You are RentOS Legal Assistant, an AI specializing in Ghanaian rental law. You help tenants and landlords understand their rights and obligations under Ghana's rental regulations.

Key laws you know:
- Rent Act, 1963 (Act 220) - establishes Rent Control Department
- Rent advance cannot exceed 6 months
- Landlords must maintain habitable conditions
- Proper notice periods required for eviction (1 month for monthly tenancies)
- Tenants cannot be evicted for refusing illegal rent increases
- Security deposits must be refundable
- Landlords cannot disconnect utilities as pressure tactic

You should:
- Give accurate, helpful legal information based on Ghanaian law
- Recommend filing with Rent Control Department when appropriate
- Suggest using RentOS dispute resolution for conflicts
- Be clear when something requires a licensed lawyer
- Support English, Twi, Ga, and Ewe languages
- Keep responses concise but thorough`

export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
}

/**
 * Generate polished text from a short user prompt, tailored to a specific context
 * (e.g. property description, dispute details, blog post, etc.).
 */
export async function generateText(
  prompt: string,
  context: string,
  language = 'en',
): Promise<string> {
  const langInstruction = language !== 'en'
    ? `\n\nIMPORTANT: Write in ${language === 'tw' ? 'Twi' : language === 'ga' ? 'Ga' : language === 'ee' ? 'Ewe' : 'English'}.`
    : ''

  const systemPrompt = `You are a professional writing assistant for RentOS, a rental management platform in Ghana. Your job is to expand short user notes into well-written, detailed text.

Context: The user is writing a "${context}".

Rules:
- Turn the user's brief notes into polished, professional text
- Keep the same meaning and intent as the original
- Use clear, natural language appropriate for the context
- For property descriptions: highlight features, location benefits, and amenities
- For dispute descriptions: be factual, specific, and include relevant dates/details
- For blog posts: be engaging and informative
- For agreements/terms: be precise and legally clear
- For reviews: be honest and balanced
- For bios: be personable yet professional
- For business descriptions (an agency's About Us): describe who they are, the areas and property types they cover, and why to work with them
- For marketing copy and social posts: be short, lively and end with a clear call to action
- Do NOT add fictional details the user didn't mention
- Output ONLY the generated text, no explanations or preamble
- Keep it concise — expand meaningfully but don't pad with filler${langInstruction}`

  try {
    return await complete({ system: systemPrompt, messages: [{ role: 'user', content: prompt }], maxTokens: 4000, effort: 'low' })
  } catch (err) {
    if (err instanceof AiDeclinedError) throw err
    const e = err as { status?: number; message?: string }
    if (e.status === 401) {
      // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
      throw new Error('AI is temporarily unavailable. Please try again later.')
    }
    console.error('[AI] Generate error:')
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    throw new Error('Failed to generate text. Please try again.')
  }
}

export interface PropertyListingInput {
  propertyType: string
  location: string
  bedrooms: number
  bathrooms: number
  amenities: string[]
  price: number
  /** What the price is for: monthly rent (the default), a nightly short-let rate, or a sale price. */
  listingType?: 'rent' | 'sale' | 'short_let'
  rules: string[]
  nearby?: string
  targetTenant?: string
  furnished?: boolean
  parking?: boolean
  water?: boolean
  electricity?: boolean
  security?: boolean
  sizeSqm?: number
  floor?: number
}

export interface GeneratedListing {
  title: string
  description: string
  shortDescription: string
  socialCaption: string
}

export type ToneOption = 'professional' | 'luxury' | 'simple' | 'friendly' | 'urgent' | 'student' | 'family' | 'commercial'

// Structured output: the reply is guaranteed to parse, so there is no code
// fence or stray prose to strip before JSON.parse.
const LISTING_FORMAT: Anthropic.Beta.BetaJSONOutputFormat = {
  type: 'json_schema',
  schema: {
    type: 'object',
    properties: {
      title: { type: 'string' },
      description: { type: 'string' },
      shortDescription: { type: 'string' },
      socialCaption: { type: 'string' },
    },
    required: ['title', 'description', 'shortDescription', 'socialCaption'],
    additionalProperties: false,
  },
}

function priceLine(price: number, listingType: PropertyListingInput['listingType']): string {
  if (listingType === 'sale') return `Sale price: GHS ${price}`
  if (listingType === 'short_let') return `Short-let rate: GHS ${price} per night`
  return `Rent: GHS ${price} per month`
}

export async function generatePropertyListing(
  input: PropertyListingInput,
  tone: ToneOption = 'professional',
  language = 'en',
): Promise<GeneratedListing> {
  const toneInstructions: Record<ToneOption, string> = {
    professional: 'Use a professional, business-appropriate tone. Be clear and detailed.',
    luxury: 'Use an upscale, aspirational tone. Highlight premium features and exclusivity.',
    simple: 'Use very simple, easy-to-understand language. Short sentences.',
    friendly: 'Use a warm, welcoming tone. Make the reader feel at home.',
    urgent: 'Create a sense of urgency. Mention limited availability.',
    student: 'Highlight affordability, proximity to campus, study-friendly features, and WiFi.',
    family: 'Emphasize safety, space, schools nearby, and family-friendly amenities.',
    commercial: 'Focus on business benefits, foot traffic, accessibility, and professional infrastructure.',
  }

  const lang = langLabel(language)
  const parts: string[] = []
  parts.push(`Property type: ${input.propertyType}`)
  parts.push(`Listing: ${input.listingType === 'sale' ? 'For sale' : input.listingType === 'short_let' ? 'Short let / short stay' : 'For rent'}`)
  parts.push(`Location: ${input.location}`)
  parts.push(`Bedrooms: ${input.bedrooms}`)
  parts.push(`Bathrooms: ${input.bathrooms}`)
  if (input.sizeSqm) parts.push(`Size: ${input.sizeSqm} sqm`)
  if (input.floor) parts.push(`Floor: ${input.floor}`)
  parts.push(priceLine(input.price, input.listingType))
  if (input.furnished) parts.push('Furnished: Yes')
  if (input.parking) parts.push('Parking: Yes')
  if (input.water) parts.push('Water: Yes')
  if (input.electricity) parts.push('Electricity: Yes')
  if (input.security) parts.push('Security: Yes')
  if (input.amenities.length) parts.push(`Amenities: ${input.amenities.join(', ')}`)
  if (input.rules.length) parts.push(`Rules: ${input.rules.join(', ')}`)
  if (input.nearby) parts.push(`Nearby landmarks: ${input.nearby}`)
  if (input.targetTenant) parts.push(`Target tenant: ${input.targetTenant}`)

  const prompt = parts.join('\n')

  const systemPrompt = `You are RentOS AI Writer, a professional property listing copywriter for the Ghana property market.

${toneInstructions[tone]}

Write in ${lang}. Use only the facts given; do not invent features, landmarks or prices.

Fill these fields:
- title: a catchy, informative listing title (max 80 characters)
- description: a detailed property description (2-4 paragraphs, highlighting location, features, amenities, and benefits)
- shortDescription: a 1-sentence summary for cards and previews (max 120 characters)
- socialCaption: a social media caption for WhatsApp/Facebook/Instagram (engaging, includes emojis, ends with a call to action)`

  try {
    const text = await complete({ system: systemPrompt, messages: [{ role: 'user', content: prompt }], maxTokens: 6000, effort: 'low', format: LISTING_FORMAT })
    const parsed = JSON.parse(text) as Partial<GeneratedListing>
    return {
      title: parsed.title?.trim() ?? '',
      description: parsed.description?.trim() ?? '',
      shortDescription: parsed.shortDescription?.trim() ?? '',
      socialCaption: parsed.socialCaption?.trim() ?? '',
    }
  } catch (err) {
    if (err instanceof AiDeclinedError) throw err
    const e = err as { status?: number; message?: string }
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    if (e.status === 401) throw new Error('AI is temporarily unavailable. Please try again later.')
    console.error('[AI] Listing generation error:')
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    throw new Error('Failed to generate listing. Please try again.')
  }
}

export async function formalizeText(text: string, language = 'en'): Promise<string> {
  const lang = langLabel(language)
  const systemPrompt = `You are RentOS AI Writer. Rewrite informal or rough Ghanaian English / pidgin property descriptions into polished, professional ${lang} suitable for a rental listing.

Rules:
- Fix grammar, spelling, and punctuation
- Expand abbreviations and shorthand
- Replace pidgin with standard ${lang}
- Keep all factual details the user mentioned
- Do NOT add fictional amenities or location details
- Output ONLY the rewritten text, no explanations`

  try {
    return await complete({ system: systemPrompt, messages: [{ role: 'user', content: text }], maxTokens: 4000, effort: 'low' })
  } catch (err) {
    if (err instanceof AiDeclinedError) throw err
    const e = err as { status?: number; message?: string }
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    if (e.status === 401) throw new Error('AI is temporarily unavailable. Please try again later.')
    console.error('[AI] Formalize error:')
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    throw new Error('Failed to formalize text. Please try again.')
  }
}

export async function translatePropertyText(text: string, targetLanguage: string): Promise<string> {
  const lang = langLabel(targetLanguage)
  const systemPrompt = `You are a professional translator for RentOS, a rental platform in Ghana. Translate the following property listing text into ${lang}.

Rules:
- Keep rental-specific terminology accurate
- Maintain the persuasive, professional tone
- Do NOT add or remove factual details
- Output ONLY the translated text, no explanations`

  try {
    return await complete({ system: systemPrompt, messages: [{ role: 'user', content: text }], maxTokens: 4000, effort: 'low' })
  } catch (err) {
    if (err instanceof AiDeclinedError) throw err
    const e = err as { status?: number; message?: string }
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    if (e.status === 401) throw new Error('AI is temporarily unavailable. Please try again later.')
    console.error('[AI] Translation error:')
    // eslint-disable-next-line preserve-caught-error -- Provider error causes may contain submitted personal data.
    throw new Error('Failed to translate text. Please try again.')
  }
}

export interface ListingQualityResult {
  score: number
  feedback: string[]
  missing: string[]
}

export function scoreListingQuality(listing: Partial<PropertyListingInput> & { title?: string; description?: string }): ListingQualityResult {
  const feedback: string[] = []
  const missing: string[] = []
  let score = 100

  if (!listing.title || listing.title.length < 10) {
    score -= 15
    missing.push('A clear, descriptive title')
  }
  if (!listing.description || listing.description.length < 50) {
    score -= 20
    missing.push('A detailed description (at least 50 characters)')
  }
  if (listing.bedrooms === undefined || listing.bedrooms === null) {
    score -= 10
    missing.push('Bedroom count')
  }
  if (listing.bathrooms === undefined || listing.bathrooms === null) {
    score -= 10
    missing.push('Bathroom count')
  }
  if (!listing.price || listing.price <= 0) {
    score -= 15
    missing.push('A clear price')
  }
  if (!listing.amenities || listing.amenities.length === 0) {
    score -= 10
    missing.push('Listed amenities')
  }
  if (!listing.location || listing.location.length < 3) {
    score -= 10
    missing.push('Location details (city, neighborhood)')
  }
  if (!listing.rules || listing.rules.length === 0) {
    score -= 5
    feedback.push('Consider adding house rules')
  }
  if (!listing.nearby) {
    score -= 5
    feedback.push('Add nearby landmarks to attract more tenants')
  }
  if (listing.description && !listing.description.toLowerCase().includes('water')) {
    score -= 5
    feedback.push('Mention water availability')
  }
  if (listing.description && !listing.description.toLowerCase().includes('electric')) {
    score -= 5
    feedback.push('Mention electricity availability')
  }

  if (score >= 80) feedback.unshift('Great listing! Just a few tweaks to make it perfect.')
  else if (score >= 60) feedback.unshift('Good start. Add the missing details to improve visibility.')
  else if (score >= 40) feedback.unshift('This listing needs more detail to attract quality tenants.')
  else feedback.unshift('This listing is incomplete. Please add the missing information.')

  return { score: Math.max(0, score), feedback, missing }
}

export async function chat(messages: ChatMessage[], language = 'en'): Promise<string> {
  const langInstruction = language !== 'en'
    ? `\n\nIMPORTANT: Respond in ${language === 'tw' ? 'Twi' : language === 'ga' ? 'Ga' : language === 'ee' ? 'Ewe' : 'English'} language.`
    : ''

  // Retrieve relevant legal documents for RAG
  const userQuery = messages[messages.length - 1]?.content || ''
  let systemPrompt = SYSTEM_PROMPT + langInstruction

  try {
    const chunks = await retrieveLegalChunks(userQuery, 5)
    if (chunks.length > 0) {
      systemPrompt = buildRagSystemPrompt(SYSTEM_PROMPT + langInstruction, chunks)
    }
  } catch {
    console.warn('[AI] Legal document retrieval failed')
    // Continue with base prompt if RAG fails
  }

  try {
    return await complete({
      system: systemPrompt,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      maxTokens: 6000,
      // A chat reply is waited on; at medium it took ~25s, at low ~half that.
      effort: 'low',
    })
  } catch (err) {
    if (err instanceof AiDeclinedError) return err.message
    const e = err as { status?: number; message?: string }
    if (e.status === 401) {
      return 'AI Legal Assistant is temporarily unavailable. Please try again later.'
    }
    console.error('[AI] Error:')
    return 'I apologize, there was an error processing your request. Please try again.'
  }
}
