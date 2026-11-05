import { and, asc, desc, eq } from "drizzle-orm"
import { z } from "zod"

import {
  AD_COUNTRIES,
  AD_KEYWORDS_PER_SEARCH,
  adLibraryUrl,
  ADS_PER_KEYWORD,
  daysBetween,
  WINNING_AD_DAYS,
  type ProjectAds,
  type WinningAd,
} from "@/lib/viral/ads"
import { viralSays } from "@/lib/viral/viral"
import { now, uuid } from "@/server/auth/security"
import { db } from "@/server/db"
import { requireOwnedViralProject } from "@/server/viral/projects"
import { viralAdRuns, viralAds, viralProjectKeywords, type ViralAdRow } from "@/server/viral/schema"
import { getMetaToken } from "@/server/viral/settings"

/**
 * Winning ads from Meta's ad library (`workspace/docs/winning-ads.md`, task
 * part 23). A search asks the library about the project's keywords, keeps
 * the ads still running that started 30 days ago or more, and replaces the
 * project's last list. The token stays on the server: the browser only ever
 * gets each ad's public library page.
 */

const GRAPH_URL = "https://graph.facebook.com/v21.0/ads_archive"

const answerSchema = z.object({
  data: z
    .array(
      z.object({
        id: z.string().min(1).max(64),
        page_name: z.string().max(500).optional(),
        ad_creative_bodies: z.array(z.string()).optional(),
        ad_creative_link_titles: z.array(z.string()).optional(),
        ad_delivery_start_time: z.string().min(1),
        publisher_platforms: z.array(z.string()).optional(),
      })
    )
    .default([]),
})

const errorSchema = z.object({ error: z.object({ message: z.string(), code: z.number().optional() }) })

export type MetaAd = {
  adArchiveId: string
  pageName: string
  body: string
  title: string
  platforms: string[]
  startedAt: Date
}

/** One question to the ad library: the active ads matching one keyword. */
export async function fetchMetaAds(
  token: string,
  keyword: string,
  fetcher: typeof fetch = fetch
): Promise<MetaAd[]> {
  const params = new URLSearchParams({
    access_token: token,
    search_terms: keyword,
    ad_reached_countries: JSON.stringify(AD_COUNTRIES),
    ad_active_status: "ACTIVE",
    ad_type: "ALL",
    fields: "id,page_name,ad_creative_bodies,ad_creative_link_titles,ad_delivery_start_time,publisher_platforms",
    limit: String(ADS_PER_KEYWORD),
  })
  let response: Response
  try {
    response = await fetcher(`${GRAPH_URL}?${params}`, { signal: AbortSignal.timeout(20_000) })
  } catch {
    throw viralSays("Meta's ad library could not be reached. Try again in a moment.")
  }
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    const problem = errorSchema.safeParse(body)
    if (problem.success && problem.data.error.code === 190) {
      throw viralSays("Meta refused the token. Paste a fresh one in Settings → Meta.")
    }
    // Meta's own sentence, cut short, never the token or the address.
    throw viralSays(`Meta said: ${problem.success ? problem.data.error.message.slice(0, 300) : `error ${response.status}`}`)
  }
  const parsed = answerSchema.safeParse(body)
  if (!parsed.success) throw viralSays("Meta's ad library answered with something unexpected. Try again later.")
  return parsed.data.data.flatMap((ad) => {
    const startedAt = new Date(ad.ad_delivery_start_time)
    if (Number.isNaN(startedAt.getTime())) return []
    return [
      {
        adArchiveId: ad.id,
        pageName: ad.page_name ?? "",
        body: (ad.ad_creative_bodies?.[0] ?? "").slice(0, 4_000),
        title: (ad.ad_creative_link_titles?.[0] ?? "").slice(0, 500),
        platforms: (ad.publisher_platforms ?? []).slice(0, 10),
        startedAt,
      },
    ]
  })
}

function toWinningAd(row: ViralAdRow, at: Date): WinningAd {
  return {
    id: row.id,
    adArchiveId: row.adArchiveId,
    pageName: row.pageName,
    body: row.body,
    title: row.title,
    keyword: row.keyword,
    platforms: row.platforms,
    startedAt: row.startedAt.toISOString(),
    daysRunning: daysBetween(row.startedAt, at),
    libraryUrl: adLibraryUrl(row.adArchiveId),
  }
}

/** The project's last list, newest first, and when it was searched. */
export async function loadProjectAds(ownerId: string, projectId: string): Promise<ProjectAds> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  const [rows, [run], token] = await Promise.all([
    db
      .select()
      .from(viralAds)
      .where(and(eq(viralAds.projectId, project.id), eq(viralAds.ownerId, ownerId)))
      .orderBy(desc(viralAds.startedAt)),
    db.select().from(viralAdRuns).where(eq(viralAdRuns.projectId, project.id)),
    getMetaToken().catch(() => null),
  ])
  const at = now()
  return {
    ads: rows.map((row) => toWinningAd(row, at)),
    searchedAt: run?.searchedAt.toISOString() ?? null,
    error: run?.error ?? null,
    tokenSet: Boolean(token),
  }
}

/**
 * Search ads: asks the library about the project's first keywords, keeps the
 * ads that have run 30 days or more, and replaces the project's list. A
 * failure is kept with the run, so the panel says why, and the old list stays.
 */
export async function searchProjectAds(
  ownerId: string,
  projectId: string,
  fetcher: typeof fetch = fetch
): Promise<ProjectAds> {
  const project = await requireOwnedViralProject(ownerId, projectId)
  if (project.isSample) throw viralSays("This is a sample project, so its ads are made up and nothing is searched.")
  const token = await getMetaToken()
  if (!token) throw viralSays("Winning ads needs a Meta token. Paste one in Settings → Meta first.")
  const keywords = await db
    .select({ keyword: viralProjectKeywords.keyword })
    .from(viralProjectKeywords)
    .where(eq(viralProjectKeywords.projectId, project.id))
    .orderBy(asc(viralProjectKeywords.position))
    .limit(AD_KEYWORDS_PER_SEARCH)
  if (!keywords.length) throw viralSays("Add a keyword to this project first. Winning ads searches Meta for its keywords.")

  const at = now()
  const found = new Map<string, MetaAd & { keyword: string }>()
  try {
    for (const { keyword } of keywords) {
      for (const ad of await fetchMetaAds(token, keyword, fetcher)) {
        if (daysBetween(ad.startedAt, at) < WINNING_AD_DAYS) continue
        if (!found.has(ad.adArchiveId)) found.set(ad.adArchiveId, { ...ad, keyword })
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message.replace(/^.*VIRAL_SAYS: /, "") : "The search failed."
    await db
      .insert(viralAdRuns)
      .values({ projectId: project.id, searchedAt: at, error: message.slice(0, 500) })
      .onConflictDoUpdate({ target: viralAdRuns.projectId, set: { searchedAt: at, error: message.slice(0, 500) } })
    throw error
  }

  await db.transaction(async (tx) => {
    await tx.delete(viralAds).where(eq(viralAds.projectId, project.id))
    if (found.size) {
      await tx.insert(viralAds).values(
        [...found.values()].map((ad) => ({
          id: uuid(),
          ownerId,
          projectId: project.id,
          adArchiveId: ad.adArchiveId,
          pageName: ad.pageName,
          body: ad.body,
          title: ad.title,
          keyword: ad.keyword,
          platforms: ad.platforms,
          startedAt: ad.startedAt,
          foundAt: at,
        }))
      )
    }
    await tx
      .insert(viralAdRuns)
      .values({ projectId: project.id, searchedAt: at, error: null })
      .onConflictDoUpdate({ target: viralAdRuns.projectId, set: { searchedAt: at, error: null } })
  })
  return loadProjectAds(ownerId, project.id)
}
