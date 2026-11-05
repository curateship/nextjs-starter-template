import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { eq } from "drizzle-orm"
import type { z } from "zod"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { db as defaultDb, type CustomShellDb } from "@/server/db"

import { promoViralLinks, type PromoViralLinkRow } from "./schema"

/**
 * The link between Promo and the Viral app (`workspace/docs/viral-link.md`),
 * copied from the link with Video (`../archive/video-link.ts`).
 *
 * Promo makes one key per person on Settings → Viral, and that person pastes
 * it into Viral's Settings → Promo connection. Every call either way carries
 * it as `Authorization: Bearer <key>`. Promo keeps the key's hash to find who
 * is calling, and the key scrambled so Copy can show it again and so Promo
 * can call Viral back. Making a new key ends the old one at once.
 */

/** "pvr_" and 32 random bytes, so a key in a log or a paste is easy to recognise. */
const KEY_SHAPE = /^pvr_[A-Za-z0-9_-]{43}$/

const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex")

/** Makes a new key for this person, ending any old one, and answers it. */
export async function makeViralKey(userId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const key = `pvr_${randomBytes(32).toString("base64url")}`
  const values = { keyHash: hashKey(key), keySecret: encryptSecret(key), lastUsedAt: null }
  await db
    .insert(promoViralLinks)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: promoViralLinks.userId, set: values })
  return key
}

export type ViralKeyView = {
  /** The key to copy, or null when none was made yet. */
  key: string | null
  /** The Viral address that last pressed Test, or "". */
  viralUrl: string
  lastUsedAt: string | null
}

/** This person's key and the Viral address it last answered, for Settings → Viral. */
export async function readViralKey(userId: string, db: CustomShellDb = defaultDb): Promise<ViralKeyView> {
  const [link] = await db.select().from(promoViralLinks).where(eq(promoViralLinks.userId, userId)).limit(1)
  if (!link) return { key: null, viralUrl: "", lastUsedAt: null }
  return { key: decryptSecret(link.keySecret), viralUrl: link.viralUrl, lastUsedAt: link.lastUsedAt?.toISOString() ?? null }
}

/** The link the request's key belongs to, or null for no key or a wrong one. */
export async function findViralCaller(request: Request, db: CustomShellDb = defaultDb): Promise<PromoViralLinkRow | null> {
  const header = request.headers.get("authorization") ?? ""
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!KEY_SHAPE.test(key)) return null
  const hash = hashKey(key)
  const [link] = await db.select().from(promoViralLinks).where(eq(promoViralLinks.keyHash, hash)).limit(1)
  if (!link) return null
  // The lookup is by hash; this compare only makes sure nothing about the
  // match can be timed.
  const stored = Buffer.from(link.keyHash)
  const given = Buffer.from(hash)
  return stored.length === given.length && timingSafeEqual(stored, given) ? link : null
}

/**
 * A Viral address as Promo keeps it: http or https, no query, no trailing
 * slash, and https on the live server. Anything else is refused.
 */
export function cleanViralUrl(raw: string): string | null {
  let url: URL
  try {
    url = new URL(raw.trim())
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.protocol === "http:" && process.env.NODE_ENV === "production") return null
  if (url.username || url.password) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

/** Keeps the Viral address that pressed Test, the only one Promo calls back. */
export async function rememberViralUrl(userId: string, viralUrl: string, db: CustomShellDb = defaultDb, now = new Date()) {
  await db.update(promoViralLinks).set({ viralUrl, lastUsedAt: now }).where(eq(promoViralLinks.userId, userId))
}

/** Viral answered a call back and said no; `status` is its answer, such as 400. */
export class ViralSaidNo extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export class ViralLinkRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A message from Viral is a post or two of words, never more than this. */
const MAX_BODY_CHARS = 200_000

const NEVER_CACHE = { "cache-control": "no-store" }

function answer(status: number, value: unknown): Response {
  return Response.json(value, { status, headers: NEVER_CACHE })
}

/**
 * The one way every `/api/connect/viral/*` address answers: the key first,
 * then the body's shape, then the work. A wrong key gets 401 with nothing
 * about why.
 */
export async function answerViral<Shape extends z.ZodType>(
  request: Request,
  shape: Shape | null,
  work: (link: PromoViralLinkRow, data: z.infer<Shape>) => Promise<unknown>,
  db: CustomShellDb = defaultDb
): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return answer(413, { error: "This message is too large." })
  }
  let link: PromoViralLinkRow | null
  try {
    link = await findViralCaller(request, db)
  } catch (error) {
    console.error("A Viral message could not be checked", error)
    return answer(503, { error: "Promo could not check this message. Try again shortly." })
  }
  if (!link) return answer(401, { error: "Promo does not know this key." })

  try {
    // A read or a post is a press of a button in Viral, so 600 an hour is far
    // past real use. Asking how things stand has its own, higher limit.
    const asking = request.method === "GET"
    await enforceRateLimit(
      `promo-viral:${asking ? "read" : "write"}:${link.userId}`,
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
    if (error instanceof ViralLinkRefusal) return answer(error.status, { error: error.message })
    console.error("A Viral message failed", error)
    return answer(500, { error: "Promo could not do that. It is in the server's log." })
  }
}

/** How long Promo waits for Viral to answer a call back. */
const CALL_TIMEOUT_MS = 10_000

/**
 * Tells Viral something: a read's answer, or a post that went out. Answers
 * Viral's reply, or throws a plain message. The key is this person's own,
 * read fresh, so a new key takes over at once. Only the Viral address that
 * pressed Test is ever called.
 */
export async function callViral(
  userId: string,
  path: string,
  body: unknown,
  { db = defaultDb, fetchImpl = fetch }: { db?: CustomShellDb; fetchImpl?: typeof fetch } = {}
): Promise<unknown> {
  const [link] = await db.select().from(promoViralLinks).where(eq(promoViralLinks.userId, userId)).limit(1)
  if (!link) throw new Error("Make a key on Settings → Viral and paste it into Viral first.")
  if (!link.viralUrl) throw new Error("Press Test on Viral's Settings → Promo connection first, so Promo knows where Viral is.")
  const response = await fetchImpl(`${link.viralUrl}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${decryptSecret(link.keySecret)}`, "content-type": "application/json" },
    body: JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {
    throw new Error("Viral could not be reached. Check Viral is running at the address it was tested from.")
  })
  const reply = (await response.json().catch(() => ({}))) as { error?: unknown }
  if (!response.ok) {
    throw new ViralSaidNo(response.status, typeof reply.error === "string" ? reply.error : `Viral answered ${response.status}.`)
  }
  return reply
}
