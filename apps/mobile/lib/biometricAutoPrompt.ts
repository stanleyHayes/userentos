/**
 * The login screen offers Face ID / fingerprint on its own only on a cold
 * start: when it is the first screen after launch. Once a session has been
 * active in this app process, a later login screen follows a sign-out (the
 * user tapped Logout, or another device signed this one out), and the prompt
 * would sign straight back in the moment the user looked at the screen. The
 * manual biometric button stays available.
 */
export function createBiometricAutoPrompt() {
  let coldStart = true
  return {
    /** True once per cold start, and never after a session was active in this process. */
    take(): boolean {
      const allowed = coldStart
      coldStart = false
      return allowed
    },
    /** A session became active (sign-in, or a restored session). */
    suppress(): void {
      coldStart = false
    },
  }
}

const autoPrompt = createBiometricAutoPrompt()
export const takeBiometricAutoPrompt = autoPrompt.take
export const suppressBiometricAutoPrompt = autoPrompt.suppress
