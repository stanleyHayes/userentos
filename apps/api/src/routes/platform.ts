import { Router } from 'express'
import { regulatedFeatureStatus } from '../config/regulatedFeatures.js'
import { signupRoles } from '../config/signupRoles.js'
import { directWhatsAppEnabled } from '../services/listingContact.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { success } from '../utils/response.js'

const router = Router()

// Public: clients hide regulated features the operator has not enabled, instead
// of showing screens whose every request would be refused, offer only the
// account types sign-up will accept, and show the direct WhatsApp button only
// when an admin has switched it on.
router.get('/features', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  success(res, { regulated: regulatedFeatureStatus(), signupRoles: signupRoles(), directWhatsApp: await directWhatsAppEnabled() })
}))

export default router
