import { createServer, type Server as HttpServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { Request, Response } from 'express'
import { io as connect, type Socket as ClientSocket } from 'socket.io-client'
import type { Server } from 'socket.io'
import { vi } from 'vitest'
import { authenticate, optionalAuth } from '../middleware/auth.js'
import { initSocket, realtimeChecksReady, shutdownRealtime, type RealtimeOptions } from '../services/socket.js'

/** Shared plumbing for the live session/socket integration suites. */

export function nextEvent(client: ClientSocket, name: string, timeoutMs = 3000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { client.off(name, done); reject(new Error(`Missing ${name}`)) }, timeoutMs)
    function done(value: unknown) { clearTimeout(timer); resolve(value) }
    client.once(name, done)
  })
}

/** Every event a client receives, reserved 'disconnect' included, in order. */
export function recordEvents(client: ClientSocket): string[] {
  const seen: string[] = []
  client.onAny((name: string) => seen.push(name))
  client.on('disconnect', () => seen.push('disconnect'))
  return seen
}

export interface Realtime {
  http: HttpServer
  server: Server
  /** Connects with `token`; resolves once connected (or refused, when `refused`). */
  open(token: string, refused?: boolean): Promise<ClientSocket>
  close(): Promise<void>
}

export async function startRealtime(options: RealtimeOptions = {}): Promise<Realtime> {
  const http: HttpServer = createServer()
  const server: Server = initSocket(http, options)
  await new Promise<void>(resolve => http.listen(0, '127.0.0.1', resolve))
  await realtimeChecksReady(server)
  const base = `http://127.0.0.1:${(http.address() as AddressInfo).port}`
  const clients: ClientSocket[] = []
  return {
    http,
    server,
    async open(token: string, refused = false) {
      const client = connect(base, { auth: { token }, transports: ['websocket'], reconnection: false, autoConnect: false })
      clients.push(client)
      const ready = nextEvent(client, refused ? 'connect_error' : 'connect')
      client.connect(); await ready
      if (!refused) {
        // 'connect' arrives before the server finishes admitting the socket
        // (private rooms, account re-check); packets wait for admission, so
        // one round trip means it is done.
        const answered = nextEvent(client, 'online:list')
        client.emit('get:online'); await answered
      }
      return client
    },
    async close() {
      for (const client of clients) client.disconnect()
      await shutdownRealtime(server, http)
    },
  }
}

/** Runs `authenticate` (or `optionalAuth`) on a bearer token; true when it let the request through. */
export async function accepts(token: string, optional = false): Promise<boolean> {
  const req = { headers: { authorization: `Bearer ${token}` }, method: 'GET', originalUrl: '/api/users/me', query: {} } as unknown as Request
  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }
  const next = vi.fn()
  await (optional ? optionalAuth : authenticate)(req, res as unknown as Response, next)
  return optional ? req.user !== undefined : next.mock.calls.length > 0
}
