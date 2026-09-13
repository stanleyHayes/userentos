import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ message: vi.fn(), embedding: vi.fn(), retrieval: vi.fn(), warn: vi.fn() }))
vi.mock('@anthropic-ai/sdk', () => ({ default: class { messages = { create: mocks.message } } }))
vi.mock('openai', () => ({ default: class { embeddings = { create: mocks.embedding } } }))
vi.mock('../services/rag.js', () => ({ retrieveLegalChunks: mocks.retrieval, buildRagSystemPrompt: (prompt: string) => prompt }))
vi.mock('../utils/logger.js', () => ({ logger: { warn: mocks.warn } }))
import { chat, generateText, formalizeText, translatePropertyText, generatePropertyListing } from '../services/ai.js'
import { embed, embedBatch } from '../services/embeddings.js'
const privateText = 'PRIVATE-PROMPT-IDENTITY-123'
beforeEach(() => {
  vi.clearAllMocks()
  vi.stubEnv('ANTHROPIC_API_KEY', 'fixture-only')
  vi.stubEnv('OPENAI_API_KEY', 'fixture-only')
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  mocks.retrieval.mockResolvedValue([])
  mocks.message.mockRejectedValue(Object.assign(new Error(privateText), { status: 500 }))
})
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs() })
it.each([
  () => generateText(privateText, 'listing'),
  () => formalizeText(privateText),
  () => translatePropertyText(privateText, 'en'),
  () => generatePropertyListing({ propertyType: 'apartment', location: privateText, bedrooms: 1, bathrooms: 1, amenities: [], price: 1000, rules: [] }),
])('does not expose provider error text or retain a sensitive error cause', async action => {
  let failure: unknown
  try { await action() } catch (error) { failure = error }
  expect(failure).toBeInstanceOf(Error)
  expect(String(failure)).not.toContain(privateText)
  expect((failure as Error).cause).toBeUndefined()
  expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(privateText)
})
it('keeps provider and retrieval failures out of chat replies and logs', async () => {
  mocks.retrieval.mockRejectedValue(new Error(privateText))
  const reply = await chat([{ role: 'user', content: privateText }])
  expect(reply).not.toContain(privateText)
  expect(JSON.stringify([...vi.mocked(console.error).mock.calls, ...vi.mocked(console.warn).mock.calls])).not.toContain(privateText)
})
it('returns safe embedding fallbacks without logging provider error contents', async () => {
  mocks.embedding.mockRejectedValue(new Error(privateText))
  expect((await embed(privateText)).model).toBe('fallback')
  expect((await embedBatch([privateText]))[0].model).toBe('fallback')
  expect(mocks.warn).toHaveBeenCalledTimes(2)
  expect(JSON.stringify(mocks.warn.mock.calls)).not.toContain(privateText)
})
it('maps batch responses to original positions across blank inputs and reordered provider results', async () => {
  mocks.embedding.mockResolvedValue({ data: [{ index: 1, embedding: [0, 1] }, { index: 0, embedding: [1, 0] }] })
  const result = await embedBatch([' ', 'first', '', 'second', '\n'])
  expect(mocks.embedding).toHaveBeenCalledWith(expect.objectContaining({ input: ['first', 'second'] }))
  expect(result).toHaveLength(5)
  expect(result[0].model).toBe('fallback')
  expect(result[1].embedding).toEqual([1, 0])
  expect(result[2].model).toBe('fallback')
  expect(result[3].embedding).toEqual([0, 1])
  expect(result[4].model).toBe('fallback')
})
it('does not send an all-blank batch to the provider', async () => {
  expect((await embedBatch([' ', '\n'])).every(item => item.model === 'fallback')).toBe(true)
  expect(mocks.embedding).not.toHaveBeenCalled()
})
