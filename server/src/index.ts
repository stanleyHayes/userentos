import './instrument.js'
import * as Sentry from '@sentry/node'
import express from 'express'
import cors from 'cors'
import mongoose from 'mongoose'
import path from 'path'
import http from 'http'
import { fileURLToPath } from 'url'
import { config } from './config/index.js'
import { seedDatabase } from './models/seed.js'
import { startScheduler } from './services/scheduler.js'
import { initSocket } from './services/socket.js'
import { rentPriceModel } from './services/ml/pricingModel.js'
import { Property } from './models/Property.js'
import { logger } from './utils/logger.js'
import { errorHandler } from './middleware/errorHandler.js'
import { errorTrackingHandler, readRecentErrors } from './middleware/errorTracking.js'
import { authenticate, requireRole } from './middleware/auth.js'
import { success } from './utils/response.js'
import { claimBootstrap } from './models/BootstrapState.js'
import swaggerUi from 'swagger-ui-express'
import { generateOpenAPIDoc } from './openapi/registry.js'
import './openapi/endpoints.js'
import { publicLimiter, writeLimiter } from './middleware/rateLimit.js'
import { requestId, securityHeaders, notFoundHandler } from './middleware/security.js'

import authRoutes from './routes/auth.js'
import userRoutes from './routes/users.js'
import propertyRoutes from './routes/properties.js'
import agreementRoutes from './routes/agreements.js'
import paymentRoutes from './routes/payments.js'
import savingsRoutes from './routes/savings.js'
import disputeRoutes from './routes/disputes.js'
import legalRoutes from './routes/legal.js'
import notificationRoutes from './routes/notifications.js'
import analyticsRoutes from './routes/analytics.js'
import uploadRoutes from './routes/upload.js'
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
import financingRoutes from './routes/financing.js'
import employerRoutes from './routes/employers.js'
import publicRegistryRoutes from './routes/publicRegistry.js'
import tenantPassportRoutes from './routes/tenantPassport.js'
import maintenanceRoutes from './routes/maintenance.js'
import insuranceRoutes from './routes/insurance.js'
import { bootstrapInsurance } from './bootstrapInsurance.js'
import achievementRoutes from './routes/achievements.js'
import featureFlagRoutes from './routes/featureFlags.js'
import { bootstrapFeatureFlags } from './bootstrapFeatureFlags.js'
import adminViewsRoutes from './routes/adminViews.js'
import biometricAuthRoutes from './routes/biometricAuth.js'
import paymentWebhookRoutes from './routes/paymentWebhooks.js'
import moveOutRoutes from './routes/moveOut.js'
import legalDocumentRoutes from './routes/legalDocuments.js'
import webhookRoutes from './routes/webhooks.js'
import { onSimulatedComplete } from './services/payments/index.js'
import { finalizePayment } from './services/payments/finalize.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const app = express()
const httpServer = http.createServer(app)

// ─── Security & tracing ───
app.use(requestId)
app.use(securityHeaders)

// ─── CORS lockdown ───
// Always allow common dev origins. Production origins come from
// CORS_ALLOWED_ORIGINS (comma-separated). In production, if unset,
// we reject requests rather than falling back to permissive mode.
const ALWAYS_ALLOWED_ORIGINS = ['http://localhost:5173', 'http://localhost:5174', 'http://localhost:5175', 'http://localhost:3000']
const envOrigins = (process.env.CORS_ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean)
const allowedOrigins = new Set<string>([...ALWAYS_ALLOWED_ORIGINS, ...envOrigins])
const isProduction = process.env.NODE_ENV === 'production'
const corsPermissive = !isProduction && envOrigins.length === 0

if (envOrigins.length === 0 && isProduction) {
  logger.error(
    'CORS_ALLOWED_ORIGINS is not set in production. CORS will block all browser requests.',
  )
}

app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin) return callback(null, true)
      if (corsPermissive || allowedOrigins.has(origin)) return callback(null, true)
      callback(new Error(`CORS: origin ${origin} is not allowed`))
    },
    credentials: true,
  }),
)

// ─── Payment provider webhooks (raw body — MUST be before express.json) ───
// Each route inside `paymentWebhookRoutes` mounts its own `express.raw()`
// so signature verification can hash the exact bytes the provider sent.
app.use('/api/webhooks/payments', paymentWebhookRoutes)

app.use(express.json())

// ─── Simulator → finalize bridge ───
// In `PAYMENTS_PROVIDER_MODE !== 'live'`, the simulator dispatches a completion
// event in-process. Wire it to the same finalize path the webhooks use.
onSimulatedComplete((event) => {
  finalizePayment(event, { source: 'simulator' }).catch((err) => {
    console.error('[Simulator] finalize threw:', (err as Error).message)
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

// Apply public read limiters to unauthenticated read endpoints
const publicReadPaths = ['/api/blog', '/api/reviews', '/api/legal', '/api/subscriptions']
app.use((req, res, next) => {
  if (req.method === 'GET' && publicReadPaths.some((p) => req.path.startsWith(p))) {
    return publicLimiter(req, res, next)
  }
  next()
})

// AI/LLM endpoints trigger paid provider calls — limit them hard. The aiLimiter
// is applied per-route inside routes/ai.ts (AFTER authenticate) so its keyGenerator
// can key by user id; the public abuse-check route uses an IP-keyed publicLimiter.
// Pricing endpoints run heavy DB scans / model work.
app.use('/api/pricing', writeLimiter)

const writePathPrefixes = ['/api/financing', '/api/employers', '/api/insurance', '/api/maintenance', '/api/achievements']
app.use((req, res, next) => {
  if (
    (req.method === 'POST' || req.method === 'PATCH') &&
    writePathPrefixes.some((p) => req.path.startsWith(p))
  ) {
    return writeLimiter(req, res, next)
  }
  next()
})

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now()
  res.on('finish', () => {
    const duration = Date.now() - start
    logger.info(`${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`)
  })
  next()
})

// Serve uploaded files
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')))

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', service: 'RentOS API', version: '0.2.0', db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected' })
})

// Routes
app.use('/api/auth', authRoutes)
app.use('/api/users', userRoutes)
app.use('/api/properties', propertyRoutes)
app.use('/api/agreements', agreementRoutes)
app.use('/api/payments', paymentRoutes)
app.use('/api/savings', savingsRoutes)
app.use('/api/disputes', disputeRoutes)
app.use('/api/legal', legalRoutes)
app.use('/api/notifications', notificationRoutes)
app.use('/api/analytics', analyticsRoutes)
app.use('/api/upload', uploadRoutes)
app.use('/api/documents', documentRoutes)
app.use('/api/blog', blogRoutes)
app.use('/api/credit', creditRoutes)
app.use('/api/ai', aiRoutes)
app.use('/api/pricing', pricingRoutes)
app.use('/api/workers', workerRoutes)
app.use('/api/service-bookings', serviceBookingRoutes)
app.use('/api/investments', investmentRoutes)
app.use('/api/loans', loanRoutes)
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
app.use('/api/financing', financingRoutes)
app.use('/api/employers', employerRoutes)
app.use('/api/public/properties', publicRegistryRoutes)
app.use('/api/tenant-passport', tenantPassportRoutes)
app.use('/api/maintenance', maintenanceRoutes)
app.use('/api/insurance', insuranceRoutes)
app.use('/api/achievements', achievementRoutes)
app.use('/api/feature-flags', featureFlagRoutes)
app.use('/api/admin', adminViewsRoutes)
app.use('/api/auth/biometric', biometricAuthRoutes)
app.use('/api/move-outs', moveOutRoutes)
app.use('/api/legal-documents', legalDocumentRoutes)
app.use('/api/webhooks', webhookRoutes)

// OpenAPI docs
const openApiDoc = generateOpenAPIDoc()
app.get('/api/docs/openapi.json', (_req, res) => res.json(openApiDoc))
app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDoc, {
  explorer: true,
  customSiteTitle: 'RentOS API Docs',
}))

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
    mongoose.connection.close(false).then(() => {
      logger.info('MongoDB connection closed.')
      process.exit(0)
    })
  })

  // Force exit after 10s
  setTimeout(() => {
    logger.error('Forced shutdown after timeout.')
    process.exit(1)
  }, 10000)
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'))
process.on('SIGINT', () => gracefulShutdown('SIGINT'))

async function start() {
  try {
    await mongoose.connect(config.mongoUri)
    logger.info(`Connected to MongoDB: ${config.mongoUri}`)

    // Demo seeding plants fixed-credential accounts (including super_admin /
    // admin with a well-known password). Only run it outside production, or when
    // explicitly opted in via SEED_DEMO=true, so an empty PRODUCTION database can
    // never silently acquire publicly-known admin credentials.
    const allowSeed = process.env.NODE_ENV !== 'production' || process.env.SEED_DEMO === 'true'
    if (!allowSeed) {
      logger.info('Seed skipped in production (set SEED_DEMO=true to force demo seeding).')
    } else {
      if (process.env.NODE_ENV === 'production') {
        logger.warn('SEED_DEMO=true in production — demo accounts with default passwords will be created. Rotate them immediately.')
      }
      if (await claimBootstrap('seedDatabase')) {
        await seedDatabase()
      } else {
        logger.info('Bootstrap: seedDatabase already ran on this database — skipping.')
      }
    }
    if (await claimBootstrap('bootstrapInsurance')) {
      await bootstrapInsurance()
    } else {
      logger.info('Bootstrap: bootstrapInsurance already ran on this database — skipping.')
    }
    if (await claimBootstrap('bootstrapFeatureFlags')) {
      await bootstrapFeatureFlags()
    } else {
      logger.info('Bootstrap: bootstrapFeatureFlags already ran on this database — skipping.')
    }
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
    })
  } catch (err) {
    logger.error(`Failed to start server: ${err}`)
    process.exit(1)
  }
}

start()
