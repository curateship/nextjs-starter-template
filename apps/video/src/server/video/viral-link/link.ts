import { createHash, randomBytes, timingSafeEqual } from "node:crypto"

import { eq } from "drizzle-orm"
import { z } from "zod"

import { decryptSecret, encryptSecret } from "@/server/auth/encryption"
import { enforceRateLimit, RateLimitError } from "@/server/auth/rate-limit"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { videoViralLinks, type VideoViralLinkRow } from "@/server/video/schema"

/**
 * The link between Video and the Viral app (`workspace/docs/viral-connection.md`).
 *
 * Video makes one key per admin on Settings → Viral, and that admin pastes it
 * into Viral's Settings → Video connection with this Video's address. Every
 * call either way carries it as `Authorization: Bearer <key>`. Video keeps the
 * key's hash to find who is calling, and the key scrambled so Copy can show
 * it again and so Video can call Viral back with it. Making a new key ends
 * the old one at once. Copied from Promo's side of Send to Promo
 * (`apps/promo/src/server/archive/video-link.ts`).
 */

/** "vv_" and 32 random bytes, so a key in a log or a paste is easy to recognise. */
const KEY_SHAPE = /^vv_[A-Za-z0-9_-]{43}$/

const hashKey = (key: string) => createHash("sha256").update(key, "utf8").digest("hex")

/** Makes a new key for this admin, ending any old one, and answers it. */
export async function makeViralKey(userId: string, db: CustomShellDb = defaultDb): Promise<string> {
  const key = `vv_${randomBytes(32).toString("base64url")}`
  const values = { keyHash: hashKey(key), keySecret: encryptSecret(key), lastUsedAt: null }
  await db
    .insert(videoViralLinks)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: videoViralLinks.userId, set: values })
  return key
}

export type ViralKeyView = {
  /** The key to copy, or null when none was made yet. */
  key: string | null
  /** The Viral address that last pressed Test, or "". */
  viralUrl: string
  lastUsedAt: string | null
}

/** This admin's key and the Viral address it last answered, for Settings → Viral. */
export async function readViralKey(userId: string, db: CustomShellDb = defaultDb): Promise<ViralKeyView> {
  const [link] = await db.select().from(videoViralLinks).where(eq(videoViralLinks.userId, userId)).limit(1)
  if (!link) return { key: null, viralUrl: "", lastUsedAt: null }
  return { key: decryptSecret(link.keySecret), viralUrl: link.viralUrl, lastUsedAt: link.lastUsedAt?.toISOString() ?? null }
}

/** The Viral address and the key, to fetch a file from Viral with. Throws when either is missing. */
export async function readViralSecret(userId: string, db: CustomShellDb = defaultDb): Promise<{ viralUrl: string; key: string }> {
  const [link] = await db.select().from(videoViralLinks).where(eq(videoViralLinks.userId, userId)).limit(1)
  if (!link) throw new Error("The key on Settings → Viral is gone, so the video can't be fetched.")
  if (!link.viralUrl) throw new Error("Press Test on Viral's Settings → Video connection first, so Video knows where Viral is.")
  return { viralUrl: link.viralUrl, key: decryptSecret(link.keySecret) }
}

/**
 * The link the request's key belongs to, or null for no key, a wrong one, or
 * a key whose admin is no longer an active admin.
 */
export async function findViralCaller(request: Request, db: CustomShellDb = defaultDb): Promise<VideoViralLinkRow | null> {
  const header = request.headers.get("authorization") ?? ""
  const key = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!KEY_SHAPE.test(key)) return null
  const hash = hashKey(key)
  const [found] = await db
    .select({ link: videoViralLinks, role: customShellUsers.role, status: customShellUsers.status })
    .from(videoViralLinks)
    .innerJoin(customShellUsers, eq(customShellUsers.id, videoViralLinks.userId))
    .where(eq(videoViralLinks.keyHash, hash))
    .limit(1)
  if (!found || found.role !== "admin" || found.status !== "active") return null
  // The lookup is by hash; this compare only makes sure nothing about the
  // match can be timed.
  const stored = Buffer.from(found.link.keyHash)
  const given = Buffer.from(hash)
  return stored.length === given.length && timingSafeEqual(stored, given) ? found.link : null
}

/**
 * A Viral address as Video keeps it: http or https, no query, no trailing
 * slash. Plain http only off the live server. Anything else is refused.
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

/** Keeps the Viral address that pressed Test, the only one files are fetched from. */
export async function rememberViralUrl(userId: string, viralUrl: string, db: CustomShellDb = defaultDb, now = new Date()) {
  await db.update(videoViralLinks).set({ viralUrl, lastUsedAt: now }).where(eq(videoViralLinks.userId, userId))
}

export class ViralLinkRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/** A message from Viral holds a script and notes; 200,000 characters is far past one. */
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
  work: (link: VideoViralLinkRow, data: z.infer<Shape>) => Promise<unknown>,
  db: CustomShellDb = defaultDb
): Promise<Response> {
  if (Number(request.headers.get("content-length") ?? 0) > MAX_BODY_CHARS) {
    return answer(413, { error: "This message is too large." })
  }
  let link: VideoViralLinkRow | null
  try {
    link = await findViralCaller(request, db)
  } catch (error) {
    console.error("A Viral message could not be checked", error)
    return answer(503, { error: "Video could not check this message. Try again shortly." })
  }
  if (!link) return answer(401, { error: "Video does not know this key." })

  try {
    // Sends and Tests are one or two a send, so 600 an hour is far past real
    // use. Asking how a send is doing has its own, higher limit, so a long
    // copy being watched can never use up the sends.
    const asking = request.method === "GET"
    await enforceRateLimit(
      `video-viral:${asking ? "read" : "write"}:${link.userId}`,
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
    if (!checked.success) return answer(400, { error: "This message is not in a shape Video knows." })
    parsed = checked.data
  }

  try {
    return answer(200, (await work(link, parsed as z.infer<Shape>)) ?? {})
  } catch (error) {
    if (error instanceof ViralLinkRefusal) return answer(error.status, { error: error.message })
    console.error("A Viral message failed", error)
    return answer(500, { error: "Video could not do that. It is in the server's log." })
  }
}

/** How long Video waits for Viral to answer a call back. */
const CALL_TIMEOUT_MS = 10_000

/**
 * Tells Viral something: a send's file arrived, or its copy failed. The key
 * is the admin's own, read fresh, so a new key takes over at once.
 */
export async function callViral(
  userId: string,
  path: string,
  body: unknown,
  { db = defaultDb, fetchImpl = fetch }: { db?: CustomShellDb; fetchImpl?: typeof fetch } = {}
): Promise<unknown> {
  const [link] = await db.select().from(videoViralLinks).where(eq(videoViralLinks.userId, userId)).limit(1)
  if (!link) throw new Error("Make a key on Settings → Viral and paste it into Viral first.")
  if (!link.viralUrl) throw new Error("Press Test on Viral's Settings → Video connection first, so Video knows where Viral is.")
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
    throw new Error(typeof reply.error === "string" ? reply.error : `Viral answered ${response.status}.`)
  }
  return reply
}
