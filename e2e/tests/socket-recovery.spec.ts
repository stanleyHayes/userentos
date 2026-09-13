import { test, expect } from '@playwright/test'
import { createSocketRecovery } from '../../packages/shared/socketRecovery'
test('expiry recovery coalesces signals and reconnects the same login', async () => {
  let release!: () => void
  let requests = 0, connects = 0
  const gate = new Promise<void>(resolve => { release = resolve })
  const recovery = createSocketRecovery(() => true, async () => { requests++; await gate }, () => { connects++ })
  const first = recovery.run(); await recovery.run()
  expect(requests).toBe(1)
  release(); await first
  expect(connects).toBe(1)
})
for (const reason of ['logout', 'disposed']) test(`expiry recovery cannot reconnect after ${reason}`, async () => {
  let current = true, connects = 0
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  const recovery = createSocketRecovery(() => current, () => gate, () => { connects++ })
  const pending = recovery.run()
  if (reason === 'logout') current = false
  else recovery.dispose()
  release(); await pending
  expect(connects).toBe(0)
})
test('failed revalidation does not reconnect or leak a rejection', async () => {
  let connects = 0
  const recovery = createSocketRecovery(() => true, async () => { throw new Error('offline') }, () => { connects++ })
  await recovery.run()
  expect(connects).toBe(0)
})
