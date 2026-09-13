/** Buffered JSON transport: the deadline remains active until the body is read.
 * Used only for non-streaming AI requests. SDKs still own authentication and parsing.
 */
export function createAiFetch(origin: string, options: { timeoutMs?: number; maxResponseBytes?: number } = {}): typeof fetch {
  const timeoutMs = options.timeoutMs ?? 30_000
  const maxResponseBytes = options.maxResponseBytes ?? 16 * 1024 * 1024
  return async (input, init) => {
    const url = new URL(input instanceof Request ? input.url : String(input))
    if (url.origin !== origin || url.username || url.password) throw new Error('AI provider endpoint is not allowed')
    const controller = new AbortController()
    const upstream = init?.signal ?? (input instanceof Request ? input.signal : undefined)
    const signal = upstream ? AbortSignal.any([upstream, controller.signal]) : controller.signal
    const timer = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(input, { ...init, signal, redirect: 'error' })
      const reader = response.body?.getReader()
      if (!reader) return response
      const chunks: Uint8Array[] = []
      let length = 0
      while (true) {
        const part = await reader.read()
        if (part.done) break
        length += part.value.byteLength
        if (length > maxResponseBytes) throw new Error('AI response exceeds limit')
        chunks.push(part.value)
      }
      const body = new Uint8Array(length)
      let offset = 0
      for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
      const headers = new Headers(response.headers)
      // Native fetch already decompresses the bytes being buffered.
      headers.delete('content-encoding')
      headers.delete('content-length')
      return new Response(body.buffer, { status: response.status, statusText: response.statusText, headers })
    } catch {
      controller.abort()
      // Never retain provider URLs, bodies or error messages in an error cause.
      throw new Error('AI provider request failed or exceeded its response limit')
    } finally {
      clearTimeout(timer)
    }
  }
}
