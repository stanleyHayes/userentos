import { test, expect } from '@playwright/test'
import { restoreProfile } from '../../apps/mobile/lib/sessionRestore'
import { createBiometricAutoPrompt } from '../../apps/mobile/lib/biometricAutoPrompt'

// Pure contract checks; no Expo web needed. The keychain keeps only the
// account id and credentials, so a cold start fetches the profile.
type Profile = { id: string; activeRole: string }
const instant = () => Promise.resolve()

test.describe('restoring the profile of a stored session', () => {
  test('a prompt answer opens the app with the profile', async () => {
    const applied: Profile[] = []
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => ({ id: 'u1', activeRole: 'landlord' }), current: () => true, apply: user => { applied.push(user) } })
    expect(outcome).toBe('loaded')
    expect(applied).toEqual([{ id: 'u1', activeRole: 'landlord' }])
  })

  test('offline, the app opens without it and keeps asking until the profile arrives', async () => {
    const applied: Profile[] = []
    let calls = 0
    let current = true
    const outcome = await restoreProfile<Profile>({
      userId: 'u1',
      load: async () => { calls++; if (calls < 3) throw new TypeError('Network request failed'); return { id: 'u1', activeRole: 'tenant' } },
      current: () => current,
      apply: user => { applied.push(user); current = false },
      sleep: instant,
    })
    expect(outcome).toBe('pending')
    await expect.poll(() => applied).toEqual([{ id: 'u1', activeRole: 'tenant' }])
    expect(calls).toBe(3)
  })

  test('a slow first answer past the time limit is still used', async () => {
    let answer!: (profile: Profile) => void
    const applied: Profile[] = []
    let timeLimit!: () => void
    const outcome = restoreProfile<Profile>({
      userId: 'u1',
      load: () => new Promise(resolve => { answer = resolve }),
      current: () => applied.length === 0,
      apply: user => { applied.push(user) },
      sleep: ms => ms === 8_000 ? new Promise(resolve => { timeLimit = resolve }) : new Promise(() => {}),
    })
    timeLimit()
    expect(await outcome).toBe('pending')
    answer({ id: 'u1', activeRole: 'tenant' })
    await expect.poll(() => applied.length).toBe(1)
  })

  test('a sign-out while loading ends it; nothing is applied', async () => {
    let current = true
    const applied: Profile[] = []
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => { current = false; throw new Error('Session expired') }, current: () => current, apply: user => { applied.push(user) }, sleep: instant })
    expect(outcome).toBe('ended')
    expect(applied).toEqual([])
  })

  test('a profile for another account is never applied', async () => {
    const applied: Profile[] = []
    let calls = 0
    const outcome = await restoreProfile<Profile>({ userId: 'u1', load: async () => { calls++; return { id: 'someone-else', activeRole: 'admin' } }, current: () => calls < 3, apply: user => { applied.push(user) }, sleep: instant })
    expect(outcome).toBe('pending')
    await expect.poll(() => calls).toBe(3)
    expect(applied).toEqual([])
  })
})

test.describe('Face ID is offered on its own only on a cold start', () => {
  test('the first login screen of a cold start prompts; a remount does not', () => {
    const prompt = createBiometricAutoPrompt()
    expect(prompt.take()).toBe(true)
    // A cancelled prompt, or coming back from the register screen.
    expect(prompt.take()).toBe(false)
  })

  test('once a session was active (restored at launch, or signed in), the login screen after a sign-out never prompts', () => {
    const prompt = createBiometricAutoPrompt()
    // authStore calls this when a session becomes active.
    prompt.suppress()
    expect(prompt.take()).toBe(false)
  })
})
