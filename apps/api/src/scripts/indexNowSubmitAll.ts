/**
 * Submits every page in the platform sitemap to IndexNow once (Bing, Yandex,
 * Seznam, Naver). Run after enabling IndexNow, or after a big change.
 *
 *   node dist/scripts/indexNowSubmitAll.js        (production, INDEXNOW_KEY set)
 * Locally: npx tsx --env-file=.env src/scripts/indexNowSubmitAll.ts
 */
import mongoose from 'mongoose'
import { pathToFileURL } from 'node:url'
import { config } from '../config/index.js'
import { sitemapXml } from '../services/seo.js'
import { submitToIndexNow, type IndexNowResult } from '../services/indexNow.js'
import { publicBaseUrl } from '../utils/env.js'

export async function submitAll(): Promise<{ urls: number; result: IndexNowResult | null }> {
  const xml = await sitemapXml(new URL(publicBaseUrl()).host)
  const urls = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(/&amp;/g, '&'))
  return { urls: urls.length, result: await submitToIndexNow(urls, { force: true }) }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await mongoose.connect(config.mongoUri)
  try {
    const { urls, result } = await submitAll()
    if (!result) {
      console.log(`Nothing sent (${urls} URLs in the sitemap): INDEXNOW_KEY is missing or malformed.`)
      process.exitCode = 1
    } else {
      console.log(`IndexNow accepted ${result.accepted} of ${urls} URLs (HTTP ${result.statuses.map((s) => s || 'no response').join(', ')}).`)
      // A one-off job keeps no output: the exit code is what says it failed.
      if (result.failed) process.exitCode = 1
    }
  } finally {
    await mongoose.disconnect()
  }
}
