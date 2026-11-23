import { createHmac, timingSafeEqual } from "node:crypto"
import { and, eq } from "drizzle-orm"

import { escapeHtml } from "@/lib/email/escape-html"
import { now, uuid } from "@/server/auth/security"
import { db, type CustomShellDb } from "@/server/db"
import { directoryListings } from "@/server/directory/schema"
import { listingFollows } from "@/server/promotions/schema"

/**
 * Following a listing for its deals. A signed-in person follows a published
 * listing, and `follow-mail.ts` emails them when it publishes a new deal.
 *
 * Tyler chose on 9 Oct 2026 that following needs an account, so the email
 * address is one the account already confirmed and nobody can follow on a
 * stranger's behalf. The address is read from the account when an email goes.
 */

/** Whether this person follows this listing. Signed out is never following. */
export async function isFollowing(
  siteId: string,
  userId: string,
  listingId: string,
  database: CustomShellDb = db
): Promise<boolean> {
  const [row] = await database
    .select({ id: listingFollows.id })
    .from(listingFollows)
    .where(
      and(
        eq(listingFollows.workspaceId, siteId),
        eq(listingFollows.listingId, listingId),
        eq(listingFollows.userId, userId)
      )
    )
    .limit(1)
  return Boolean(row)
}

/**
 * Follows or unfollows, and says where it ended up. Only a published listing
 * on this site can be followed; unfollowing always works, so a listing that
 * went back to draft can still be let go of.
 *
 * Following twice is one row, and a follow starts hearing about deals from
 * this moment, never about the ones already up.
 */
export async function setFollowing(
  siteId: string,
  userId: string,
  input: { listingId: string; following: boolean },
  database: CustomShellDb = db,
  at: Date = now()
): Promise<{ following: boolean }> {
  if (!input.following) {
    await database
      .delete(listingFollows)
      .where(
        and(
          eq(listingFollows.workspaceId, siteId),
          eq(listingFollows.listingId, input.listingId),
          eq(listingFollows.userId, userId)
        )
      )
    return { following: false }
  }

  const [listing] = await database
    .select({ id: directoryListings.id })
    .from(directoryListings)
    .where(
      and(
        eq(directoryListings.workspaceId, siteId),
        eq(directoryListings.id, input.listingId),
        eq(directoryListings.status, "published")
      )
    )
    .limit(1)
  if (!listing) throw new Error("That listing is no longer on this site.")

  await database
    .insert(listingFollows)
    .values({
      id: uuid(),
      workspaceId: siteId,
      listingId: listing.id,
      userId,
      createdAt: at,
      toldThrough: at,
    })
    .onConflictDoNothing()
  return { following: true }
}

// ---------------------------------------------------------------------------
// The one-tap unfollow link in every email.

function signingKey() {
  const key = process.env.CUSTOM_SHELL_SECRET_ENCRYPTION_KEY
  if (!key) throw new Error("ENCRYPTION_NOT_CONFIGURED")
  return key
}

/**
 * A signature over the follow's own id. Without it, anybody who worked out the
 * link could unfollow anybody else by guessing ids. Following again makes a
 * new row with a new id, so an old email's link never ends a new follow.
 */
function unfollowToken(followId: string) {
  return createHmac("sha256", signingKey())
    .update(`listing-unfollow:${followId}`, "utf8")
    .digest("hex")
    .slice(0, 32)
}

function verifyUnfollowToken(followId: string, token: string) {
  const expected = Buffer.from(unfollowToken(followId), "utf8")
  const provided = Buffer.from(token, "utf8")
  // Constant time, so the answer cannot be worked out a character at a time.
  return (
    expected.length === provided.length && timingSafeEqual(expected, provided)
  )
}

/** The link at the foot of a follow email, on the site the email is from. */
export function buildUnfollowUrl(siteUrl: string, followId: string) {
  const params = new URLSearchParams({ f: followId, t: unfollowToken(followId) })
  return `${siteUrl}/api/listing-unfollow?${params.toString()}`
}

/**
 * A plain page that renders with no JavaScript and no session, because it is
 * opened from inside a mail client.
 */
function page(title: string, message: string, status: number) {
  return new Response(
    `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${escapeHtml(title)}</title></head><body style="margin:0;padding:48px 20px;font-family:system-ui;background:#f4f4f5"><main style="max-width:420px;margin:auto;background:white;border:1px solid #e5e7eb;border-radius:12px;padding:32px;text-align:center"><h1 style="font-size:20px">${escapeHtml(title)}</h1><p style="color:#4b5563">${escapeHtml(message)}</p></main></body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8" } }
  )
}

/**
 * Ends one follow from the link in an email. No sign-in and no origin check:
 * the signature is the proof the link was one we sent, and it can only ever
 * end the one follow it was made for. GET is somebody tapping it; POST is an
 * inbox's own Unsubscribe button, which the email's headers ask for.
 *
 * A follow that is already gone gets the same page. Whoever tapped wants to
 * stop hearing from the listing, and they have.
 */
export async function handleUnfollowLink(
  request: Request,
  database: CustomShellDb = db
): Promise<Response> {
  const url = new URL(request.url)
  const followId = url.searchParams.get("f") ?? ""
  const token = url.searchParams.get("t") ?? ""
  if (
    !followId ||
    followId.length > 36 ||
    !token ||
    !verifyUnfollowToken(followId, token)
  ) {
    return page(
      "That link did not work",
      "This unfollow link is not one we recognise. Try the link in the most recent email, or unfollow from the listing's page.",
      400
    )
  }

  const [gone] = await database
    .delete(listingFollows)
    .where(eq(listingFollows.id, followId))
    .returning({ listingId: listingFollows.listingId })
  const [listing] = gone
    ? await database
        .select({ title: directoryListings.title })
        .from(directoryListings)
        .where(eq(directoryListings.id, gone.listingId))
        .limit(1)
    : []

  return page(
    "You have unfollowed",
    listing
      ? `You will not get any more emails about deals at ${listing.title}.`
      : "You will not get any more emails about this listing's deals.",
    200
  )
}
