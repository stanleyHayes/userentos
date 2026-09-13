import { renderRentReceipt } from '../services/payments/receiptHtml.js'
import { issueRentReceipt, readRentReceipt, RentReceiptError } from '../services/payments/rentReceipt.js'
import { param } from '../utils/params.js'
import { Router } from 'express'
import { availableMethods, getMode } from '../services/payments/index.js'
import { authenticate } from '../middleware/auth.js'
import { asyncHandler } from '../middleware/errorHandler.js'
import { paymentController } from '../controllers/paymentController.js'
import { success, error } from '../utils/response.js'

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
router.post('/:id/receipt', authenticate, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  try { success(res, await issueRentReceipt(param(req.params.id), req.user!.userId)) }
  catch (failure) {
    if (failure instanceof RentReceiptError) { error(res, failure.message, failure.status); return }
    throw failure
  }
}))
router.get('/:id/receipt.html', authenticate, asyncHandler(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store')
  res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'; sandbox")
  res.setHeader('Referrer-Policy', 'no-referrer')
  res.setHeader('X-Content-Type-Options', 'nosniff')
  try {
    const data = await readRentReceipt(param(req.params.id), req.user!.userId)
    res.setHeader('Content-Disposition', 'inline; filename="rent-receipt.html"')
    res.type('html').send(renderRentReceipt(data.receipt, data.paymentStatus))
  } catch (failure) {
    if (failure instanceof RentReceiptError) { error(res, failure.message, failure.status); return }
    throw failure
  }
}))
router.get('/:id', authenticate, asyncHandler(paymentController.getById))

export default router
