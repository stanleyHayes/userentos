/** Narrow account-security, privacy and existing-obligation access during suspension.
 * Resource ownership remains enforced by each controller; this grants no roles.
 */
export function suspendedAccess(method: string, originalUrl: string): boolean {
  const path = originalUrl.split('?')[0].replace(/\/$/, '')
  if (method === 'GET') return [
    '/api/users/me', '/api/users/me/export', '/api/agreements', '/api/payments', '/api/payments/methods',
  ].includes(path) || /^\/api\/(agreements|payments)\/[a-f\d]{24}$/i.test(path) || /^\/api\/agreements\/[a-f\d]{24}\/document\.pdf$/i.test(path) || /^\/api\/payments\/[a-f\d]{24}\/receipt\.html$/i.test(path)
  if (method === 'DELETE') return path === '/api/users/me'
  if (method === 'POST') return [
    '/api/auth/change-password', '/api/auth/logout-all', '/api/auth/mfa/setup', '/api/auth/mfa/enable', '/api/auth/mfa/disable', '/api/payments',
  ].includes(path) || /^\/api\/agreements\/[a-f\d]{24}\/document-link$/i.test(path) || /^\/api\/payments\/[a-f\d]{24}\/receipt$/i.test(path)
  return false
}
