/** Local cleanup must succeed. Remote revocation is reported separately so an
 * offline device never claims other sessions have been revoked.
 */
export async function disableBiometricCredentials(clear: () => Promise<void>, revoke: () => Promise<unknown>) {
  const cleanup = clear()
  const remote = revoke().then(() => true, () => false)
  const [, serverRevoked] = await Promise.all([cleanup, remote])
  return { serverRevoked }
}
