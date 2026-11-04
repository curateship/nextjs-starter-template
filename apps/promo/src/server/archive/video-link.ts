import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoVideoLinks, type PromoVideoLinkRow } from "./schema"

/**
 * The link between Promo and the Video app (`workspace/docs/archive.md`).
 *
 * Promo makes one key per person on Settings → Video, and that person pastes
 * it into Video's Settings → Promo. Every call either way carries it as
 * `Authorization: Bearer <key>`. Promo keeps the key's hash to find who is
 * calling, and the key scrambled so Copy can show it again and so Promo can
 * call Video back with it. Making a new key ends the old one at once.
 */

/** "pv_" and 32 random bytes, so a key in a log or a paste is easy to recognise. */
const KEY_SHAPE = /^pv_[A-Za-z0-9_-]{43}$/

const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex")

/** Makes a new key for this person, ending any old one, and answers it. */
export async function makeVideoKey(userId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const key = `pv_${randomBytes(32).toString("base64url")}`
  const values = { keyHash: hashKey(key), keySecret: encryptSecret(key), lastUsedAt: null }
  await db
    .insert(promoVideoLinks)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoVideoLinks.userId, set: values })
  return key
}

export type VideoKeyView = {
  /** The key to copy, or null when none was made yet. */
  key: string | null
  /** The Video address that last pressed Test, or "". */
  videoUrl: string
  lastUsedAt: string | null
}

/** This person's key and the Video address it last answered, for Settings → Video. */
export async function readVideoKey(userId: string, db: CustomShellDb = defaultDb): Promise<VideoKeyView> {
  const [link] = await db.select().from(promoVideoLinks).where(eq(promoVideoLinks.userId, userId)).limit(1)
  if (!link) return { key: null, videoUrl: "", lastUsedAt: null }
  return { key: decryptSecret(link.keySecret), videoUrl: link.videoUrl, lastUsedAt: link.lastUsedAt?.toISOString() ?? null }
}

/** The link the request's key belongs to, or null for no key or a wrong one. */
export async function findVideoCaller(request: Request, db: CustomShellDb = defaultDb): Promise<PromoVideoLinkRow | null> {
  const header = request.headers.get("authorization") ?? ""
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!KEY_SHAPE.test(key)) return null
  const hash = hashKey(key)
  const [link] = await db.select().from(promoVideoLinks).where(eq(promoVideoLinks.keyHash, hash)).limit(1)
  if (!link) return null
  // The lookup is by hash; this compare only makes sure nothing about the
  // match can be timed.
  const stored = Buffer.from(link.keyHash)
  const given = Buffer.from(hash)
  return stored.length === given.length && timingSafeEqual(stored, given) ? link : null
}

/**
 * A Video address as Promo keeps it: http or https, no query, no trailing
 * slash. Anything else is refused.
 */
export function cleanVideoUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  // The live server fetches files only over https; plain http is for two
  // apps on one computer.
  if (url.protocol === "http:" && process.env.NODE_ENV === "production") return null
  if (url.username || url.password) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

/** Keeps the Video address that pressed Test, the only one files are fetched from. */
export async function rememberVideoUrl(userId: string, videoUrl: string, db: CustomShellDb = defaultDb, now = new Date()) {
  await db.update(promoVideoLinks).set({ videoUrl, lastUsedAt: now }).where(eq(promoVideoLinks.userId, userId))
}

/** Whether a file address Video sent lives on the Video address this link knows. */
export function onVideoAddress(link: Pick<PromoVideoLinkRow, "videoUrl">, fileUrl: string): boolean {
  if (!link.videoUrl) return false
  try {
    return new URL(fileUrl).origin === new URL(link.videoUrl).origin
  } catch {
    return false
  }
}

export class VideoLinkRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A message from Video is a few kilobytes; subtitles for a long video are the biggest part. */
const MAX_BODY_CHARS = 2_000_000

const NEVER_CACHE = { "cache-control": "no-store" }

function answer(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: NEVER_CACHE })
}

/**
 * The one way every `/api/connect/video/*` address answers: the key first,
 * then the body's shape, then the work. A wrong key gets 401 with nothing
 * about why.
 */
export async function answerVideo<Shape extends z.ZodType>(
  request: Request,
  shape: Shape | null,
  work: (link: PromoVideoLinkRow, data: z.infer<Shape>) => Promise<unknown>,
  db: CustomShellDb = defaultDb
): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return answer(413, { error: "This message is too large." })
  }
  let link: PromoVideoLinkRow | null
  try {
    link = await findVideoCaller(request, db)
  } catch (error) {
    console.error("A Video message could not be checked", error)
    return answer(503, { error: "Promo could not check this message. Try again shortly." })
  }
  if (!link) return answer(401, { error: "Promo does not know this key." })

  try {
    // Sends and Tests are a few a send, so 600 an hour is far past real use.
    // Asking how a send is doing has its own, higher limit, so a long copy
    // being watched can never use up the sends.
    const asking = request.method === "GET"
    await enforceRateLimit(
      `promo-video:${asking ? "read" : "write"}:${link.userId}`,
      { maxAttempts: asking ? 6_000 : 600, windowSeconds: 3600 },
      db
    )
  } catch (error) {
    if (error instanceof RateLimitError) return answer(429, { error: "Too many messages. Try again in an hour." })
    throw error
  }

  let parsed: unknown = {}
  if (shape) {
    const body = await request.text()
    if (body.length > MAX_BODY_CHARS) return answer(413, { error: "This message is too large." })
    try {
      parsed = body ? JSON.parse(body) : {}
    } catch {
      return answer(400, { error: "This message is not JSON." })
    }
    const checked = shape.safeParse(parsed)
    if (!checked.success) return answer(400, { error: "This message is not in a shape Promo knows." })
    parsed = checked.data
  }

  try {
    return answer(200, (await work(link, parsed as z.infer<Shape>)) ?? {})
  } catch (error) {
    if (error instanceof VideoLinkRefusal) return answer(error.status, { error: error.message })
    console.error("A Video message failed", error)
    return answer(500, { error: "Promo could not do that. It is in the server's log." })
  }
}

/** How long Promo waits for Video to answer a call back. */
const CALL_TIMEOUT_MS = 10_000

/**
 * Tells Video something: a send arrived or failed, a post went out, a video
 * was asked for. Answers Video's reply, or throws a plain message. The key is
 * this person's own, read fresh, so a new key takes over at once.
 */
export async function callVideo(
  userId: string,
  path: string,
  body: unknown,
  {
    db = defaultDb,
    fetchImpl = fetch,
  }: { db?: CustomShellDb; fetchImpl?: typeof fetch } = {}
): Promise<unknown> {
  const [link] = await db.select().from(promoVideoLinks).where(eq(promoVideoLinks.userId, userId)).limit(1)
  if (!link) throw new Error("Make a key on Settings → Video and paste it into Video first.")
  if (!link.videoUrl) throw new Error("Press Test on Video's Settings → Promo first, so Promo knows where Video is.")
  const response = await fetchImpl(`${link.videoUrl}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${decryptSecret(link.keySecret)}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {
    throw new Error("Video could not be reached. Check Video is running at the address it was tested from.")
  })
  const reply = (await response.json().catch(() => ({}))) as { error?: unknown }
  if (!response.ok) {
    throw new Error(typeof reply.error === "string" ? reply.error : `Video answered ${response.status}.`)
  }
  return reply
}
