import { createHash, timingSafeEqual } from "node:crypto"

import type { PromoProjectOption } from "@/lib/video/promo"
import { appUrl } from "@/server/app-url"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { getPromoApiKey, getPromoUrl } from "@/server/video/settings"

/**
 * The link from Video to the Promo app (`workspace/docs/send-to-promo.md`).
 * Promo makes the key on its Settings → Video; it is pasted into Video's
 * Settings → Promo with Promo's address. Every call either way carries the
 * key as `Authorization: Bearer <key>`.
 */

export const PROMO_NOT_SET_MESSAGE = "Fill in Promo's address and key on Settings → Promo first."

/** How long Video waits for Promo to answer. */
const CALL_TIMEOUT_MS = 15_000

/** Promo's address as Video keeps it: http or https, no query, no trailing slash. Null when it is not one. */
export function cleanPromoUrl(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return ""
  let url: URL
  try {
    url = new URL(trimmed)
  } catch {
    return null
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null
  if (url.username || url.password) return null
  return `${url.origin}${url.pathname.replace(/\/+$/, "")}`
}

export type PromoConnection = { url: string; key: string }

/** Promo's address and key, or a plain refusal naming what to fill in. */
export async function readPromoConnection(db: CustomShellDb = defaultDb): Promise<PromoConnection> {
  const [url, key] = await Promise.all([getPromoUrl(db), getPromoApiKey(db)])
  if (!url || !key) throw new Error(PROMO_NOT_SET_MESSAGE)
  return { url, key }
}

export class PromoRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * One call to Promo. Answers its JSON, or throws a `PromoRefusal` with
 * Promo's own words, or a plain message when Promo can't be reached.
 */
export async function callPromo<Answer>(
  connection: PromoConnection,
  path: string,
  body?: unknown,
  fetchImpl: typeof fetch = fetch
): Promise<Answer> {
  const response = await fetchImpl(`${connection.url}${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: `Bearer ${connection.key}`,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    redirect: "error",
    signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
  }).catch(() => {
    throw new PromoRefusal(0, "Promo couldn't be reached. Check its address and that it's running.")
  })
  const reply = (await response.json().catch(() => ({}))) as { error?: unknown }
  if (!response.ok) {
    if (response.status === 401) throw new PromoRefusal(401, "Promo turned the key down. Make a new one on Promo's Settings → Video and paste it here.")
    throw new PromoRefusal(response.status, typeof reply.error === "string" ? reply.error : `Promo answered ${response.status}.`)
  }
  return reply as Answer
}

/** This Video's own address, which Promo fetches files from and calls back. */
export function videoAddress(): string {
  return appUrl().replace(/\/+$/, "")
}

/**
 * Test on Settings → Promo: tells Promo where this Video is, and answers
 * whose Promo it is and how many projects it has.
 */
export async function helloPromo(
  connection: PromoConnection,
  fetchImpl: typeof fetch = fetch
): Promise<{ name: string; projects: PromoProjectOption[] }> {
  return callPromo(connection, "/api/connect/video/hello", { videoUrl: videoAddress() }, fetchImpl)
}

/** The Promo projects the send window lists. */
export async function listPromoProjects(
  connection: PromoConnection,
  fetchImpl: typeof fetch = fetch
): Promise<PromoProjectOption[]> {
  const answer = await callPromo<{ projects: PromoProjectOption[] }>(connection, "/api/connect/video/projects", undefined, fetchImpl)
  return answer.projects
}

const hashed = (value: string) => createHash("sha256").update(value, "utf8").digest()

/** Whether a call to Video carries the key saved on Settings → Promo. */
export async function isPromoCaller(request: Request, db: CustomShellDb = defaultDb): Promise<boolean> {
  const header = request.headers.get("authorization") ?? ""
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!given) return false
  let saved: string | null
  try {
    saved = await getPromoApiKey(db)
  } catch {
    return false
  }
  if (!saved) return false
  return timingSafeEqual(hashed(given), hashed(saved))
}
