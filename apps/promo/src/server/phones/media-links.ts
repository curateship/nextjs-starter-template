import { createHash, randomBytes } from "node:crypto"

import { and, eq, isNull, lt } from "drizzle-orm"

import { uuid } from "@/server/auth/security"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getFromR2 } from "@/server/media/storage"

import { rackServerAddress } from "./release"
import { promoMediaLinks } from "./schema"

/**
 * One-time links to media library files, for getting a photo or video onto
 * an iPhone (part 55 of the phone farm).
 *
 * A computer cannot drop a file into an iPhone's Photos the way the rack
 * pushes one into an Android's gallery. So for an iPhone post, Promo makes a
 * link good for ten minutes and one download, the rack opens it in Safari on
 * the phone and saves the file to Photos through the screen, and the post
 * steps pick it from Photos. The link is dead after the download or ten
 * minutes, whichever is first, and nothing is served from an open address:
 * the token is 32 random bytes as hex, only its hash is stored, and a wrong
 * or spent token gets no file.
 */

export const MEDIA_LINK_MINUTES = 10

const hash = (token: string) => createHash("sha256").update(token).digest("hex")

/** A link's token: 64 hex characters, nothing else is looked up. */
const TOKEN_SHAPE = /^[0-9a-f]{64}$/

/**
 * Makes a link to one bucket key and answers its full address. Links that
 * ran out more than a day ago are tidied on the way, so the table never
 * grows past a day's posts.
 */
export async function makeMediaLink(
  userId: string,
  file: { storagePath: string; mimeType: string },
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<string> {
  await db.delete(promoMediaLinks).where(lt(promoMediaLinks.expiresAt, new Date(now.getTime() - 86_400_000)))
  const token = randomBytes(32).toString("hex")
  await db.insert(promoMediaLinks).values({
    id: uuid(),
    userId,
    tokenHash: hash(token),
    storagePath: file.storagePath,
    mimeType: file.mimeType.slice(0, 255),
    expiresAt: new Date(now.getTime() + MEDIA_LINK_MINUTES * 60_000),
    createdAt: now,
  })
  return `${rackServerAddress().replace(/\/$/, "")}/api/media-link/${token}`
}

export type MediaLinkAnswer =
  | { status: 404 }
  | { status: 410 }
  | { status: 200; storagePath: string; mimeType: string }

/**
 * Spends a link: the first ask within ten minutes gets the file, and every
 * later one, or one too late, gets 410 Gone. Taking it is one statement, so
 * two asks at once cannot both get the file. A token not in the table is 404,
 * the same as a wrong one.
 */
export async function spendMediaLink(
  token: string,
  db: CustomShellDb = defaultDb,
  now: Date = new Date()
): Promise<MediaLinkAnswer> {
  if (!TOKEN_SHAPE.test(token)) return { status: 404 }
  const tokenHash = hash(token)
  const [spent] = await db
    .update(promoMediaLinks)
    .set({ usedAt: now })
    .where(and(eq(promoMediaLinks.tokenHash, tokenHash), isNull(promoMediaLinks.usedAt)))
    .returning({ storagePath: promoMediaLinks.storagePath, mimeType: promoMediaLinks.mimeType, expiresAt: promoMediaLinks.expiresAt })
  if (spent) {
    if (spent.expiresAt.getTime() > now.getTime()) return { status: 200, storagePath: spent.storagePath, mimeType: spent.mimeType }
    return { status: 410 }
  }
  const [known] = await db
    .select({ id: promoMediaLinks.id })
    .from(promoMediaLinks)
    .where(eq(promoMediaLinks.tokenHash, tokenHash))
    .limit(1)
  return { status: known ? 410 : 404 }
}

/** The HTTP answer for `/api/media-link/<token>`: the file once, then nothing. */
export async function mediaLinkResponse(token: string, db: CustomShellDb = defaultDb, now: Date = new Date()): Promise<Response> {
  const answer = await spendMediaLink(token, db, now)
  if (answer.status === 404) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } })
  if (answer.status === 410) {
    return new Response("This link was used or ran out. Post again from Promo for a new one.", {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    })
  }
  try {
    const object = await getFromR2(answer.storagePath)
    if (!object.Body) return new Response("The file is empty", { status: 502, headers: { "Cache-Control": "no-store" } })
    const headers = new Headers({
      "Cache-Control": "private, no-store",
      "Content-Type": object.ContentType || answer.mimeType || "application/octet-stream",
      "X-Content-Type-Options": "nosniff",
    })
    if (object.ContentLength !== undefined) headers.set("Content-Length", object.ContentLength.toString())
    const body = object.Body as { transformToWebStream?: () => ReadableStream }
    return new Response(body.transformToWebStream ? body.transformToWebStream() : (object.Body as unknown as BodyInit), { status: 200, headers })
  } catch {
    return new Response("The file could not be read", { status: 502, headers: { "Cache-Control": "no-store" } })
  }
}
