import { and, eq, isNull, lt } from "drizzle-orm"

import {
  OWNER_MESSAGE_MAX,
  OWNER_MESSAGE_NAME_MAX,
} from "@/lib/directory/field-lengths"
import {
  OWNER_MESSAGE_BAD_EMAIL,
  OWNER_MESSAGE_FAILED,
  OWNER_MESSAGE_LISTING_BUSY,
  OWNER_MESSAGE_NEEDS_NAME,
  OWNER_MESSAGE_NEEDS_TEXT,
  OWNER_MESSAGE_VISITOR_BUSY,
  OWNER_MESSAGES_CLOSED,
} from "@/lib/directory/owner-message-sentences"
import { looksLikeEmail } from "@/lib/directory/submission-fields"
import { now, uuid } from "@/server/auth/security"
import { enforceRateLimit } from "@/server/auth/rate-limit"
import { db, type CustomShellDb } from "@/server/db"
import { sendDirectoryEmail } from "@/server/directory/mail"
import {
  directoryClaims,
  directoryListings,
  directoryOwnerMessages,
} from "@/server/directory/schema"
import { directorySettingsFor } from "@/server/directory/settings"

/**
 * "Message the owner": a visitor writes to whoever looks after a listing, and
 * the site passes it on by email.
 *
 * - **The owner's address never leaves the server.** It is read here, handed
 *   to the email provider, and nothing else. The visitor is told "sent" or a
 *   plain sentence, never the provider's own words, which can quote the
 *   address they failed on.
 * - **The owner replies straight to the visitor.** The email's reply-to is the
 *   visitor's address, so the answer never passes through the site.
 * - **One row per message**, sent or failed. The visitor's name, address and
 *   words are emptied after 30 days, Tyler's call on 16 Oct 2026, and the row
 *   stays as the record that a message was passed on.
 * - **The visitor's copy never repeats their words.** Anybody can type
 *   somebody else's address into the form, and a copy that quoted the message
 *   would let them send that person whatever they liked from this site.
 */

/** How long a message's words are kept before they are emptied. */
const OWNER_MESSAGE_TEXT_KEPT_DAYS = 30

/** One visitor, by address and by email, in an hour. The tenth is refused. */
const PER_VISITOR_PER_HOUR = 9
/** Every visitor together, to one listing, in an hour. */
const PER_LISTING_PER_HOUR = 20

const DAY_MS = 24 * 60 * 60 * 1000

type OwnerMessageInput = {
  name: string
  email: string
  message: string
}

/**
 * The checks that need no database, run before anything is counted, so a
 * visitor who left a box empty does not spend one of their nine on it.
 */
export function cleanOwnerMessageInput(
  input: OwnerMessageInput
): OwnerMessageInput {
  // One line: it goes into the email's subject.
  const name = input.name
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, OWNER_MESSAGE_NAME_MAX)
  if (!name) throw new Error(OWNER_MESSAGE_NEEDS_NAME)

  const email = input.email.trim().toLowerCase().slice(0, 255)
  // One address and nothing else: it becomes the reply-to and the copy's
  // recipient, where a comma or a bracket could name a second person.
  if (!looksLikeEmail(email) || /[,;<>"]/.test(email)) {
    throw new Error(OWNER_MESSAGE_BAD_EMAIL)
  }

  const message = input.message.trim().slice(0, OWNER_MESSAGE_MAX)
  if (!message) throw new Error(OWNER_MESSAGE_NEEDS_TEXT)

  return { name, email, message }
}

async function countAttempt(
  key: string,
  limit: number,
  refusal: string,
  database: CustomShellDb
) {
  try {
    await enforceRateLimit(
      key,
      { maxAttempts: limit, windowSeconds: 60 * 60 },
      database
    )
  } catch (error) {
    if (error instanceof Error && error.message === "RATE_LIMITED") {
      throw new Error(refusal)
    }
    throw error
  }
}

/**
 * The limits, counted before the listing is looked up so this door is never a
 * free way to ask which listings take messages.
 *
 * A visitor is their network address and, separately, the email they typed.
 * Either one reaching ten in an hour is refused, so changing one of them is
 * not a fresh start. `from` is "unknown" when a proxy hid the address, and
 * then everybody behind it shares one count. Stricter is the right way for
 * this to fail.
 */
export async function countOwnerMessageAttempt(
  siteId: string,
  from: string,
  email: string,
  listingId: string,
  database: CustomShellDb = db
) {
  await countAttempt(
    `directory-owner-message-ip:${siteId}:${from}`,
    PER_VISITOR_PER_HOUR,
    OWNER_MESSAGE_VISITOR_BUSY,
    database
  )
  await countAttempt(
    `directory-owner-message-email:${siteId}:${email}`,
    PER_VISITOR_PER_HOUR,
    OWNER_MESSAGE_VISITOR_BUSY,
    database
  )
  await countAttempt(
    `directory-owner-message-listing:${siteId}:${listingId}`,
    PER_LISTING_PER_HOUR,
    OWNER_MESSAGE_LISTING_BUSY,
    database
  )
}

/**
 * Who a message about this listing goes to, or null when it goes to nobody.
 *
 * The listing has to be published and on this site, the site has to have the
 * switch on, and somebody has to hold the approved claim. The address is the
 * one they proved when they claimed it, the same one the claim's own emails go
 * to.
 */
async function listingOwnerForMessage(
  siteId: string,
  listingId: string,
  database: CustomShellDb = db
): Promise<{ title: string; slug: string; ownerEmail: string } | null> {
  const settings = await directorySettingsFor(siteId, database)
  if (!settings.ownerMessagesEnabled) return null

  const [row] = await database
    .select({
      title: directoryListings.title,
      slug: directoryListings.slug,
      ownerEmail: directoryClaims.contactEmail,
    })
    .from(directoryListings)
    .innerJoin(
      directoryClaims,
      and(
        eq(directoryClaims.listingId, directoryListings.id),
        eq(directoryClaims.workspaceId, siteId),
        eq(directoryClaims.status, "approved")
      )
    )
    .where(
      and(
        eq(directoryListings.id, listingId),
        eq(directoryListings.workspaceId, siteId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)

  return row ?? null
}

type SendEmail = typeof sendDirectoryEmail

/**
 * Passes one message on: the owner's email, the row, then the visitor's copy.
 *
 * A failed email to the owner leaves a failed row and tells the visitor in a
 * plain sentence. A failed copy to the visitor changes nothing: the owner has
 * the message, which is the part that matters.
 */
export async function sendOwnerMessage(
  site: { id: string; name: string; url: string },
  listingId: string,
  input: OwnerMessageInput,
  options: {
    database?: CustomShellDb
    send?: SendEmail
    timestamp?: Date
  } = {}
): Promise<void> {
  const database = options.database ?? db
  const send = options.send ?? sendDirectoryEmail
  const timestamp = options.timestamp ?? now()
  const { name, email, message } = cleanOwnerMessageInput(input)

  const owner = await listingOwnerForMessage(site.id, listingId, database)
  if (!owner) throw new Error(OWNER_MESSAGES_CLOSED)

  const listingUrl = `${site.url}/directory/${owner.slug}`
  let error = ""
  try {
    await send(
      {
        workspaceId: site.id,
        to: owner.ownerEmail,
        replyTo: email,
        subject: `${name} sent a message about ${owner.title}`,
        lines: [
          `${name} wrote to you through ${owner.title}'s page on ${site.name}:`,
          ...message.split(/\r?\n/).filter((line) => line.trim()),
          `Reply to this email to answer ${name} at ${email}. Your reply goes straight to them, and ${site.name} does not see it.`,
          `${site.name} passed this on because you look after the listing. It never shows your email address to visitors.`,
        ],
        action: { label: "Open the listing", url: listingUrl },
      },
      database
    )
  } catch (failure) {
    error =
      (failure instanceof Error ? failure.message : String(failure)) ||
      "The email could not be sent."
  }

  await database.insert(directoryOwnerMessages).values({
    id: uuid(),
    workspaceId: site.id,
    listingId,
    senderName: name,
    senderEmail: email,
    message,
    status: error ? "failed" : "sent",
    error: error.slice(0, 500),
    createdAt: timestamp,
  })

  if (error) throw new Error(OWNER_MESSAGE_FAILED)

  try {
    await send(
      {
        workspaceId: site.id,
        to: email,
        subject: `Your message about ${owner.title} was sent`,
        lines: [
          `We passed your message on to the people who look after ${owner.title} on ${site.name}.`,
          "If they answer, the reply comes to this address from them.",
          "If you did not write to them, somebody typed your address into the form. You can ignore this email.",
        ],
      },
      database
    )
  } catch {
    // A courtesy. The owner already has the message.
  }
}

/**
 * Empties the name, address and words of every message older than 30 days.
 * Returns how many it emptied.
 */
export async function forgetOldOwnerMessageText(
  database: CustomShellDb = db,
  timestamp: Date = now()
): Promise<number> {
  const cutoff = new Date(
    timestamp.getTime() - OWNER_MESSAGE_TEXT_KEPT_DAYS * DAY_MS
  )
  const cleared = await database
    .update(directoryOwnerMessages)
    .set({
      senderName: "",
      senderEmail: "",
      message: "",
      textClearedAt: timestamp,
    })
    .where(
      and(
        isNull(directoryOwnerMessages.textClearedAt),
        lt(directoryOwnerMessages.createdAt, cutoff)
      )
    )
    .returning({ id: directoryOwnerMessages.id })
  return cleared.length
}

let lastSweepAt = 0
const SWEEP_EVERY_MS = 60 * 60 * 1000

/**
 * The background ticker's turn: the sweep above, at most once an hour on this
 * server. Two servers running it together each find nothing the other left.
 */
export async function ownerMessageTextSweep() {
  const at = Date.now()
  if (at - lastSweepAt < SWEEP_EVERY_MS) return
  lastSweepAt = at
  await forgetOldOwnerMessageText()
}
