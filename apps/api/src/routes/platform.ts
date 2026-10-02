import { Router } from 'express'
import { regulatedFeatureStatus } from '../config/regulatedFeatures.js'
import { signupRoles } from '../config/signupRoles.js'
import { directWhatsAppEnabled } from '../services/listingContact.js'
import { feeActive, feeQuote } from '../services/actionFees.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { success } from '../utils/response.js'

const router = Router()

// Public: clients hide regulated features the operator has not enabled, instead
// of showing screens whose every request would be refused, offer only the
// account types sign-up will accept, and show the direct WhatsApp button only
// when an admin has switched it on. `fees` says which GH₵5 pay-per-action
// fees are being charged, so a client can name the price before the 402.
router.get('/features', asyncHandler(async (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  const [directWhatsApp, agreementFee, passportFee] = await Promise.all([directWhatsAppEnabled(), feeActive('agreement_fee'), feeActive('passport_export')])
  success(res, {
    regulated: regulatedFeatureStatus(),
    signupRoles: signupRoles(),
    directWhatsApp,
    fees: {
      agreementSigning: { active: agreementFee, amount: feeQuote('agreement_fee').amount, currency: 'GHS' },
      passportExport: { active: passportFee, amount: feeQuote('passport_export').amount, currency: 'GHS' },
    },
  })
}))

export default router
