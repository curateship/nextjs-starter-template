export async function readResponseBytesWithLimit(
  response: Response,
  maxBytes: number,
  tooLargeMessage: string
) {
  const contentLength = response.headers.get("content-length")
  if (contentLength) {
    const declared = Number.parseInt(contentLength, 10)
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(tooLargeMessage)
    }
  }

  if (!response.body) {
    throw new Error("Download response is not streamable")
  }

  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let total = 0

  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        throw new Error(tooLargeMessage)
      }
      chunks.push(value)
    }
  } finally {
    reader.releaseLock()
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}
