import type { IncomingMessage, ServerResponse } from "node:http"

/** Answers with JSON that is never cached. */
export function send(response: ServerResponse, status: number, body: unknown) {
  response.statusCode = status
  response.setHeader("Content-Type", "application/json")
  response.setHeader("Cache-Control", "no-store")
  response.end(JSON.stringify(body))
}

/** The request's body as text. Throws "too-large" past `maxBytes`. */
export async function readBody(request: IncomingMessage, maxBytes: number) {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    size += (chunk as Buffer).length
    if (size > maxBytes) throw new Error("too-large")
    chunks.push(chunk as Buffer)
  }
  return Buffer.concat(chunks).toString("utf8")
}
