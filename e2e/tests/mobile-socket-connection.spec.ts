import { test, expect } from '@playwright/test'
import { createSocketConnection } from '../../apps/mobile/lib/socketConnection'
function fixture() {
  let created = 0, disconnects = 0, connects = 0, cleared = 0
  const listeners = new Set<string>()
  const manager = createSocketConnection(token => {
    created++
    return { auth: { token }, disconnect: () => { disconnects++ }, connect: () => { connects++ }, removeAllListeners: () => { cleared++; listeners.clear() } }
  })
  return { manager, listeners, counts: () => ({ created, disconnects, connects, cleared }) }
}
test('mobile screens share the same pending or disconnected socket without erasing listeners', () => {
  const f = fixture()
  const first = f.manager.connect('original')
  f.listeners.add('chat:new')
  expect(f.manager.connect('original')).toBe(first)
  expect(f.manager.connect('original')).toBe(first)
  expect(f.listeners.has('chat:new')).toBe(true)
  expect(f.counts()).toEqual({ created: 1, connects: 0, disconnects: 0, cleared: 0 })
})
test('mobile token rotation reconnects the existing socket and preserves listeners', () => {
  const f = fixture()
  const first = f.manager.connect('original')
  f.listeners.add('notification:new')
  expect(f.manager.connect('rotated')).toBe(first)
  expect(first.auth).toEqual({ token: 'rotated' })
  expect(f.listeners.has('notification:new')).toBe(true)
  expect(f.counts()).toEqual({ created: 1, connects: 1, disconnects: 1, cleared: 0 })
})
test('mobile logout clears the old socket and a new login creates a new instance', () => {
  const f = fixture()
  const first = f.manager.connect('original')
  f.listeners.add('notification:new')
  f.manager.disconnect()
  expect(f.manager.get()).toBeNull()
  expect(f.listeners.size).toBe(0)
  expect(f.manager.connect('replacement')).not.toBe(first)
  expect(f.counts()).toEqual({ created: 2, connects: 0, disconnects: 1, cleared: 1 })
})
