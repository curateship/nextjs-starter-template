import { createHmac, timingSafeEqual } from "node:crypto"
import { eq } from "drizzle-orm"

import { escapeHtml } from "@/lib/escape-html"
import { appUrlFor } from "@/server/app-url"
import { db, type CustomShellDb } from "@/server/db"
import { customShellContacts } from "@/server/schema"
import { now } from "@/server/auth/security"

/**
 * Signed one-click unsubscribe links.
 *
 * The token is a signature over the contact's id, made with the same secret
 * the app already uses to encrypt stored keys. Without it, anybody who worked
 * out the link format could unsubscribe anybody else by guessing ids.
 */

function signingKey() {
  const secret = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!secret) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  return secret
}

/**
 * Whether unsubscribe links can be built at all.
 *
 * Asked once before a send starts rather than discovered per recipient: the
 * signing key is missing or it is not, and finding out halfway through a batch
 * only produces a broadcast that retries forever and delivers nothing.
 */
export function canBuildUnsubscribeLinks() {
  return Boolean(process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY)
}

function unsubscribeToken(contactId: string) {
  return createHmac("sha256", signingKey())
    .update(`unsubscribe:${contactId}`, "utf8")
    .digest("hex")
    .slice(0, 32)
}

export function verifyUnsubscribeToken(contactId: string, token: string) {
  const expected = Buffer.from(unsubscribeToken(contactId), "utf8")
  const provided = Buffer.from(token, "utf8")
  // Compared in constant time so the answer cannot be worked out a character
  // at a time from how long the check took.
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  )
}

export function buildUnsubscribeUrl(contactId: string) {
  const params = new URLSearchParams({
    c: contactId,
    t: unsubscribeToken(contactId),
  })
  return appUrlFor(`/unsubscribe?${params.toString()}`)
}

/**
 * A plain, self-contained page rather than the app's own shell: this is opened
 * from inside a mail client, often by somebody who has never signed in, and it
 * has to render with no JavaScript and no session.
 */
function htmlResponse(title: string, message: string, status: number) {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:48px 20px;font-family:system-ui,-apple-system,sans-serif;background-color:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center;"><h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">${escapeHtml(title)}</h1><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(message)}</p></div></body></html>`
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

/**
 * Takes somebody off the list.
 *
 * No sign-in and no origin check, on purpose: the link is followed from an
 * email, and some inboxes fire it themselves with a POST before anybody has
 * clicked anything. The signature on the address is what makes that safe — it
 * is the only thing proving the link was one we sent, and it means the request
 * can only ever unsubscribe the one person the link was built for.
 *
 * Unsubscribing twice is not an error. Whoever followed the link wants to be
 * off the list, and they are, so they get the same page either way.
 */
export async function handleUnsubscribeRequest(
  request: Request,
  database: CustomShellDb = db
) {
  const url = new URL(request.url)
  const contactId = url.searchParams.get("c") ?? ""
  const token = url.searchParams.get("t") ?? ""

  if (
    !contactId ||
    contactId.length > 36 ||
    !token ||
    !verifyUnsubscribeToken(contactId, token)
  ) {
    return htmlResponse(
      "That link did not work",
      "This unsubscribe link is not one we recognise. If you got here from an email, try the link in the most recent one.",
      400
    )
  }

  const [contact] = await database
    .select({
      id: customShellContacts.id,
      status: customShellContacts.status,
    })
    .from(customShellContacts)
    .where(eq(customShellContacts.id, contactId))
    .limit(1)

  if (!contact) {
    return htmlResponse(
      "Nothing to do",
      "This address is not on the list any more, so there is nothing to unsubscribe.",
      404
    )
  }

  if (contact.status !== "unsubscribed") {
    const timestamp = now()
    await database
      .update(customShellContacts)
      .set({
        status: "unsubscribed",
        unsubscribedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(customShellContacts.id, contactId))
  }

  return htmlResponse(
    "You are off the list",
    "You will not get any more emails from us. Nothing else to do.",
    200
  )
}
