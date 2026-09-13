/** OS permission/token work may finish after logout or effect cleanup. */
export async function registerSessionPush(
  isCurrent: () => boolean,
  acquireToken: () => Promise<string | null>,
  register: (token: string) => Promise<unknown>,
): Promise<string | null> {
  try {
    if (!isCurrent()) return null
    const token = await acquireToken()
    if (!token || !isCurrent()) return null
    await register(token)
    return isCurrent() ? token : null
  } catch {
    // Registration is optional; OS/provider/network errors must not break app boot.
    return null
  }
}
