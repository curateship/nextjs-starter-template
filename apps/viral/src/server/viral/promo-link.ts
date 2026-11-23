import { getPromoApiKey, getPromoKeyOwnerId, getPromoUrl } from "@/server/viral/settings"
import { keyCallerOwnerId, viralAddress } from "@/server/viral/video-link"

/**
 * The link from Viral to the Promo app (`workspace/docs/promo-connection.md`).
 * Promo makes the key on its Settings → Viral; it is pasted into Viral's
 * Settings → Promo connection with Promo's address. Every call either way
 * carries the key as `Authorization: Bearer <key>`, the same as the link to
 * Video (`video-link.ts`).
 */

export const PROMO_NOT_SET_MESSAGE = "Fill in Promo's address and key on Settings → Promo connection first."

/** How long Viral waits for Promo to answer. */
const CALL_TIMEOUT_MS = 15_000

export type PromoConnection = { url: string; key: string }

/** Promo's address and key, or a plain refusal naming what to fill in. */
export async function readPromoConnection(): Promise<PromoConnection> {
  const [url, key] = await Promise.all([getPromoUrl(), getPromoApiKey()])
  if (!url || !key) throw new PromoRefusal(0, PROMO_NOT_SET_MESSAGE)
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
 * Promo's own words, or a plain message when Promo can't be reached. Only the
 * saved Promo address is ever called.
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
    if (response.status === 401) {
      throw new PromoRefusal(401, "Promo turned the key down. Make a new one on Promo's Settings → Viral and paste it here.")
    }
    throw new PromoRefusal(response.status, typeof reply.error === "string" ? reply.error : `Promo answered ${response.status}.`)
  }
  return reply as Answer
}

export type PromoProjectOption = { id: string; name: string; networks: string[] }

/**
 * Test on Settings → Promo connection: tells Promo where this Viral is, the
 * only address it calls back, and answers whose Promo it is.
 */
export async function helloPromo(
  connection: PromoConnection,
  fetchImpl: typeof fetch = fetch
): Promise<{ name: string; projects: PromoProjectOption[] }> {
  return callPromo(connection, "/api/connect/viral/hello", { viralUrl: viralAddress() }, fetchImpl)
}

/** The Promo projects Write a post for Promo lists: the key's admin's own. */
export async function listPromoProjects(fetchImpl: typeof fetch = fetch): Promise<PromoProjectOption[]> {
  const answer = await callPromo<{ projects: PromoProjectOption[] }>(
    await readPromoConnection(),
    "/api/connect/viral/projects",
    undefined,
    fetchImpl
  )
  return answer.projects
}

/**
 * Who a call to Viral acts for: the person who saved the key on Settings →
 * Promo connection, when the call carries that key. Null refuses the call,
 * including for a key saved before its owner was kept.
 */
export function promoCallerOwnerId(request: Request): Promise<string | null> {
  return keyCallerOwnerId(request, getPromoApiKey, getPromoKeyOwnerId)
}

/** Whether a link Promo answered with lives on the saved Promo address. Any other is dropped. */
export function onPromoAddress(promoUrl: string, link: string): boolean {
  if (!promoUrl) return false
  try {
    const url = new URL(link)
    return (url.protocol === "https:" || url.protocol === "http:") && url.origin === new URL(promoUrl).origin
  } catch {
    return false
  }
}
