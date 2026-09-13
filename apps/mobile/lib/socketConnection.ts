export interface ManagedSocket {
  auth: unknown
  disconnect(): unknown
  connect(): unknown
  removeAllListeners(): unknown
}
/** Multiple screens share one socket, including while a connection is pending.
 * Credential rotation reconnects that same object so listeners remain attached. */
export function createSocketConnection<T extends ManagedSocket>(create: (token: string) => T) {
  let socket: T | null = null
  let activeToken: string | null = null
  return {
    get: () => socket,
    connect(token: string): T {
      if (socket) {
        if (activeToken !== token) {
          socket.disconnect()
          activeToken = token
          socket.auth = { token }
          socket.connect()
        }
        return socket
      }
      activeToken = token
      socket = create(token)
      return socket
    },
    disconnect() {
      if (socket) { socket.removeAllListeners(); socket.disconnect() }
      socket = null
      activeToken = null
    },
  }
}
