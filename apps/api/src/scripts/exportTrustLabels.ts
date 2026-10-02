/**
 * Exports reviewer-labelled TRUST-2 decisions as extra training examples for
 * `trainContactModel.ts --labels <file>` (docs/trust/RUNBOOK.md, "Retraining").
 *
 * Only decisions a reviewer closed (upheld or overturned) with an intent label
 * are exported. RentOS never stores the original text of a screened message,
 * only its masked excerpt (digits as #, <email>, <link>, <handle>), so these
 * examples teach the model wording ("send me your digits", "let's talk on the
 * other app"), not number formats; the synthetic generator covers those.
 *
 * Usage (no shell needed):
 *   node dist/scripts/exportTrustLabels.js [--since 2026-10-01] > reviewed.json
 * Locally: npx tsx --env-file=.env src/scripts/exportTrustLabels.ts > reviewed.json
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { TrustDecision } from '../models/TrustDecision.js'
import { INTENT_LABELS, type IntentLabel } from '../services/trust/model.js'
import type { Example } from '../services/trust/training/generator.js'

const IDENTIFIER_CODES = new Set(['EXACT_PHONE', 'OBFUSCATED_PHONE', 'EXACT_EMAIL', 'OBFUSCATED_EMAIL', 'SOCIAL_HANDLE', 'MESSAGING_LINK'])

export async function exportReviewedLabels(since?: Date): Promise<Example[]> {
  const decisions = await TrustDecision.find({
    'review.status': { $in: ['upheld', 'overturned'] },
    'review.label': { $in: INTENT_LABELS },
    maskedExcerpt: { $type: 'string', $ne: '' },
    ...(since ? { 'review.reviewedAt': { $gte: since } } : {}),
  }).select('channel maskedExcerpt reasonCodes review').lean()

  return decisions.map((d) => ({
    text: d.maskedExcerpt!,
    label: d.review.label as IntentLabel,
    family: `reviewed-${d.channel}`,
    leak: d.reasonCodes.some((code) => IDENTIFIER_CODES.has(code)),
    // The reviewer's verdict is the ground truth for the policy.
    block: d.review.status === 'upheld',
    recipe: ['reviewed', d.review.status],
  }))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const sinceArg = process.argv.indexOf('--since')
  const since = sinceArg >= 0 ? new Date(process.argv[sinceArg + 1]) : undefined
  if (since && Number.isNaN(since.getTime())) {
    console.error('--since must be a date, e.g. 2026-10-01')
    process.exit(1)
  }
  await mongoose.connect(config.mongoUri)
  try {
    const examples = await exportReviewedLabels(since)
    process.stdout.write(`${JSON.stringify(examples, null, 2)}\n`)
    console.error(`Exported ${examples.length} reviewed example(s).`)
  } finally {
    await mongoose.disconnect()
  }
}
