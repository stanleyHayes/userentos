import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
const environment = import.meta.env.MODE

if (dsn) {
  Sentry.init({
    dsn,
    environment,
    release: import.meta.env.VITE_SENTRY_RELEASE as string | undefined,
    // No IP addresses, cookies or request bodies attached by default.
    sendDefaultPii: false,
    tracesSampleRate: environment === 'production' ? 0.1 : 1.0,
    // Replays are recorded only for sessions that hit an error, never routine
    // browsing. This is disclosed in the Privacy Policy ("Error monitoring").
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 1.0,
    integrations: [
      Sentry.browserTracingIntegration(),
      // Pinned explicitly rather than relying on SDK defaults: every piece of
      // text and every form field is masked, and images/video/audio are
      // blocked, so a replay shows layout and clicks — not names, amounts,
      // messages, Ghana Card numbers or photos. Network request/response
      // bodies are not captured (no networkDetailAllowUrls).
      Sentry.replayIntegration({
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],
  })
}

export { Sentry }
