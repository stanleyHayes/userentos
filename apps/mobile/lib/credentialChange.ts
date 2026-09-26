/**
 * A password change revokes every refresh token, this device's included, and
 * answers with a fresh pair. A request that gets a 401 while the change is in
 * flight would refresh with the revoked token and sign the user out, so it
 * waits for the change instead and retries with the new pair.
 */
let pending: Promise<unknown> | null = null

/** Run a credential change; `run` should store the renewed pair before resolving. */
export async function withCredentialChange<T>(run: () => Promise<T>): Promise<T> {
  const change = run()
  pending = change
  try {
    return await change
  } finally {
    if (pending === change) pending = null
  }
}

export function pendingCredentialChange(): Promise<unknown> | null {
  return pending
}
