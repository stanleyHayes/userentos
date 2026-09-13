import type { RequestHandler } from 'express'
import { error } from '../utils/response.js'

/** Version identifies the disclosed recipients and scope, not a reusable account grant. */
export const AI_SHARING_VERSION = 'anthropic-openai-2026-09-13'
export const requireAiSharingConsent: RequestHandler = (req, res, next) => {
  if (req.body?.aiSharingConsent !== AI_SHARING_VERSION) {
    error(res, 'Permission is required before sharing this request with the disclosed AI providers.', 403)
    return
  }
  next()
}
