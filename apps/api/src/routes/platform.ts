import { Router } from 'express'
import { regulatedFeatureStatus } from '../config/regulatedFeatures.js'
import { signupRoles } from '../config/signupRoles.js'
import { success } from '../utils/response.js'

const router = Router()

// Public: clients hide regulated features the operator has not enabled, instead
// of showing screens whose every request would be refused, and offer only the
// account types sign-up will accept.
router.get('/features', (_req, res) => {
  res.setHeader('Cache-Control', 'public, max-age=300')
  success(res, { regulated: regulatedFeatureStatus(), signupRoles: signupRoles() })
})

export default router
