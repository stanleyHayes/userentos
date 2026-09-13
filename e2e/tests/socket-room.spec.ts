import { test, expect } from '@playwright/test'
import { joinSocketRoom } from '../../packages/shared/socketRoom'
function fixture(connected = true) {
  const listeners = new Set<() => void>()
  const events: [string, string][] = []
  const socket = { connected, emit: (event: string, room: string) => events.push([event, room]), on: (_event: 'connect', callback: () => void) => listeners.add(callback), off: (_event: 'connect', callback: () => void) => listeners.delete(callback) }
  return { socket, events, reconnect() { socket.connected = true; for (const listener of listeners) listener() } }
}
test('an open conversation rejoins every new connection and leaves on cleanup', () => {
  const f = fixture()
  const leave = joinSocketRoom(f.socket, 'chat-a')
  f.reconnect()
  expect(f.events).toEqual([['join:conversation', 'chat-a'], ['join:conversation', 'chat-a']])
  leave(); f.reconnect()
  expect(f.events).toHaveLength(3)
  expect(f.events[2]).toEqual(['leave:conversation', 'chat-a'])
})
test('a pending connection joins only the current conversation', () => {
  const f = fixture(false)
  const leave = joinSocketRoom(f.socket, 'old-chat')
  leave()
  joinSocketRoom(f.socket, 'current-chat')
  expect(f.events).toEqual([])
  f.reconnect()
  expect(f.events).toEqual([['join:conversation', 'current-chat']])
})
test('cleanup while disconnected does not buffer a stale leave command', () => {
  const f = fixture()
  const leave = joinSocketRoom(f.socket, 'chat-a')
  f.socket.connected = false
  leave(); f.reconnect()
  expect(f.events).toEqual([['join:conversation', 'chat-a']])
})
