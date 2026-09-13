interface RoomSocket {
  connected: boolean
  emit(event: string, room: string): unknown
  on(event: 'connect', callback: () => void): unknown
  off(event: 'connect', callback: () => void): unknown
}
/** Rooms belong to a connection, so every reconnect must request membership.
 * Do not buffer joins/leaves from an abandoned screen while disconnected. */
export function joinSocketRoom(socket: RoomSocket, room: string): () => void {
  let active = true
  const join = () => { if (active) socket.emit('join:conversation', room) }
  socket.on('connect', join)
  if (socket.connected) join()
  return () => {
    active = false
    socket.off('connect', join)
    if (socket.connected) socket.emit('leave:conversation', room)
  }
}
