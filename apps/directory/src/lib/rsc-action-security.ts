function firstForwardedValue(value: string | null) {
  return value?.split(",", 1)[0]?.trim() ?? ""
}

export function isSameOriginRequest(request: Request) {
  const originHeader = request.headers.get("origin")
  if (!originHeader) return false

  let origin: URL
  try {
    origin = new URL(originHeader)
  } catch {
    return false
  }

  const requestUrl = new URL(request.url)
  if (origin.origin === requestUrl.origin) return true

  const forwardedHost = firstForwardedValue(
    request.headers.get("x-forwarded-host")
  )
  const forwardedProtocol = firstForwardedValue(
    request.headers.get("x-forwarded-proto")
  )

  return (
    forwardedHost !== "" &&
    forwardedProtocol !== "" &&
    origin.host === forwardedHost &&
    origin.protocol === `${forwardedProtocol}:`
  )
}

export async function readLimitedRequestBody(
  request: Request,
  maxBytes: number
) {
  const reader = request.body?.getReader()
  if (!reader) return new Uint8Array()

  const chunks: Uint8Array[] = []
  let totalBytes = 0

  while (true) {
    const { done, value } = await reader.read()
    if (done) break

    totalBytes += value.byteLength
    if (totalBytes > maxBytes) {
      await reader.cancel()
      return null
    }
    chunks.push(value)
  }

  const body = new Uint8Array(totalBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return body
}
