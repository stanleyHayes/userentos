import appleNotifications from './routes/appleNotifications.js'
import './instrument.js'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import { createCorsOrigin } from './middleware/corsPolicy.js'
import { StorefrontDomain } from './models/StorefrontDomain.js'
import mongoose from 'mongoose'
import http from 'http'
import { config } from './config/index.js'
import { seedDatabase } from './models/seed.js'
import { startScheduler } from './services/scheduler.js'
import { warnIfErasureLedgerShared } from './services/erasureLedger.js'
import { initSocket } from './services/socket.js'
import { rentPriceModel } from './services/ml/pricingModel.js'
import { Property } from './models/Property.js'
import { logger } from './utils/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { errorTrackingHandler, readRecentErrors } from './middleware/errorTracking.js'
import { authenticate, optionalAuth, requireRole } from './middleware/auth.js'
import { success } from './utils/response.js'
import { runBootstrap } from './models/BootstrapState.js'
import { rateLimitBackend } from './middleware/rateLimit.js'
import { warnOnTestKeyInLiveMode } from './services/payments/index.js'
import { basetenClient } from './services/ml/baseten.js'
import swaggerUi from 'swagger-ui-express'
import { generateOpenAPIDoc } from './openapi/registry.js'
import './openapi/endpoints.js'
import { publicLimiter, writeLimiter, apiLimiter, registerLimiter } from './middleware/rateLimit.js'
import { requestId, securityHeaders, notFoundHandler } from './middleware/security.js'
import { sanitizeRequest } from './middleware/sanitize.js'

import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import propertyRoutes from './routes/properties.js'
import propertyModerationRoutes from './routes/propertyModeration.js'
import entitlementRoutes from './routes/entitlements.js'
import storefrontRoutes from './routes/storefronts.js'
import { storefrontHost } from './middleware/storefrontHost.js'
import marketplacePaymentRoutes from './routes/marketplacePayments.js'
import marketplaceCommerceRoutes from './routes/marketplaceCommerce.js'
import reviewerOrgRoutes from './routes/reviewerOrganizations.js'
import authoringRoutes from './routes/authoring.js'
import contentReportRoutes from './routes/contentReports.js'
import adminAuditLogsRoutes from './routes/adminAuditLogs.js'
import adminAffiliatesRoutes from './routes/adminAffiliates.js'
import marketplaceWebhookRoutes from './routes/marketplaceWebhooks.js'
import agreementRoutes from './routes/agreements.js'
import paymentRoutes from './routes/payments.js'
import savingsRoutes from './routes/savings.js'
import disputeRoutes from './routes/disputes.js'
import legalRoutes from './routes/legal.js'
import notificationRoutes from './routes/notifications.js'
import analyticsRoutes from './routes/analytics.js'
import documentRoutes from './routes/documents.js'
import blogRoutes from './routes/blog.js'
import creditRoutes from './routes/credit.js'
import aiRoutes from './routes/ai.js'
import pricingRoutes from './routes/pricing.js'
import workerRoutes from './routes/workers.js'
import serviceBookingRoutes from './routes/serviceBookings.js'
import investmentRoutes from './routes/investments.js'
import tenantProfileRoutes from './routes/tenantProfile.js'
import profileAccessRoutes from './routes/profileAccess.js'
import loanRoutes from './routes/loans.js'
import simulationRoutes from './routes/simulation.js'
import pushRoutes from './routes/push.js'
import reviewRoutes from './routes/reviews.js'
import chatRoutes from './routes/chat.js'
import applicationRoutes from './routes/applications.js'
import settingsRoutes from './routes/settings.js'
import invitationRoutes from './routes/invitations.js'
import badgeRoutes from './routes/badges.js'
import subscriptionRoutes from './routes/subscriptions.js'
import storeBillingRoutes from './routes/storeBilling.js'
import googlePlayNotifications from './routes/googlePlayNotifications.js'
import financingRoutes from './routes/financing.js'
import employerRoutes from './routes/employers.js'
import businessRoutes from './routes/businesses.js'
import agentRoutes from './routes/agent.js'
import landlordRoutes from './routes/landlord.js'
import renewalRoutes from './routes/renewals.js'
import agencyRoutes from './routes/agency.js'
import capabilityRoutes from './routes/capabilities.js'
import publicRegistryRoutes from './routes/publicRegistry.js'
import tenantPassportRoutes from './routes/tenantPassport.js'
import maintenanceRoutes from './routes/maintenance.js'
import insuranceRoutes from './routes/insurance.js'
import insuranceProviderRoutes from './routes/insuranceProviders.js'
import financierRoutes from './routes/financiers.js'
import adminApprovalsRoutes from './routes/adminApprovals.js'
import { bootstrapInsurance } from './bootstrapInsurance.js'
import achievementRoutes from './routes/achievements.js'
import featureFlagRoutes from './routes/featureFlags.js'
import { bootstrapFeatureFlags } from './bootstrapFeatureFlags.js'
import { bootstrapEntityApprovals } from './bootstrapEntityApprovals.js'
import { bootstrapPlanEntitlements } from './bootstrapPlanEntitlements.js'
import adminViewsRoutes from './routes/adminViews.js'
import biometricAuthRoutes from './routes/biometricAuth.js'
import paymentWebhookRoutes from './routes/paymentWebhooks.js'
import payoutWebhookRoutes from './routes/payoutWebhooks.js'
import payoutRoutes from './routes/payouts.js'
import moveOutRoutes from './routes/moveOut.js'
import legalDocumentRoutes from './routes/legalDocuments.js'
import webhookRoutes from './routes/webhooks.js'
import platformRoutes from './routes/platform.js'
import { assertPiiKeyConfigured } from './utils/piiCrypto.js'
import { requireRegulatedFeature } from './middleware/regulatedFeature.js'
import { onSimulatedComplete, getMode as getPaymentMode } from './services/payments/index.js'
import { finalizePayment } from './services/payments/finalize.js'
import { onSimulatedPayout } from './services/payouts/index.js'
import { finalizePayout } from './services/payouts/finalize.js'

const app = express()
// Don't advertise the framework to scanners.
app.disable('x-powered-by')
// Deployed behind Render's proxy: trust the first hop only, so express-rate-limit
// accepts X-Forwarded-For instead of throwing ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
app.set('trust proxy', 1)
const httpServer = http.createServer(app)

// ─── Security & tracing ───
app.use(requestId)
app.use(securityHeaders)

// ─── CORS lockdown ───
// Dev origins are only allowed outside production. Production origins come from
// CORS_ALLOWED_ORIGINS (comma-separated). In production, if unset,
// we reject requests rather than falling back to permissive mode.
const DEV_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000']
const isProduction = process.env.NODE_ENV === 'production'
const envOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const allowedOrigins = new Set<string>([...(isProduction ? [] : DEV_ORIGINS), ...envOrigins])
const corsPermissive = !isProduction && envOrigins.length === 0

if (envOrigins.length === 0 && isProduction) {
  logger.error(
    'CORS_ALLOWED_ORIGINS is not set in production. CORS will block all browser requests.',
  )
}

// The CORS headers depend on Origin even when an origin is refused, so say so
// to any cache in front of the API.
app.use((_req, res, next) => { res.vary('Origin'); next() })
app.use(
  cors({
    origin: createCorsOrigin({
      allowed: [...allowedOrigins],
      permissive: corsPermissive,
      // Storefronts on their own verified domains call the API from that origin.
      isStorefrontDomain: async (hostname) => !!(await StorefrontDomain.exists({ domain: hostname, status: { $in: ['verified', 'active'] } })),
    }),
    credentials: true,
  }),
)

// ─── Payment provider webhooks (raw body — MUST be before express.json) ───
// Each route inside `paymentWebhookRoutes` mounts its own `express.raw()`
// so signature verification can hash the exact bytes the provider sent.
app.use('/api/webhooks/payments', paymentWebhookRoutes)
app.use('/api/webhooks/marketplace', marketplaceWebhookRoutes)
app.use('/api/webhooks/payouts', payoutWebhookRoutes)

// ─── Simulator → finalize bridge ───
// In `PAYMENTS_PROVIDER_MODE !== 'live'`, the simulator dispatches a completion
// event in-process. Wire it to the same finalize path the webhooks use.
onSimulatedComplete((event) => {
  finalizePayment(event, { source: 'simulator', providerSource: 'simulated' }).catch((err) => {
    console.error('[Simulator] finalize threw:', (err as Error).message)
  })
})

// Same bridge for payouts: the simulated transfer completes in-process and is
// settled through the identical finalizer the Paystack webhook uses.
onSimulatedPayout((event) => {
  finalizePayout(event, { source: 'simulator' }).catch((err) => {
    console.error('[PayoutSimulator] finalize threw:', (err as Error).message)
  })
})

// ─── Rate limiters ───
// Auth limiters are applied inside routes/auth.ts (POST-only).
app.use('/api/public', publicLimiter)
app.use('/api/tenant-passport/shared', publicLimiter)
app.use((req, _res, next) => {
  if (req.method === 'POST' && req.path === '/api/tenant-passport/share') {
    return publicLimiter(req, _res, next)
  }
  next()
})

// Unauthenticated invitation endpoints. Accepting an invite creates an account,
// so it earns the same limiter as registration; the lookup that powers the
// accept screen is IP-limited like any other public read.
app.use((req, res, next) => {
  if (req.method === 'GET' && req.path === '/api/invitations/verify') {
    return publicLimiter(req, res, next)
  }
  if (req.method === 'POST' && req.path === '/api/invitations/accept') {
    return registerLimiter(req, res, next)
  }
  next()
})

// Apply public read limiters to unauthenticated read endpoints. Match on a
// path-segment boundary so '/api/legal' doesn't also catch the admin-only
// '/api/legal-documents/*' routes.
const publicReadPaths = ['/api/blog', '/api/reviews', '/api/legal', '/api/subscriptions']
app.use((req, res, next) => {
  if (req.method === 'GET' && publicReadPaths.some((p) => req.path === p || req.path.startsWith(`${p}/`))) {
    return publicLimiter(req, res, next)
  }
  next()
})

// Populate req.user from a valid Bearer token WITHOUT rejecting anonymous
// requests, so writeLimiter's keyGenerator can key per authenticated user —
// routers mount `authenticate` themselves, which is too late for app-level limiters.
app.use(optionalAuth)

// AI/LLM endpoints trigger paid provider calls — limit them hard. The aiLimiter
// is applied per-route inside routes/ai.ts (AFTER authenticate) so its keyGenerator
// can key by user id; the public abuse-check route uses an IP-keyed publicLimiter.
// Pricing endpoints run heavy DB scans / model work.
app.use('/api/pricing', writeLimiter)

// Public legal-document search triggers a paid OpenAI embedding per request.
app.use('/api/legal-documents/search', publicLimiter)

const writePathPrefixes = [
  '/api/financing',
  '/api/employers',
  '/api/insurance',
  '/api/maintenance',
  '/api/achievements',
  '/api/payments',
  '/api/savings',
  '/api/loans',
  '/api/investments',
]
app.use((req, res, next) => {
  if (
    (req.method === 'POST' || req.method === 'PATCH') &&
    writePathPrefixes.some((p) => req.path.startsWith(p))
  ) {
    return writeLimiter(req, res, next)
  }
  next()
})

// Health probe — mounted BEFORE the apiLimiter so readiness checks (and the
// e2e playwright webServer probe) are never throttled. Returns 503 when the
// DB is down so "server is up" only passes once MongoDB is connected.
app.get('/api/health', (_req, res) => {
  const dbUp = mongoose.connection.readyState === 1
  /*
   * The database NAME, outside production only.
   *
   * Without it nothing can tell a dev API from an e2e API: both answer
   * {status:'ok'} on the same port shape, so the Playwright port detector
   * happily attached the whole e2e suite to a running dev server and tested
   * the development database. Tests then passed or failed according to
   * whichever database happened to be in front of them.
   *
   * Withheld in production — an internal database name is free
   * reconnaissance and no probe out there needs it.
   */
  const database = process.env.NODE_ENV === 'production' ? undefined : mongoose.connection.name
  res.status(dbUp ? 200 : 503).json(
    dbUp
      ? { status: 'ok', service: 'RentOS API', version: '0.2.0', db: 'connected', database }
      : { status: 'degraded', service: 'RentOS API', version: '0.2.0', db: 'disconnected', database },
  )
})

// Baseline limiter for everything else under /api — generous, so legitimate
// use is unaffected but unauthenticated scraping loops are capped.
app.use('/api', apiLimiter)
// Bodies are parsed after the limiters, so a malformed or oversized body is
// still counted against them instead of failing before they run.
app.use(express.json({ limit: '100kb' }))
// NoSQL injection guard — strip $-prefixed / dotted keys from all input
// before any route can feed them into a Mongoose query.
app.use(sanitizeRequest)
// Request logging middleware. Query strings are stripped: they can carry
// credentials (e.g. ?token= on download links) and must never hit log files.
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(`${req.method} ${req.path} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// No local /uploads folder is served: dispute evidence is stored privately
// with the file host and downloaded through GET /api/disputes/:id/evidence/:documentId.

// Routes
app.use('/api/platform', platformRoutes)
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/entitlements', entitlementRoutes)
app.use('/api/storefronts', storefrontHost, storefrontRoutes)
app.use('/api/marketplace/payments', marketplacePaymentRoutes)
app.use('/api/marketplace', marketplaceCommerceRoutes)
app.use('/api/reviewer-organizations', reviewerOrgRoutes)
app.use('/api/authoring', authoringRoutes)
app.use('/api/reports', contentReportRoutes)
app.use('/api/properties', propertyModerationRoutes)
app.use('/api/properties', propertyRoutes)
app.use('/api/agreements', agreementRoutes)
// Only starting a provider rent collection is gated; history and receipts of
// payments already made stay available.
app.post('/api/payments', requireRegulatedFeature('rent_collection'))
app.use('/api/payments', paymentRoutes)
// Payouts withdraw rent balances or wallet deposits, so either basis permits them.
app.use('/api/payouts', requireRegulatedFeature('rent_collection', 'wallet'), payoutRoutes)
// Landlords see rent balances in the wallet view even when stored value is off.
const walletView = requireRegulatedFeature('wallet', 'rent_collection')
const storedValue = requireRegulatedFeature('wallet')
app.use('/api/savings', (req, res, next) => (req.method === 'GET' && req.path === '/wallet' ? walletView : storedValue)(req, res, next), savingsRoutes)
app.use('/api/disputes', disputeRoutes)
app.use('/api/legal', legalRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/blog', blogRoutes)
app.use('/api/credit', requireRegulatedFeature('credit_reporting'), creditRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/pricing', pricingRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/service-bookings', serviceBookingRoutes)
app.use('/api/investments', requireRegulatedFeature('investments'), investmentRoutes)
app.use('/api/loans', requireRegulatedFeature('lending'), loanRoutes)
app.use('/api/simulation', simulationRoutes)
app.use('/api/push', pushRoutes)
app.use('/api/tenant-profile', tenantProfileRoutes)
app.use('/api/profile-access', profileAccessRoutes)
app.use('/api/reviews', reviewRoutes)
app.use('/api/chat', chatRoutes)
app.use('/api/applications', applicationRoutes)
app.use('/api/settings', settingsRoutes)
app.use('/api/invitations', invitationRoutes)
app.use('/api/badges', badgeRoutes)
app.use('/api/subscriptions', subscriptionRoutes)
app.use('/api/store-billing', storeBillingRoutes)
app.use('/api/webhooks/google-play', googlePlayNotifications)
app.use('/api/webhooks/apple', appleNotifications)
app.use('/api/financing', requireRegulatedFeature('financing'), financingRoutes)
app.use('/api/employers', requireRegulatedFeature('payroll'), employerRoutes)
app.use('/api/businesses', businessRoutes)
app.use('/api/agent', agentRoutes)
app.use('/api/landlord', landlordRoutes)
app.use('/api/renewals', renewalRoutes)
app.use('/api/agency', agencyRoutes)
app.use('/api/capabilities', capabilityRoutes)
app.use('/api/public/properties', publicRegistryRoutes)
app.use('/api/tenant-passport', tenantPassportRoutes)
app.use('/api/maintenance', maintenanceRoutes)
// Mounted BEFORE /api/insurance so the provider self-service routes win.
app.use('/api/insurance/providers', requireRegulatedFeature('insurance'), insuranceProviderRoutes)
app.use('/api/insurance', requireRegulatedFeature('insurance'), insuranceRoutes)
app.use('/api/financiers', requireRegulatedFeature('financing'), financierRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/feature-flags', featureFlagRoutes)
// Mounted BEFORE /api/admin so the approvals router wins over admin views.
app.use('/api/admin/approvals', adminApprovalsRoutes)
app.use('/api/admin/audit-logs', adminAuditLogsRoutes)
app.use('/api/admin/affiliates', adminAffiliatesRoutes)
app.use('/api/admin', adminViewsRoutes)
app.use('/api/auth/biometric', biometricAuthRoutes)
app.use('/api/move-outs', moveOutRoutes)
app.use('/api/legal-documents', legalDocumentRoutes)
app.use('/api/webhooks', webhookRoutes)

// OpenAPI docs — disabled in production unless explicitly enabled.
if (!isProduction || process.env.ENABLE_API_DOCS === 'true') {
  const openApiDoc = generateOpenAPIDoc()
  app.get('/api/docs/openapi.json', (_req, res) => res.json(openApiDoc))
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc, {
    explorer: true,
    customSiteTitle: 'RentOS API Docs',
  }))
}

// Admin error log dashboard endpoint (super_admin only)
app.get('/api/admin/errors', authenticate, requireRole('super_admin'), (_req, res) => {
  const entries = readRecentErrors(100)
  success(res, { items: entries, total: entries.length })
})

// Error tracking — writes to errors.json then forwards to the response handler
app.use(errorTrackingHandler)

// Sentry error handler — must be AFTER all routes and BEFORE other error handlers
Sentry.setupExpressErrorHandler(app)

// 404 handler — must be AFTER all routes but BEFORE error handlers
app.use(notFoundHandler)

// Global error handler — must be AFTER all routes
app.use(errorHandler)

// ─── Graceful shutdown ───
function gracefulShutdown(signal: string) {
  logger.info(`Received ${signal}. Starting graceful shutdown...`)
  httpServer.close(() => {
    logger.info('HTTP server closed.')
    // .catch, not a bare void: if closing the connection rejects, the exit
    // inside .then never runs and shutdown hangs until the 10s force-exit
    // below fires with code 1 — a clean shutdown reported as a failure.
    mongoose.connection.close(false)
      .then(() => logger.info('MongoDB connection closed.'))
      .catch((err) => logger.warn(`MongoDB close failed: ${(err as Error).message}`))
      .finally(() => process.exit(0))
  })

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

/*
 * Log an unhandled rejection instead of dying of one.
 *
 * Node terminates the process by default, and there was no handler here. The
 * routes start roughly forty promises without awaiting them — notifications
 * and audit writes, which are side effects a request should not wait for — so
 * any one of those rejecting killed the API for every user. notify() and
 * recordAudit() no longer reject, but this is the backstop for the next
 * fire-and-forget call someone writes, and the lint rule that catches them at
 * source is the front line.
 *
 * Deliberately NOT applied to uncaughtException: an unhandled rejection in a
 * side effect is survivable, and a corrupted synchronous stack is not.
 */
process.on('unhandledRejection', (reason) => {
  const err = reason instanceof Error ? reason : new Error(String(reason))
  logger.error(`Unhandled promise rejection: ${err.message}`, { stack: err.stack })
})

async function start() {
  try {
    // Fail at boot, not on the first payment or stored ID, if these are unset or refused.
    getPaymentMode()
    assertPiiKeyConfigured()
    await mongoose.connect(config.mongoUri)
    // Never log config.mongoUri itself — it can embed user:password credentials.
    logger.info(`Connected to MongoDB: ${mongoose.connection.host}/${mongoose.connection.name}`)
    warnIfErasureLedgerShared(config.mongoUri)

    // Demo seeding plants fixed-credential accounts (including super_admin /
    // admin with a well-known password). Only run it outside production, or when
    // explicitly opted in via SEED_DEMO=true, so an empty PRODUCTION database can
    // never silently acquire publicly-known admin credentials.
    // SEED_DEMO=false opts out in every environment — that is what keeps a live
    // database (seeded via `npm run seed:production`) free of fake data even
    // when the server happens to boot with NODE_ENV=development.
    const allowSeed = process.env.SEED_DEMO === 'true'
      || (process.env.NODE_ENV !== 'production' && process.env.SEED_DEMO !== 'false')
    if (!allowSeed) {
      logger.info(
        process.env.SEED_DEMO === 'false'
          ? 'Demo seed disabled by SEED_DEMO=false.'
          : 'Demo seed skipped in production (set SEED_DEMO=true to force it).',
      )
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('SEED_DEMO=true in production — demo accounts with default passwords will be created. Rotate them immediately.')
      }
      if (await runBootstrap('seedDatabase', seedDatabase)) {
        logger.info('Bootstrap: seedDatabase completed.')
      } else {
        logger.info('Bootstrap: seedDatabase already ran on this database — skipping.')
      }
    }
    if (await runBootstrap('bootstrapInsurance', bootstrapInsurance)) {
      logger.info('Bootstrap: bootstrapInsurance completed.')
    } else {
      logger.info('Bootstrap: bootstrapInsurance already ran on this database — skipping.')
    }
    if (await runBootstrap('bootstrapFeatureFlags', bootstrapFeatureFlags)) {
      logger.info('Bootstrap: bootstrapFeatureFlags completed.')
    } else {
      logger.info('Bootstrap: bootstrapFeatureFlags already ran on this database — skipping.')
    }
    if (await runBootstrap('bootstrapEntityApprovals', bootstrapEntityApprovals)) {
      logger.info('Bootstrap: bootstrapEntityApprovals completed.')
    } else {
      logger.info('Bootstrap: bootstrapEntityApprovals already ran on this database — skipping.')
    }

    // Deliberately NOT behind runBootstrap's once-per-database marker. The
    // plans it grants against are created by a seed that may not have run yet
    // on first boot; a marker would record "done" against zero plans and never
    // look again, leaving every paid tier granting nothing forever. It is
    // idempotent and skips any plan an admin has already authored grants for.
    await bootstrapPlanEntitlements()
    startScheduler()

    // Load or train ML pricing model
    const modelLoaded = rentPriceModel.load()
    if (modelLoaded) {
      logger.info(`[ML] Pricing model loaded: R²=${rentPriceModel.r2Score.toFixed(3)}, trained ${rentPriceModel.trainedAt}`)
    } else {
      try {
        const props = await Property.find({ listingStatus: 'approved', rentAmount: { $gt: 0 } }).lean()
        if (props.length >= 20) {
          rentPriceModel.train(props as unknown as InstanceType<typeof Property>[], { verbose: false })
          rentPriceModel.save()
          logger.info(`[ML] Pricing model auto-trained on ${props.length} properties, R²=${rentPriceModel.r2Score.toFixed(3)}`)
        } else {
          logger.info(`[ML] Not enough data to train model (${props.length} properties). Need 20+.`)
        }
      } catch (e) {
        logger.warn(`[ML] Auto-training failed: ${(e as Error).message}`)
      }
    }

    // Initialize Socket.IO
    initSocket(httpServer)

    httpServer.listen(config.port, () => {
      logger.info(`RentOS API v0.2.0 running on http://localhost:${config.port}`)
      logger.info(`Socket.IO ready`)
      // Say which it is: with more than one instance, memory-backed limits
      // are counted per instance, so the effective limit is N times the
      // number configured.
      logger.info(`Rate limiting: ${rateLimitBackend()}-backed`)
      warnOnTestKeyInLiveMode()

      /*
       * Absorb the Baseten cold start here rather than on a user's first
       * valuation. Baseten scales deployments to zero, so the first request
       * after an idle period waits for a container. warm() never throws and
       * never blocks the listen callback — it is deliberately not awaited.
       */
      void basetenClient.warm()
    })
  } catch (err) {
    logger.error(`Failed to start server: ${err}`)
    process.exit(1)
  }
}

// A failed bootstrap must exit non-zero, not vanish into an
// unhandled rejection that looks like a clean start.
start().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
