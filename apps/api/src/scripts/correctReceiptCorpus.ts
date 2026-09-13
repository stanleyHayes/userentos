/** Correct only the exact legacy receipt seed; no AI provider calls or other seeding. */
import mongoose from 'mongoose'
import { correctLegacyReceiptDocuments } from '../services/legal/receiptCorpus.js'

async function run() {
  try {
    const uri = process.env.MONGO_URI
    if (!uri) throw new Error('MONGO_URI is required')
    await mongoose.connect(uri)
    const result = await correctLegacyReceiptDocuments()
    console.log(`Corrected legacy receipt documents: ${result.modifiedCount}`)
  } finally {
    await mongoose.disconnect()
  }
}
run().catch(() => {
  console.error('Receipt corpus correction failed. Set MONGO_URI and check database connectivity and permissions.')
  process.exitCode = 1
})
