import { z } from "zod"

import { type CustomShellDb } from "@/server/db"

import { RackRefusal, signReply, verifyRackRequest, type VerifiedRack } from "./rack"

/**
 * The one way every signed rack address answers. The route files under
 * `src/routes/api/rack/` each hand their request here with the shape their
 * body must have and the work to do.
 *
 * A message that fails its signature is refused unsigned, because there is
 * no rack to sign for. Everything after that, including a bad body and a
 * failure, is signed, so the rack can trust whatever it acts on.
 */

/** A check-in is a few kilobytes; a result may carry four shrunk pictures. */
const MAX_BODY_CHARS = 10_000_000

const NEVER_CACHE = { "cache-control": "no-store" }

export async function answerSigned<Shape extends z.ZodType>(
  request: Request,
  shape: Shape,
  work: (rack: VerifiedRack, data: z.infer<Shape>) => Promise<unknown>,
  db?: CustomShellDb
): Promise<Response> {
  // Refused on its stated size before it is read, so a stranger cannot make
  // the server hold a huge body in memory, and again on its real size.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return refuse(413, "This message is too large.")
  }
  const body = await request.text()
  if (body.length > MAX_BODY_CHARS) return refuse(413, "This message is too large.")

  let rack: VerifiedRack
  try {
    rack = await verifyRackRequest(
      { method: request.method, path: new URL(request.url).pathname, headers: request.headers, body },
      db
    )
  } catch (error) {
    if (error instanceof RackRefusal) return refuse(error.status, error.message)
    console.error("A rack message could not be checked", error)
    return refuse(503, "Promo could not check this message. Try again shortly.")
  }

  const nonce = request.headers.get("x-rack-nonce") ?? ""
  const signed = (status: number, value: unknown) => {
    const text = JSON.stringify(value)
    return new Response(text, {
      status,
      headers: { "content-type": "application/json", ...NEVER_CACHE, ...signReply(rack, status, nonce, text) },
    })
  }

  let parsed: unknown
  try {
    parsed = body ? JSON.parse(body) : {}
  } catch {
    return signed(400, { error: "This message is not JSON." })
  }
  const checked = shape.safeParse(parsed)
  if (!checked.success) return signed(400, { error: "This message is not in a shape Promo knows." })

  try {
    return signed(200, (await work(rack, checked.data)) ?? {})
  } catch (error) {
    if (error instanceof RackRefusal) return signed(error.status, { error: error.message })
    console.error("A rack message failed", error)
    return signed(500, { error: "Promo could not do that. It is in the server's log." })
  }
}

export function refuse(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: NEVER_CACHE })
}

/** A file the install command downloads: plain text, never kept by a cache. */
export function plainFile(text: string, type = "text/plain; charset=utf-8"): Response {
  return new Response(text, { headers: { "content-type": type, ...NEVER_CACHE } })
}
