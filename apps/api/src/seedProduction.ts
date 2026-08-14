/**
 * Production seed — plants exactly one owner account plus the platform
 * reference data (subscription plans, Ghana rental-law articles, educational
 * blog posts, feature flags, partner insurance products). No demo users, no
 * fake properties, agreements, payments, or disputes.
 *
 *   npm run seed:production            # idempotent — safe to re-run
 *   npm run seed:production -- --reset # DROPS every collection first
 *
 * Credentials come from the environment, never from this file:
 *   SEED_ADMIN_EMAIL, SEED_ADMIN_PASSWORD (required)
 *   SEED_ADMIN_PHONE, SEED_ADMIN_FIRST_NAME, SEED_ADMIN_LAST_NAME (optional)
 *
 * It also claims the `seedDatabase` bootstrap marker, so the demo seed can
 * never later fire against this database on server startup.
 */
import mongoose from 'mongoose'
import bcrypt from 'bcryptjs'
import { config } from './config/index.js'
import { User } from './models/User.js'
import { Wallet } from './models/Wallet.js'
import { SubscriptionPackage } from './models/SubscriptionPackage.js'
import { LegalArticle } from './models/LegalArticle.js'
import { BlogPost } from './models/BlogPost.js'
import { claimBootstrap } from './models/BootstrapState.js'
import { bootstrapFeatureFlags } from './bootstrapFeatureFlags.js'
import { bootstrapInsurance } from './bootstrapInsurance.js'
import { SUBSCRIPTION_PACKAGES, LEGAL_ARTICLES, BLOG_POSTS } from './data/referenceData.js'

function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    console.error(`Missing required environment variable: ${name}`)
    process.exit(1)
  }
  return value
}

async function dropAllCollections() {
  const collections = await mongoose.connection.db!.listCollections().toArray()
  if (collections.length === 0) {
    console.log('  (database is already empty)')
    return
  }
  for (const col of collections) {
    await mongoose.connection.db!.dropCollection(col.name)
    console.log(`  Dropped: ${col.name}`)
  }
}

async function seedOwner() {
  const email = requireEnv('SEED_ADMIN_EMAIL').toLowerCase()
  const password = requireEnv('SEED_ADMIN_PASSWORD')
  const passwordHash = await bcrypt.hash(password, config.bcryptRounds)

  // super_admin bypasses every permission check, so the permissions array
  // stays empty by design.
  const owner = await User.findOneAndUpdate(
    { email },
    {
      $set: {
        passwordHash,
        roles: ['super_admin'],
        activeRole: 'super_admin',
        permissions: [],
        isVerified: true,
        verificationStatus: 'verified',
        credentialsChangedAt: new Date(),
      },
      $setOnInsert: {
        email,
        phone: process.env.SEED_ADMIN_PHONE || '0300000000',
        firstName: process.env.SEED_ADMIN_FIRST_NAME || 'Owner',
        lastName: process.env.SEED_ADMIN_LAST_NAME || 'Admin',
      },
    },
    { upsert: true, returnDocument: 'after' },
  )

  const userId = owner._id.toString()
  await Wallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, transactions: [] } },
    { upsert: true },
  )

  return email
}

async function seedReferenceData() {
  for (const pkg of SUBSCRIPTION_PACKAGES) {
    await SubscriptionPackage.updateOne({ slug: pkg.slug }, { $setOnInsert: pkg }, { upsert: true })
  }
  console.log(`  Subscription packages: ${await SubscriptionPackage.countDocuments()}`)

  for (const article of LEGAL_ARTICLES) {
    await LegalArticle.updateOne({ title: article.title }, { $setOnInsert: article }, { upsert: true })
  }
  console.log(`  Legal articles:        ${await LegalArticle.countDocuments()}`)

  for (const post of BLOG_POSTS) {
    await BlogPost.updateOne({ slug: post.slug }, { $setOnInsert: post }, { upsert: true })
  }
  console.log(`  Blog posts:            ${await BlogPost.countDocuments()}`)

  await bootstrapFeatureFlags()
  await bootstrapInsurance()
}

async function main() {
  const reset = process.argv.includes('--reset')
  try {
    await mongoose.connect(config.mongoUri)
    // Never log config.mongoUri itself — it can embed user:password credentials.
    console.log(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`)

    if (reset) {
      console.log('\n--reset: dropping all collections...')
      await dropAllCollections()
    }

    console.log('\nSeeding owner account...')
    const email = await seedOwner()

    console.log('\nSeeding reference data...')
    await seedReferenceData()

    // Block the demo seed from ever running against this database.
    if (await claimBootstrap('seedDatabase')) {
      console.log('\nDemo seed disabled for this database (bootstrap marker claimed).')
    } else {
      console.log('\nDemo seed already marked as run for this database.')
    }

    console.log(`\nProduction seed complete. Sign in as ${email} with SEED_ADMIN_PASSWORD.`)
    process.exit(0)
  } catch (err) {
    console.error('Production seed failed:', err)
    process.exit(1)
  }
}

main()
