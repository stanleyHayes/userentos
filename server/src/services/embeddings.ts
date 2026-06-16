import OpenAI from 'openai'
import { logger } from '../utils/logger.js'

let openai: OpenAI | null = null

function getClient(): OpenAI {
  if (openai) return openai
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) {
    throw new Error('Missing required environment variable: OPENAI_API_KEY')
  }
  openai = new OpenAI({ apiKey })
  return openai
}

const DEFAULT_MODEL = 'text-embedding-3-small'
const DEFAULT_DIMENSIONS = 1536

export interface EmbeddingResult {
  embedding: number[]
  model: string
  dimensions: number
}

/**
 * Generate an embedding vector for the given text.
 * Falls back to a zero vector if OpenAI is not configured.
 */
export async function embed(text: string): Promise<EmbeddingResult> {
  const trimmed = text.trim().slice(0, 8000) // OpenAI token limit safety
  if (!trimmed) {
    return { embedding: new Array(DEFAULT_DIMENSIONS).fill(0), model: 'fallback', dimensions: DEFAULT_DIMENSIONS }
  }

  try {
    const response = await getClient().embeddings.create({
      model: DEFAULT_MODEL,
      input: trimmed,
      dimensions: DEFAULT_DIMENSIONS,
    })

    const vector = response.data[0]?.embedding
    if (!vector || vector.length === 0) {
      throw new Error('Empty embedding returned from OpenAI')
    }

    return { embedding: vector, model: DEFAULT_MODEL, dimensions: vector.length }
  } catch (err) {
    const e = err as { message?: string }
    logger.warn(`[Embeddings] OpenAI failed: ${e.message}. Falling back to zero vector.`)
    return { embedding: new Array(DEFAULT_DIMENSIONS).fill(0), model: 'fallback', dimensions: DEFAULT_DIMENSIONS }
  }
}

/**
 * Batch embed multiple texts efficiently.
 */
export async function embedBatch(texts: string[]): Promise<EmbeddingResult[]> {
  const validTexts = texts.map((t) => t.trim().slice(0, 8000)).filter(Boolean)
  if (validTexts.length === 0) {
    return texts.map(() => ({ embedding: new Array(DEFAULT_DIMENSIONS).fill(0), model: 'fallback', dimensions: DEFAULT_DIMENSIONS }))
  }

  try {
    const response = await getClient().embeddings.create({
      model: DEFAULT_MODEL,
      input: validTexts,
      dimensions: DEFAULT_DIMENSIONS,
    })

    const results: EmbeddingResult[] = []
    const embeddingMap = new Map<number, number[]>()
    for (const d of response.data) {
      embeddingMap.set(d.index, d.embedding)
    }

    for (let i = 0; i < texts.length; i++) {
      const vector = embeddingMap.get(i)
      if (vector && vector.length > 0) {
        results.push({ embedding: vector, model: DEFAULT_MODEL, dimensions: vector.length })
      } else {
        results.push({ embedding: new Array(DEFAULT_DIMENSIONS).fill(0), model: 'fallback', dimensions: DEFAULT_DIMENSIONS })
      }
    }
    return results
  } catch (err) {
    const e = err as { message?: string }
    logger.warn(`[Embeddings] Batch OpenAI failed: ${e.message}. Falling back to zero vectors.`)
    return texts.map(() => ({ embedding: new Array(DEFAULT_DIMENSIONS).fill(0), model: 'fallback', dimensions: DEFAULT_DIMENSIONS }))
  }
}

/**
 * Cosine similarity between two vectors.
 * Returns a value between -1 and 1 (higher = more similar).
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`Vector dimension mismatch: ${a.length} vs ${b.length}`)
  }

  let dot = 0
  let normA = 0
  let normB = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    normA += a[i] * a[i]
    normB += b[i] * b[i]
  }

  if (normA === 0 || normB === 0) return 0
  return dot / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * Rank candidates by similarity to a query embedding.
 */
export function rankBySimilarity<T extends { embedding: number[] }>(
  queryEmbedding: number[],
  candidates: T[],
  topK: number = 5,
): Array<T & { similarity: number }> {
  const scored = candidates.map((c) => ({
    ...c,
    similarity: cosineSimilarity(queryEmbedding, c.embedding),
  }))

  scored.sort((a, b) => b.similarity - a.similarity)
  return scored.slice(0, topK)
}
