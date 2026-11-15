import { asc, eq } from "drizzle-orm"
import { z } from "zod"

import type { Network } from "@/lib/social/networks"
import { isPublicCallbackUrl } from "@/server/browser/proxy-probe"
import { db as defaultDb, type CustomShellDb } from "@/server/db"
import { customShellUsers } from "@/server/schema"
import { promoProjects } from "@/server/social/schema"

import { cleanViralUrl, INSIDE_VIRAL_ADDRESS, rememberViralUrl, ViralLinkRefusal } from "./link"
import type { PromoViralLinkRow } from "./schema"

/**
 * What `/api/connect/viral/hello` and `/projects` do once the key has been
 * checked (`link.ts`). Reads and posts have their own files.
 */

export type ViralConnectProject = { id: string; name: string; networks: Network[] }

async function projectsOf(userId: string, db: CustomShellDb): Promise<ViralConnectProject[]> {
  return db
    .select({ id: promoProjects.id, name: promoProjects.name, networks: promoProjects.networks })
    .from(promoProjects)
    .where(eq(promoProjects.userId, userId))
    .orderBy(asc(promoProjects.name), asc(promoProjects.id))
}

export const viralHelloShape = z.object({ viralUrl: z.string().max(500) })

/**
 * Test on Viral's Settings → Promo connection: keeps the Viral address it
 * came from, the only one Promo calls back, and answers whose Promo this is
 * and its projects.
 */
export async function viralHello(link: PromoViralLinkRow, data: z.infer<typeof viralHelloShape>, db: CustomShellDb = defaultDb) {
  const viralUrl = cleanViralUrl(data.viralUrl)
  if (!viralUrl) throw new ViralLinkRefusal(400, "Viral's address must be a web address, and https on the live server.")
  if (!(await isPublicCallbackUrl(viralUrl))) throw new ViralLinkRefusal(400, INSIDE_VIRAL_ADDRESS)
  await rememberViralUrl(link.userId, viralUrl, db)
  const [owner] = await db.select({ name: customShellUsers.name }).from(customShellUsers).where(eq(customShellUsers.id, link.userId)).limit(1)
  return { name: owner?.name ?? "", projects: await projectsOf(link.userId, db) }
}

/** The project picker in Viral's Write a post for Promo. */
export async function viralProjects(link: PromoViralLinkRow, db: CustomShellDb = defaultDb) {
  return { projects: await projectsOf(link.userId, db) }
}
