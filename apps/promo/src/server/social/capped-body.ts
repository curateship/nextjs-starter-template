/**
 * Reads a request's body as text, and stops reading the moment it passes
 * `maxBytes`. Answers null when it did.
 *
 * Every address another program posts to (the rack, Video, Viral) reads its
 * body through this. Checking only the size a sender states is not enough: a
 * sender can leave the size out and keep sending, and `request.text()` would
 * hold all of it in memory before anything else looked at it.
 */
export async function readCappedText(request: Request, maxBytes: number): Promise<string | null> {
  const stated = Number(request.headers.get("content-length") ?? 0)
  if (stated > maxBytes) {
    await request.body?.cancel().catch(() => {})
    return null
  }
  if (!request.body) return ""

  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > maxBytes) {
      await reader.cancel().catch(() => {})
      return null
    }
    chunks.push(value)
  }
  return new TextDecoder().decode(Buffer.concat(chunks))
}
