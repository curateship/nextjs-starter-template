import { z } from "zod"

import { type CustomShellDb } from "@/server/db"

import { PhoneRefusal, signReply, verifyPhoneRequest, type VerifiedPhone } from "./link"

/**
 * The one way every signed phone address answers. The route files under
 * `src/routes/api/phone/` each hand their request here with the shape their
 * body must have and the work to do. Copied from Promo's `rack-http.ts`.
 *
 * These addresses are outside `src/lib/api/`, so the shell's guard test never
 * walks them: the signature checked here is the only lock on them, and
 * `src/server/phone/routes.test.ts` checks every one of them refuses a wrong
 * signature.
 *
 * A message that fails its signature is refused unsigned, because there is no
 * phone to sign for. Everything after that, including a bad body and a
 * failure, is signed, so the phone can trust whatever it acts on.
 */

/** A check-in is a few hundred bytes; a result may carry one full-size screenshot. */
const MAX_BODY_CHARS = 8_000_000

const NEVER_CACHE = { "cache-control": "no-store" }

export async function answerSigned<Shape extends z.ZodType>(
  request: Request,
  shape: Shape,
  work: (phone: VerifiedPhone, data: z.infer<Shape>) => Promise<unknown>,
  db?: CustomShellDb
): Promise<Response> {
  // Refused on its stated size before it is read, so a stranger cannot make
  // the server hold a huge body in memory, and again on its real size.
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return refuse(413, "This message is too large.")
  }
  const body = await request.text()
  if (body.length > MAX_BODY_CHARS) return refuse(413, "This message is too large.")

  let phone: VerifiedPhone
  try {
    phone = await verifyPhoneRequest(
      { method: request.method, path: new URL(request.url).pathname, headers: request.headers, body },
      db
    )
  } catch (error) {
    if (error instanceof PhoneRefusal) return refuse(error.status, error.message)
    console.error("A phone message could not be checked", error)
    return refuse(503, "Date could not check this message. Try again shortly.")
  }

  const nonce = request.headers.get("x-phone-nonce") ?? ""
  const signed = (status: number, value: unknown) => {
    const text = JSON.stringify(value)
    return new Response(text, {
      status,
      headers: { "content-type": "application/json", ...NEVER_CACHE, ...signReply(phone, status, nonce, text) },
    })
  }

  let parsed: unknown
  try {
    parsed = body ? JSON.parse(body) : {}
  } catch {
    return signed(400, { error: "This message is not JSON." })
  }
  const checked = shape.safeParse(parsed)
  if (!checked.success) return signed(400, { error: "This message is not in a shape Date knows." })

  try {
    return signed(200, (await work(phone, checked.data)) ?? {})
  } catch (error) {
    if (error instanceof PhoneRefusal) return signed(error.status, { error: error.message })
    console.error("A phone message failed", error)
    return signed(500, { error: "Date could not do that. It is in the server's log." })
  }
}

export function refuse(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: NEVER_CACHE })
}
