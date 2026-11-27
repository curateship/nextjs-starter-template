import { and, asc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Network } from "@/lib/social/networks"
import { appUrlFor } from "@/server/app-url"
import { isPublicCallbackUrl } from "@/server/browser/proxy-probe"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { promoProjects } from "@/server/social/schema"

import { acceptArrival, arrivalShape, startCopy, type ArrivalAnswer } from "./arrivals"
import { archiveItemHref } from "./paths"
import { promoArchiveItems, type PromoVideoLinkRow } from "./schema"
import { cleanVideoUrl, INSIDE_VIDEO_ADDRESS, rememberVideoUrl, VideoLinkRefusal } from "./video-link"

/**
 * What each `/api/connect/video/*` address does once the key has been
 * checked (`video-link.ts`). The route files only hand their request here.
 */

export type ConnectProject = { id: string; name: string; imageUrl: string; networks: Network[] }

async function projectsOf(userId: string, db: CustomShellDb): Promise<ConnectProject[]> {
  return db
    .select({ id: promoProjects.id, name: promoProjects.name, imageUrl: promoProjects.imageUrl, networks: promoProjects.networks })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.name), asc(promoProjects.id))
}

export const helloShape = z.object({ videoUrl: z.string().max(500) })

/**
 * Test in Video's Settings → Promo: keeps the Video address it came from,
 * the only one Promo will fetch files from or call back, and answers whose
 * Promo this is and its projects.
 */
export async function hello(link: PromoVideoLinkRow, data: z.infer<typeof helloShape>, db: CustomShellDb = defaultDb) {
  const videoUrl = cleanVideoUrl(data.videoUrl)
  if (!videoUrl) throw new VideoLinkRefusal(400, "Video's address must be a web address, and https on the live server.")
  if (!(await isPublicCallbackUrl(videoUrl))) throw new VideoLinkRefusal(400, INSIDE_VIDEO_ADDRESS)
  await rememberVideoUrl(link.userId, videoUrl, db)
  const [owner] = await db.select({ name: customShellUsers.name }).from(customShellUsers).where(eq(customShellUsers.id, link.userId)).limit(1)
  return { name: owner?.name ?? "", projects: await projectsOf(link.userId, db) }
}

/** The project picker in Video's send window. */
export async function projects(link: PromoVideoLinkRow, db: CustomShellDb = defaultDb) {
  return { projects: await projectsOf(link.userId, db) }
}

/** A send from Video: the item is made at once, and its files are copied after the answer. */
export async function arrive(link: PromoVideoLinkRow, data: z.infer<typeof arrivalShape>, db: CustomShellDb = defaultDb): Promise<ArrivalAnswer> {
  const answer = await acceptArrival(link, data, db)
  if (answer.status === "copying") startCopy(answer.itemId, db)
  return answer
}

/**
 * Where a send stands, for Video's window while it waits: copying, ready, or
 * gone, which is how a failed copy ends (`arrivals.ts`). Asked by the send's
 * id, because a newer version ends up on the item it replaced.
 */
export async function sendStatus(link: PromoVideoLinkRow, sendId: string, db: CustomShellDb = defaultDb) {
  const [item] = await db
    .select({ id: promoArchiveItems.id, status: promoArchiveItems.status, projectId: promoArchiveItems.projectId })
    .from(promoArchiveItems)
    .where(and(eq(promoArchiveItems.sendId, sendId), eq(promoArchiveItems.userId, link.userId)))
    .limit(1)
  if (!item) return { status: "gone" as const }
  return { status: item.status, itemId: item.id, itemUrl: appUrlFor(archiveItemHref(item.projectId, item.id)) }
}
