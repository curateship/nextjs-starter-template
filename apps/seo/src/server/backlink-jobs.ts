import { eq } from "drizzle-orm"

import { normalizeDomain } from "@/lib/keyword-research"
import {
  collectTaskResults,
  dataForSeoPost,
  type ApiCallContext,
} from "@/server/dataforseo"
import { type CustomShellDb } from "@/server/db"
import { setStep } from "@/server/keyword-jobs"
import {
  backlinkProspects,
  backlinkSnapshots,
  projectCompetitors,
  type KeywordJob,
  type Project,
} from "@/server/schema"

export type BacklinkDiscoveryJobInput = {
  limit: number
}

/** Per-target intersection entry; DataForSEO calls this a backlinks summary. */
type IntersectionSummary = {
  backlinks?: number | null
  rank?: number | null
  main_domain_rank?: number | null
}

type DomainIntersectionItem = {
  domain?: string | null
  [key: string]: unknown
}

export type NormalizedProspect = {
  referringDomain: string
  normalizedDomain: string
  domainRank: number | null
  backlinksCount: number | null
  referringTo: string[]
}

/**
 * Flattens one domain_intersection item into a prospect. The numbered keys
 * ("1", "2", ...) mirror the request's targets map; each holds the backlink
 * summary between the referring domain and that competitor.
 */
export function normalizeIntersectionItem(
  item: DomainIntersectionItem,
  targets: Record<string, string>
): NormalizedProspect | null {
  const referringDomain = (item.domain ?? "").trim()
  if (!referringDomain) return null
  const normalized = normalizeDomain(referringDomain)
  if (!normalized) return null

  let domainRank: number | null = null
  let backlinksCount = 0
  let sawBacklinks = false
  const referringTo: string[] = []

  for (const [index, competitorDomain] of Object.entries(targets)) {
    const summary = item[index]
    if (!summary || typeof summary !== "object") continue
    const { backlinks, rank, main_domain_rank } =
      summary as IntersectionSummary
    referringTo.push(competitorDomain)
    if (typeof backlinks === "number") {
      backlinksCount += backlinks
      sawBacklinks = true
    }
    const candidate = main_domain_rank ?? rank
    if (typeof candidate === "number") {
      domainRank = Math.max(domainRank ?? 0, candidate)
    }
  }

  return {
    referringDomain,
    normalizedDomain: normalized,
    domainRank,
    backlinksCount: sawBacklinks ? backlinksCount : null,
    referringTo,
  }
}

/**
 * Link-gap discovery: domains linking to the project's competitors but not to
 * the project domain, plus a refresh of the project's own backlink summary.
 * Prospect upserts use onConflictDoNothing so pipeline edits (status, contact
 * info, notes) survive re-runs.
 */
export async function runBacklinkDiscovery(
  database: CustomShellDb,
  job: KeywordJob,
  project: Project,
  context: ApiCallContext
): Promise<string[]> {
  const input = job.input as BacklinkDiscoveryJobInput
  const limit = Math.max(10, Math.min(input.limit ?? 300, 1000))

  const normalizedDomain = project.normalizedDomain
  if (!normalizedDomain) {
    throw new Error(
      "Set a domain in Settings → Project before finding prospects."
    )
  }

  await setStep(database, job.id, 10, "Loading competitors")
  const competitors = await database
    .select({ normalizedDomain: projectCompetitors.normalizedDomain })
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, project.id))
  if (!competitors.length) {
    throw new Error("Add at least one competitor before finding prospects.")
  }

  // The endpoint accepts up to 20 targets.
  const targets = Object.fromEntries(
    competitors
      .slice(0, 20)
      .map((competitor, index) => [String(index + 1), competitor.normalizedDomain])
  )
  const excluded = new Set([normalizedDomain, ...Object.values(targets)])
  const errors: string[] = []
  let discoveryFailed = false

  await setStep(
    database,
    job.id,
    25,
    `Finding domains linking to ${Object.keys(targets).length} competitor(s)`
  )
  try {
    const response = await dataForSeoPost<{
      items: DomainIntersectionItem[] | null
    }>(
      "/v3/backlinks/domain_intersection/live",
      [
        {
          targets,
          exclude_targets: [normalizedDomain],
          limit,
          order_by: ["rank,desc"],
        },
      ],
      { ...context, endpointName: "backlinks_domain_intersection" },
      database
    )

    const seen = new Set<string>()
    const prospects: NormalizedProspect[] = []
    for (const result of collectTaskResults(response).results) {
      for (const item of result.items ?? []) {
        const prospect = normalizeIntersectionItem(item, targets)
        if (!prospect) continue
        if (excluded.has(prospect.normalizedDomain)) continue
        if (seen.has(prospect.normalizedDomain)) continue
        seen.add(prospect.normalizedDomain)
        prospects.push(prospect)
      }
    }

    await setStep(database, job.id, 60, "Saving prospects")
    for (const batch of chunk(prospects.slice(0, limit), 200)) {
      await database
        .insert(backlinkProspects)
        .values(
          batch.map((prospect) => ({
            projectId: project.id,
            referringDomain: prospect.referringDomain,
            normalizedDomain: prospect.normalizedDomain,
            domainRank: prospect.domainRank,
            backlinksCount: prospect.backlinksCount,
            referringTo: prospect.referringTo,
            discoveredVia: "domain_intersection",
          }))
        )
        .onConflictDoNothing()
    }
  } catch (error) {
    discoveryFailed = true
    errors.push(
      `domain_intersection: ${error instanceof Error ? error.message : "failed"}`
    )
  }

  await setStep(database, job.id, 80, "Refreshing backlink profile")
  try {
    const response = await dataForSeoPost<{
      target?: string | null
      rank?: number | null
      backlinks?: number | null
      referring_domains?: number | null
      referring_pages?: number | null
      broken_backlinks?: number | null
    }>(
      "/v3/backlinks/summary/live",
      [{ target: normalizedDomain, include_subdomains: true }],
      { ...context, endpointName: "backlinks_summary" },
      database
    )

    const [summary] = collectTaskResults(response).results
    if (summary) {
      // Insert and update write the same values; projectId is the conflict key.
      const snapshot = {
        target: normalizedDomain,
        domainRank: summary.rank ?? null,
        backlinks: summary.backlinks ?? null,
        referringDomains: summary.referring_domains ?? null,
        referringPages: summary.referring_pages ?? null,
        brokenBacklinks: summary.broken_backlinks ?? null,
        fetchedAt: new Date(),
      }
      await database
        .insert(backlinkSnapshots)
        .values({ projectId: project.id, ...snapshot })
        .onConflictDoUpdate({
          target: [backlinkSnapshots.projectId],
          set: snapshot,
        })
    }
  } catch (error) {
    errors.push(
      `summary: ${error instanceof Error ? error.message : "failed"}`
    )
  }

  if (discoveryFailed) {
    // The prospect-discovery call is the point of the job. If it failed, fail
    // the job so the UI shows the error and a Retry, instead of a deceptively
    // "completed" run with zero new prospects. A summary-only failure is a
    // genuine partial success (prospects were still saved).
    throw new Error(errors[0])
  }
  return errors
}

function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size))
  }
  return batches
}
