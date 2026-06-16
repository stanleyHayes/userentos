import * as Sentry from '@sentry/node'

const dsn = process.env.SENTRY_DSN
const environment = process.env.NODE_ENV || 'development'

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: process.env.SENTRY_RELEASE,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    sendDefaultPii: false,
  })
}

export { Sentry }
