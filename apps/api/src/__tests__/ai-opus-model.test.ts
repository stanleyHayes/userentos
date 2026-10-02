import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ create: vi.fn(), retrieval: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { beta = { messages: { create: mocks.create } } } }))
vi.mock('../services/rag.js', () => ({ retrieveLegalChunks: mocks.retrieval, buildRagSystemPrompt: (prompt: string) => prompt }))

// What Claude Opus 5.5 sends back: a thinking block (empty text by default)
// before the answer. Reading content[0] returned the thinking block.
const reply = (text: string, stop_reason = 'end_turn') => ({
  stop_reason,
  content: [{ type: 'thinking', thinking: '', signature: 'sig' }, ...(text ? [{ type: 'text', text }] : [])],
})

async function loadAi() {
  vi.resetModules()
  return import('../services/ai.js')
}

describe('AI requests on Claude Opus 5.5', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-only')
    vi.stubEnv('ANTHROPIC_MODEL', '')
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mocks.retrieval.mockResolvedValue([])
  })
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })

  it('defaults to a current model, never the retired claude-sonnet-4-20250514', async () => {
    const { ANTHROPIC_MODEL } = await loadAi()
    expect(ANTHROPIC_MODEL).toBe('claude-opus-5-5')
  })

  it('reads the answer from the text block that follows the thinking block', async () => {
    mocks.create.mockResolvedValue(reply('A bright two-bedroom flat in East Legon.'))
    const { generateText } = await loadAi()
    expect(await generateText('2 bed east legon', 'property description')).toBe('A bright two-bedroom flat in East Legon.')
  })

  it('sends effort instead of sampling parameters, with room for thinking and a refusal fallback', async () => {
    mocks.create.mockResolvedValue(reply('Polished.'))
    const { formalizeText } = await loadAi()
    await formalizeText('room dey for rent')
    const request = mocks.create.mock.calls[0][0]
    expect(request).toMatchObject({
      model: 'claude-opus-5-5',
      output_config: { effort: 'low' },
      betas: ['server-side-fallback-2026-06-01'],
      fallbacks: [{ model: 'claude-opus-4-8' }],
    })
    expect(request.max_tokens).toBeGreaterThanOrEqual(4000)
    for (const removed of ['temperature', 'top_p', 'top_k', 'thinking']) expect(request).not.toHaveProperty(removed)
  })

  it('asks for structured JSON for a generated listing and states what the price is for', async () => {
    mocks.create.mockResolvedValue(reply(JSON.stringify({ title: ' Villa ', description: 'Big.', shortDescription: 'Big villa.', socialCaption: 'Call now' })))
    const { generatePropertyListing } = await loadAi()
    const listing = await generatePropertyListing({ propertyType: 'house', location: 'Aburi', bedrooms: 4, bathrooms: 3, amenities: [], price: 900000, rules: [], listingType: 'sale' })
    expect(listing.title).toBe('Villa')
    const request = mocks.create.mock.calls[0][0]
    expect(request.output_config.format).toMatchObject({ type: 'json_schema' })
    expect(request.messages[0].content).toContain('Sale price: GHS 900000')
    expect(request.messages[0].content).not.toContain('per month')
  })

  it('turns a safety decline into a message the user can act on, without leaking provider text', async () => {
    mocks.create.mockResolvedValue(reply('', 'refusal'))
    const { generateText, chat, AiDeclinedError } = await loadAi()
    await expect(generateText('notes', 'blog post')).rejects.toBeInstanceOf(AiDeclinedError)
    expect(await chat([{ role: 'user', content: 'Can my landlord evict me?' }])).toMatch(/could not help with this request/)
  })

  it('fails loudly instead of handing back the prompt when the reply has no text', async () => {
    mocks.create.mockResolvedValue(reply(''))
    const { generateText } = await loadAi()
    await expect(generateText('my notes', 'property description')).rejects.toThrow('Failed to generate text')
  })

  it('keeps the legal assistant at low effort so a reply does not keep someone waiting', async () => {
    mocks.create.mockResolvedValue(reply('Under Act 220, advance rent is capped.'))
    const { chat } = await loadAi()
    expect(await chat([{ role: 'user', content: 'How much advance can be charged?' }])).toContain('Act 220')
    expect(mocks.create.mock.calls[0][0].output_config).toEqual({ effort: 'low' })
  })

  it('drops the Opus-only fallback when the operator overrides the model', async () => {
    vi.stubEnv('ANTHROPIC_MODEL', 'claude-sonnet-4-6')
    mocks.create.mockResolvedValue(reply('ok'))
    const { translatePropertyText } = await loadAi()
    await translatePropertyText('Two bedroom flat', 'tw')
    const request = mocks.create.mock.calls[0][0]
    expect(request.model).toBe('claude-sonnet-4-6')
    expect(request).not.toHaveProperty('fallbacks')
    expect(request).not.toHaveProperty('betas')
  })
})
