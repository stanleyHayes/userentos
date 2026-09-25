import type { NextFunction, Request, Response } from 'express'
import { isRegulatedFeatureEnabled, type RegulatedFeature } from '../config/regulatedFeatures.js'

/**
 * Fails closed unless at least one of the named regulated features is enabled.
 * Mounted ahead of the router so no handler, validation or database work runs
 * for a feature the operator has not been licensed to offer.
 */
export function requireRegulatedFeature(...anyOf: [RegulatedFeature, ...RegulatedFeature[]]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    if (anyOf.some(isRegulatedFeatureEnabled)) { next(); return }
    res.status(403).json({ success: false, error: 'This feature is not available.', code: 'FEATURE_UNAVAILABLE', feature: anyOf[0] })
  }
}
