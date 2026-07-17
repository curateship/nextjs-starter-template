import { eq } from "drizzle-orm"

import { escapeHtml } from "@/lib/broadcasts/render"
import { verifyUnsubscribeToken } from "@/server/broadcasts/unsubscribe"
import { db, type CustomShellDb } from "@/server/db"
import { newsletterContacts } from "@/server/schema"
import { now } from "@/server/security"

function htmlResponse(title: string, message: string, status: number) {
  const body = `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1.0"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:48px 20px;font-family:Arial,sans-serif;background-color:#f4f4f5;"><div style="max-width:420px;margin:0 auto;background:#ffffff;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center;"><h1 style="margin:0 0 8px 0;font-size:20px;color:#111827;">${escapeHtml(title)}</h1><p style="margin:0;font-size:14px;line-height:1.6;color:#4b5563;">${escapeHtml(message)}</p></div></body></html>`
  return new Response(body, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  })
}

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
      "Invalid link",
      "This unsubscribe link is invalid or has expired.",
      400
    )
  }

  const [contact] = await database
    .select({
      id: newsletterContacts.id,
      status: newsletterContacts.status,
    })
    .from(newsletterContacts)
    .where(eq(newsletterContacts.id, contactId))
    .limit(1)

  if (!contact) {
    return htmlResponse(
      "Not found",
      "This contact no longer exists, so there is nothing to unsubscribe.",
      404
    )
  }

  if (contact.status !== "unsubscribed") {
    await database
      .update(newsletterContacts)
      .set({ status: "unsubscribed", updatedAt: now() })
      .where(eq(newsletterContacts.id, contactId))
  }

  return htmlResponse(
    "You're unsubscribed",
    "You will no longer receive emails from this list.",
    200
  )
}
