import { buildAcceptance } from '../../packages/shared/legalVersions'

/** Terms/Privacy acceptance + 18+ confirmation that POST /api/auth/register requires. */
export const acceptance = buildAcceptance()
