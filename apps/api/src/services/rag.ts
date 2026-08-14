import { LegalDocument } from '../models/LegalDocument.js'
import type { Types } from 'mongoose'
import { embed, cosineSimilarity } from './embeddings.js'
import { logger } from '../utils/logger.js'

export interface RetrievedChunk {
  id: string
  title: string
  content: string
  source: string
  category: string
  year?: number
  section?: string
  similarity: number
}

/**
 * Retrieve relevant legal document chunks for a user query.
 * Uses hybrid search: text match pre-filter + vector similarity ranking.
 */
export async function retrieveLegalChunks(query: string, topK: number = 5): Promise<RetrievedChunk[]> {
  const start = Date.now()

  // 1. Generate query embedding
  const { embedding: queryEmbedding } = await embed(query)

  // 2. Pre-filter candidates using text search (hybrid approach)
  //    If no text matches, fall back to all active documents
  const textMatches = await LegalDocument.find(
    { $text: { $search: query }, isActive: true },
    { score: { $meta: 'textScore' } }
  )
    .sort({ score: { $meta: 'textScore' } })
    .limit(50)
    .lean()

  const candidates = textMatches.length > 0
    ? textMatches
    : await LegalDocument.find({ isActive: true }).limit(100).lean()

  // 3. Rank by vector similarity
  const scored = candidates.map((doc) => ({
    id: (doc._id as Types.ObjectId).toString(),
    title: doc.title,
    content: doc.content,
    source: doc.source,
    category: doc.category,
    year: doc.year,
    section: doc.section,
    similarity: cosineSimilarity(queryEmbedding, doc.embedding),
  }))

  scored.sort((a, b) => b.similarity - a.similarity)
  const results = scored.slice(0, topK)

  logger.debug(`[RAG] Retrieved ${results.length} chunks in ${Date.now() - start}ms for query: "${query.slice(0, 60)}..."`)
  return results
}

/**
 * Build a RAG-enhanced system prompt for the legal assistant.
 */
export function buildRagSystemPrompt(basePrompt: string, chunks: RetrievedChunk[]): string {
  if (chunks.length === 0) {
    return basePrompt
  }

  const contextBlocks = chunks.map((c, i) => {
    const meta = [
      c.source,
      c.section ? `Section ${c.section}` : null,
      c.year ? `Year ${c.year}` : null,
    ].filter(Boolean).join(' | ')

    return `[Document ${i + 1}] ${c.title}${meta ? ` (${meta})` : ''}\n${c.content}`
  }).join('\n\n---\n\n')

  return `${basePrompt}

=== RETRIEVED LEGAL DOCUMENTS ===
Use the following official documents to ground your answer. Cite specific sources when possible. If the documents don't cover the user's question, rely on your general knowledge of Ghanaian rental law.

${contextBlocks}

=== INSTRUCTIONS ===
- Cite the specific document and section when making legal claims.
- If you don't know, say so clearly.
- Keep responses concise but thorough.
- Support English, Twi, Ga, and Ewe languages.`
}
