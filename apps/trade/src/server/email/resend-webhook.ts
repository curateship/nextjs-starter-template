import { createHmac, timingSafeEqual } from "node:crypto"

import { and, eq, sql } from "drizzle-orm"

import { db, type CustomShellDb } from "@/server/db"
import { listResendWebhookSecrets } from "@/server/email/settings"
import { customShellContacts, customShellDeliveries } from "@/server/schema"
import { now } from "@/server/auth/security"

// A call whose timestamp is further out than this is refused: replaying an
// old captured request must not work forever.
const TOLERANCE_SECONDS = 5 * 60

/** The two events that change anything here. Everything else is ignored. */
const EVENT_STATUS: Record<string, "bounced" | "complained"> = {
  "email.bounced": "bounced",
  "email.complained": "complained",
}

export type ResendWebhookHeaders = {
  id: string | null
  timestamp: string | null
  signature: string | null
}

/**
 * Checks one Resend webhook signature (Resend signs the Svix way: an HMAC
 * over "id.timestamp.body" with the base64 part of the whsec_ secret).
 * Timing-safe comparison against every signature in the header, because the
 * header may carry several after a secret rotation.
 */
export function verifyResendSignature(
  secret: string,
  body: string,
  headers: ResendWebhookHeaders
): boolean {
  if (!headers.id || !headers.timestamp || !headers.signature) return false

  const timestamp = Number(headers.timestamp)
  if (!Number.isFinite(timestamp)) return false
  const age = Math.abs(Date.now() / 1000 - timestamp)
  if (age > TOLERANCE_SECONDS) return false

  let key: Buffer
  try {
    key = Buffer.from(secret.replace(/^whsec_/, ""), "base64")
  } catch {
    return false
  }
  if (key.length === 0) return false

  const expected = createHmac("sha256", key)
    .update(`${headers.id}.${headers.timestamp}.${body}`)
    .digest()

  for (const part of headers.signature.split(" ")) {
    const [version, given] = part.split(",", 2)
    if (version !== "v1" || !given) continue
    let candidate: Buffer
    try {
      candidate = Buffer.from(given, "base64")
    } catch {
      continue
    }
    if (
      candidate.length === expected.length &&
      timingSafeEqual(candidate, expected)
    ) {
      return true
    }
  }
  return false
}

type ResendEvent = {
  type?: string
  data?: {
    email_id?: string
    to?: string[] | string
  }
}

/**
 * Applies one verified event to the workspace whose secret signed it: the
 * bounced or complaining address's contact comes off the list, with the
 * status saying which of the two happened.
 *
 * Only a 'subscribed' contact changes. Someone who already opted out keeps
 * "unsubscribed" — their own choice outranks what the mail server noticed —
 * and a bounce arriving after a complaint (or the reverse) keeps the first
 * verdict rather than flip-flopping.
 *
 * Returns how many contacts changed.
 */
export async function applyResendEvent(
  workspaceId: string,
  event: ResendEvent,
  database: CustomShellDb = db
): Promise<number> {
  const status = event.type ? EVENT_STATUS[event.type] : undefined
  if (!status) return 0

  const contactIds = new Set<string>()

  // The surest match: the message id Resend gave us at send time, written on
  // the delivery row for exactly this moment.
  const emailId = event.data?.email_id
  if (emailId) {
    const rows = await database
      .select({ contactId: customShellDeliveries.contactId })
      .from(customShellDeliveries)
      .where(
        and(
          eq(customShellDeliveries.workspaceId, workspaceId),
          eq(customShellDeliveries.providerMessageId, emailId)
        )
      )
    for (const row of rows) contactIds.add(row.contactId)

    // A bounce is also marked on the delivery itself, which is what lets a
    // paced newsletter watch its own bounce rate and stop. Only a bounce: a
    // spam complaint means the address works and the person did not want it,
    // which is not a reason to think the sending is going wrong.
    //
    // Not done for the address-only match below, because that one exists for
    // the app's own sign-in mail, which has no delivery row to mark.
    if (status === "bounced") {
      await database
        .update(customShellDeliveries)
        .set({ bouncedAt: now() })
        .where(
          and(
            eq(customShellDeliveries.workspaceId, workspaceId),
            eq(customShellDeliveries.providerMessageId, emailId)
          )
        )
    }
  }

  // Fallback by address, for mail that never went through the deliveries
  // table — the app's own sign-in and verification emails.
  const to = event.data?.to
  const addresses = (Array.isArray(to) ? to : to ? [to] : [])
    .map((address) => address.trim().toLowerCase())
    .filter(Boolean)
  for (const address of addresses) {
    const rows = await database
      .select({ id: customShellContacts.id })
      .from(customShellContacts)
      .where(
        and(
          eq(customShellContacts.workspaceId, workspaceId),
          sql`lower(${customShellContacts.email}) = ${address}`
        )
      )
    for (const row of rows) contactIds.add(row.id)
  }

  let changed = 0
  for (const contactId of contactIds) {
    const updated = await database
      .update(customShellContacts)
      .set({ status, updatedAt: now() })
      .where(
        and(
          eq(customShellContacts.id, contactId),
          eq(customShellContacts.status, "subscribed")
        )
      )
      .returning({ id: customShellContacts.id })
    changed += updated.length
  }
  return changed
}

export type ResendWebhookResult =
  | { outcome: "not_configured" }
  | { outcome: "bad_signature" }
  | { outcome: "bad_payload" }
  | { outcome: "applied"; changed: number }

/**
 * The whole receiving side: find whose secret signed the call, then apply it
 * to that workspace. Trying each stored secret is the workspace lookup — the
 * webhook URL itself carries nothing.
 */
export async function handleResendWebhook(
  body: string,
  headers: ResendWebhookHeaders,
  database: CustomShellDb = db
): Promise<ResendWebhookResult> {
  const secrets = await listResendWebhookSecrets(database)
  if (secrets.length === 0) return { outcome: "not_configured" }

  const match = secrets.find(({ secret }) =>
    verifyResendSignature(secret, body, headers)
  )
  if (!match) return { outcome: "bad_signature" }

  let event: ResendEvent
  try {
    event = JSON.parse(body) as ResendEvent
  } catch {
    return { outcome: "bad_payload" }
  }

  const changed = await applyResendEvent(match.workspaceId, event, database)
  return { outcome: "applied", changed }
}
