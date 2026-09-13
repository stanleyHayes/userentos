/** Preserve events received after a history request began; an older request
 * must never replace the result of a newer request or another conversation. */
export function createMessageSnapshots<T extends { id: string }>() {
  let current: { conversationId: string; updates: Map<string, T | null> } | null = null
  return {
    begin(conversationId: string) {
      const ticket = { conversationId, updates: new Map<string, T | null>() }
      current = ticket
      return {
        commit(messages: T[]): T[] | null {
          if (current !== ticket) return null
          current = null
          const merged = new Map(messages.map(message => [message.id, message]))
          for (const [id, message] of ticket.updates) {
            if (message) merged.set(id, message)
            else merged.delete(id)
          }
          return [...merged.values()]
        },
        cancel() { if (current === ticket) current = null },
      }
    },
    record(conversationId: string, message: T) {
      if (current?.conversationId === conversationId) current.updates.set(message.id, message)
    },
    remove(conversationId: string, id: string) {
      if (current?.conversationId === conversationId) current.updates.set(id, null)
    },
  }
}
