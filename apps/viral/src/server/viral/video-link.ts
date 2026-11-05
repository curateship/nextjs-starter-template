import { createHash, timingSafeEqual } from "node:crypto"

import { appUrl } from "@/server/app-url"
import { getVideoApiKey, getVideoUrl } from "@/server/viral/settings"

/**
 * The link from Viral to the Video app (`workspace/docs/send-to-video.md`).
 * Video makes the key on its Settings → Viral; it is pasted into Viral's
 * Settings → Video connection with Video's address. Every call either way
 * carries the key as `Authorization: Bearer <key>`, copied from Video's own
 * link to Promo (`apps/video/src/server/video/promo-link.ts`).
 */

export const VIDEO_NOT_SET_MESSAGE = "Fill in Video's address and key on Settings → Video connection first."

/** How long Viral waits for Video to answer. */
const CALL_TIMEOUT_MS = 15_000

/** Video's address as Viral keeps it: http or https, no query, no trailing slash. Null when it is not one. */
export function cleanVideoUrl(raw: string): string | null {
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

export type VideoConnection = { url: string; key: string }

/** Video's address and key, or a plain refusal naming what to fill in. */
export async function readVideoConnection(): Promise<VideoConnection> {
  const [url, key] = await Promise.all([getVideoUrl(), getVideoApiKey()])
  if (!url || !key) throw new VideoRefusal(0, VIDEO_NOT_SET_MESSAGE)
  return { url, key }
}

export class VideoRefusal extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

/**
 * One call to Video. Answers its JSON, or throws a `VideoRefusal` with
 * Video's own words, or a plain message when Video can't be reached.
 */
export async function callVideo<Answer>(
  connection: VideoConnection,
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
    throw new VideoRefusal(0, "Video couldn't be reached. Check its address and that it's running.")
  })
  const reply = (await response.json().catch(() => ({}))) as { error?: unknown }
  if (!response.ok) {
    if (response.status === 401) {
      throw new VideoRefusal(401, "Video turned the key down. Make a new one on Video's Settings → Viral and paste it here.")
    }
    throw new VideoRefusal(response.status, typeof reply.error === "string" ? reply.error : `Video answered ${response.status}.`)
  }
  return reply as Answer
}

/** This Viral's own address, which Video fetches files from and calls back. */
export function viralAddress(): string {
  return appUrl().replace(/\/+$/, "")
}

export type VideoProjectOption = { id: string; name: string }

/**
 * Test on Settings → Video connection: tells Video where this Viral is, the
 * only address it will fetch files from, and answers whose Video it is.
 */
export async function helloVideo(
  connection: VideoConnection,
  fetchImpl: typeof fetch = fetch
): Promise<{ name: string; projects: VideoProjectOption[] }> {
  return callVideo(connection, "/api/connect/viral/hello", { viralUrl: viralAddress() }, fetchImpl)
}

/** The Video projects the Send to Video picker lists: the key's admin's own. */
export async function listVideoProjects(fetchImpl: typeof fetch = fetch): Promise<VideoProjectOption[]> {
  const answer = await callVideo<{ projects: VideoProjectOption[] }>(
    await readVideoConnection(),
    "/api/connect/viral/projects",
    undefined,
    fetchImpl
  )
  return answer.projects
}

const hashed = (value: string) => createHash("sha256").update(value, "utf8").digest()

/** Whether a call to Viral carries the key saved on Settings → Video connection. */
export async function isVideoCaller(request: Request): Promise<boolean> {
  const header = request.headers.get("authorization") ?? ""
  const given = header.startsWith("Bearer ") ? header.slice(7).trim() : ""
  if (!given) return false
  let saved: string | null
  try {
    saved = await getVideoApiKey()
  } catch {
    return false
  }
  if (!saved) return false
  return timingSafeEqual(hashed(given), hashed(saved))
}
