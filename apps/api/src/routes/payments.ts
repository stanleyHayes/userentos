import { Router } from 'express'
import { availableMethods, getMode } from '../services/payments/index.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { paymentController } from '../controllers/paymentController.js'
import { success } from '../utils/response.js'

const router = Router()

/**
 * Which payment rails a payer may actually choose.
 *
 * The web and mobile clients hardcoded the full list, so "Bank Transfer" was
 * offered whether or not a deposit account was configured. Unconfigured, that
 * rail shows the payer a placeholder account number to send real rent to.
 * Serving the list from the server means one place decides, and the UI cannot
 * drift from what the backend will accept.
 */
router.get('/methods', authenticate, (_req, res) => {
  const labels: Record<string, string> = {
    mtn_momo: 'MTN Mobile Money',
    telecel_cash: 'Telecel Cash',
    airteltigo_money: 'AirtelTigo Money',
    bank_transfer: 'Bank Transfer',
  }
  success(res, {
    methods: availableMethods().map((id) => ({ id, label: labels[id] ?? id })),
    mode: getMode(),
  })
})

router.get('/', authenticate, asyncHandler(paymentController.list))
router.post('/', authenticate, asyncHandler(paymentController.create))
router.get('/:id', authenticate, asyncHandler(paymentController.getById))

export default router
