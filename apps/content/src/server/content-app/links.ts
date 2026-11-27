import { and, asc, eq } from "drizzle-orm"

import { appUrl } from "@/server/app-url"
import { decryptSecret } from "@/server/auth/encryption"
import type { LinkSide } from "@/server/content-app/link-routes"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"

/**
 * The links between Video, Promo and Viral inside Content
 * (`workspace/docs/content-app.md`, "The links between Video, Promo and
 * Viral"; task Part 4).
 *
 * The three apps passed work to each other over the web, each with the
 * other's address and a key typed into Settings. In Content nothing is typed
 * and nothing leaves the app:
 *
 * - **Each part's address** is Content's own, under `/content-link/<part>`
 *   (`linkAddress`). The router never serves that path; it only names which
 *   part a call is for.
 * - **A call to one** is handed to that part's function in this process by
 *   `linkFetch`, never sent over the network (`link-routes.ts`). So are the
 *   files one part fetches from another, at Content's own address.
 * - **The keys** are made by Content for the app's owner, the first admin, and
 *   saved where each side kept them (`ensureContentLinks`). Every key check
 *   the three apps made still runs, with nothing for a person to set up.
 */

export const LINK_PREFIX = "/content-link"

function ownAddress(): string {
  return appUrl().replace(/\/+$/, "")
}

/** Where one part of Content answers the others: Content's own address under `/content-link/<part>`. */
export function linkAddress(side: LinkSide): string {
  return `${ownAddress()}${LINK_PREFIX}/${side}`
}

/**
 * Whether an address is one of Content's own parts, or a file one part hands
 * another at Content's own address. Such an address is called though it isn't
 * public, because the call never leaves the app.
 */
export function isLinkAddress(address: string): boolean {
  try {
    return linkTarget(new URL(address)) !== null
  } catch {
    return false
  }
}

/**
 * Which part a call is for, and the path that part answers, for an address at
 * Content's own origin only: one under `/content-link/<part>/`, or a file
 * address that one part hands another (Video's file for Promo, Viral's file
 * for Video). Any other site's address is not a part, whatever its path.
 */
export function linkTarget(url: URL): { side: LinkSide; path: string } | null {
  let own: string
  try {
    own = new URL(ownAddress()).origin
  } catch {
    return null
  }
  if (url.origin !== own) return null
  const named = /^\/content-link\/(promo|video|viral)(\/.*)?$/.exec(url.pathname)
  if (named) return { side: named[1] as LinkSide, path: named[2] ?? "/" }
  if (url.pathname.startsWith("/api/connect/promo/file/")) return { side: "video", path: url.pathname }
  if (url.pathname.startsWith("/api/connect/video/file/")) return { side: "viral", path: url.pathname }
  return null
}

/**
 * `fetch`, with a call to one of Content's parts answered in this process. Any
 * other address goes out as before, so a link to an outside app still works.
 */
export const linkFetch: typeof fetch = async (input, init) => {
  const target = linkTarget(new URL(input instanceof Request ? input.url : String(input)))
  // Handed on exactly as it came, so the call is the one it always was.
  if (!target) return fetch(input, init)
  const request = new Request(input, init)
  // Imported here: the parts' code imports this file, so a top-level import would loop.
  const { findLinkRoute } = await import("@/server/content-app/link-routes")
  const route = findLinkRoute(target.side, request.method, target.path)
  if (!route) return Response.json({ error: "This part of Content does not answer that." }, { status: 404 })
  // The handlers read the address's query, so they are handed the request at the path they answer.
  const url = new URL(request.url)
  url.pathname = target.path
  return route.handle(new Request(url, request), route.params)
}

/** The app's owner: the first admin, whose projects the links work for. */
async function ownerId(database: CustomShellDb): Promise<string | null> {
  const [owner] = await database
    .select({ id: customShellUsers.id })
    .from(customShellUsers)
    .where(and(eq(customShellUsers.role, "admin")))
    .orderBy(asc(customShellUsers.createdAt))
    .limit(1)
  return owner?.id ?? null
}

/**
 * Sets up the three links for the owner when they aren't, or when Content's
 * address changed since: Video to Promo (Send to Promo, and Promo asking
 * Video for a video), Viral to Video (Send to Video), and Viral to Promo
 * (Research's reads of X, LinkedIn and Reddit, and Write a post for Promo).
 * Each side's key is made by the side that checks it and saved where the
 * calling side kept the one a person used to paste. It runs where a person
 * starts something across two parts (Send to Promo, Send to Video, Research's
 * reads and posts, Promo asking for a video), not in the answers that follow,
 * which find the link already set up. A link that is set up is read and left
 * alone.
 */
export async function ensureContentLinks(database: CustomShellDb = defaultDb): Promise<void> {
  const owner = await ownerId(database)
  if (!owner) return
  // One after another: the database handle in tests is a single connection.
  await videoToPromo(owner, database)
  await viralToVideo(owner, database)
  await viralToPromo(owner, database)
}

async function videoToPromo(owner: string, database: CustomShellDb) {
  const video = await import("@/server/video/settings")
  const archive = await import("@/server/archive/video-link")
  const { promoVideoLinks } = await import("@/server/archive/schema")
  const [key, url, link] = await Promise.all([
    video.getPromoApiKey(database),
    video.getPromoUrl(database),
    database.select().from(promoVideoLinks).where(eq(promoVideoLinks.userId, owner)).limit(1),
  ])
  const promoUrl = linkAddress("promo")
  const videoUrl = linkAddress("video")
  const row = link[0]
  if (key && url === promoUrl && row && row.videoUrl === videoUrl && decryptSecret(row.keySecret) === key) return
  const made = await archive.makeVideoKey(owner, database)
  await video.savePromoApiKey(made, database)
  await video.savePromoUrl(promoUrl, database)
  await archive.rememberVideoUrl(owner, videoUrl, database)
}

async function viralToVideo(owner: string, database: CustomShellDb) {
  const viral = await import("@/server/viral/settings")
  const videoLink = await import("@/server/video/viral-link/link")
  const { videoViralLinks } = await import("@/server/video/schema")
  const [key, keyOwner, url, link] = await Promise.all([
    viral.getVideoApiKey(database),
    viral.getVideoKeyOwnerId(database),
    viral.getVideoUrl(database),
    database.select().from(videoViralLinks).where(eq(videoViralLinks.userId, owner)).limit(1),
  ])
  const videoUrl = linkAddress("video")
  const viralUrl = linkAddress("viral")
  const row = link[0]
  if (key && keyOwner === owner && url === videoUrl && row && row.viralUrl === viralUrl && decryptSecret(row.keySecret) === key) return
  const made = await videoLink.makeViralKey(owner, database)
  await viral.saveVideoApiKey(made, owner, database)
  await viral.saveVideoUrl(videoUrl, database)
  await videoLink.rememberViralUrl(owner, viralUrl, database)
}

async function viralToPromo(owner: string, database: CustomShellDb) {
  const viral = await import("@/server/viral/settings")
  const promoLink = await import("@/server/viral-link/link")
  const { promoViralLinks } = await import("@/server/viral-link/schema")
  const [key, keyOwner, url, link] = await Promise.all([
    viral.getPromoApiKey(database),
    viral.getPromoKeyOwnerId(database),
    viral.getPromoUrl(database),
    database.select().from(promoViralLinks).where(eq(promoViralLinks.userId, owner)).limit(1),
  ])
  const promoUrl = linkAddress("promo")
  const viralUrl = linkAddress("viral")
  const row = link[0]
  if (key && keyOwner === owner && url === promoUrl && row && row.viralUrl === viralUrl && decryptSecret(row.keySecret) === key) return
  const made = await promoLink.makeViralKey(owner, database)
  await viral.savePromoApiKey(made, owner, database)
  await viral.savePromoUrl(promoUrl, database)
  await promoLink.rememberViralUrl(owner, viralUrl, database)
}
