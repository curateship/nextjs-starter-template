import { and, asc, count, desc, eq, sql } from "drizzle-orm"

import {
  isValidDomain,
  normalizeDomain,
} from "@/lib/keyword-research"
import { collectTaskResults, dataForSeoGet } from "@/server/dataforseo"
import { db, type CustomShellDb } from "@/server/db"
import {
  dataforseoLocationsLanguages,
  projectCompetitors,
  projectKeywords,
  projects,
  type Project,
} from "@/server/schema"
import { getOrCreateCurrentWorkspace } from "@/server/workspaces"

export function parseProjectDomain(input: string) {
  const normalized = normalizeDomain(input)
  if (!isValidDomain(normalized)) {
    throw new Error("Enter a valid domain, like example.com.")
  }
  return normalized
}

export async function getOwnedProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
): Promise<Project> {
  const [project] = await database
    .select()
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .limit(1)

  if (!project) {
    throw new Error("Project not found")
  }
  return project
}

export async function listProjectsForUser(
  userId: string,
  database: CustomShellDb = db
) {
  return database
    .select({
      project: projects,
      competitorCount: sql<number>`(
        select count(*)::int from ${projectCompetitors}
        where ${projectCompetitors.projectId} = ${projects.id}
      )`,
      keywordCount: sql<number>`(
        select count(*)::int from ${projectKeywords}
        where ${projectKeywords.projectId} = ${projects.id}
      )`,
    })
    .from(projects)
    .where(eq(projects.userId, userId))
    .orderBy(desc(projects.createdAt))
}

async function resolveLocationLanguage(
  locationCode: number,
  languageCode: string,
  database: CustomShellDb
) {
  const [row] = await database
    .select()
    .from(dataforseoLocationsLanguages)
    .where(
      and(
        eq(dataforseoLocationsLanguages.locationCode, locationCode),
        eq(dataforseoLocationsLanguages.languageCode, languageCode)
      )
    )
    .limit(1)

  if (!row) {
    throw new Error("Set location and language before running research.")
  }
  return row
}

export async function createProjectForUser(
  userId: string,
  input: {
    name: string
    domain?: string | null
    locationCode: number
    languageCode: string
    scheduleFrequency?: string
    workspaceId?: string
  },
  database: CustomShellDb = db
) {
  const name = input.name.trim()
  if (!name) {
    throw new Error("Project name is required")
  }
  const trimmedDomain = input.domain?.trim() || null
  const normalizedDomain = trimmedDomain
    ? parseProjectDomain(trimmedDomain)
    : null
  const location = await resolveLocationLanguage(
    input.locationCode,
    input.languageCode,
    database
  )

  const [project] = await database
    .insert(projects)
    .values({
      userId,
      workspaceId: input.workspaceId ?? null,
      name,
      domain: trimmedDomain,
      normalizedDomain,
      locationCode: location.locationCode,
      locationName: location.locationName,
      languageCode: location.languageCode,
      languageName: location.languageName,
      scheduleFrequency: input.scheduleFrequency ?? "manual",
    })
    .returning()

  if (!project) {
    throw new Error("Project was not created")
  }
  return project
}

/**
 * Resolves the SEO project for the user's current workspace (1:1), creating a
 * blank one on first access and keeping its name in sync with the workspace.
 */
export async function getProjectForCurrentWorkspace(
  userId: string,
  database: CustomShellDb = db
): Promise<Project> {
  const workspace = await getOrCreateCurrentWorkspace(userId, database)

  const existing = await findProjectByWorkspace(workspace.id, database)
  if (existing) {
    if (existing.name !== workspace.name) {
      const [synced] = await database
        .update(projects)
        .set({ name: workspace.name, updatedAt: new Date() })
        .where(eq(projects.id, existing.id))
        .returning()
      return synced ?? existing
    }
    return existing
  }

  // Create a blank project. `onConflictDoNothing` tolerates a concurrent
  // creator racing on the unique workspace_id index (first access can fire
  // parallel route loaders); we then read back whichever insert won.
  const location = await resolveLocationLanguage(2840, "en", database)
  await database
    .insert(projects)
    .values({
      userId,
      workspaceId: workspace.id,
      name: workspace.name,
      domain: null,
      normalizedDomain: null,
      locationCode: location.locationCode,
      locationName: location.locationName,
      languageCode: location.languageCode,
      languageName: location.languageName,
    })
    .onConflictDoNothing()

  const created = await findProjectByWorkspace(workspace.id, database)
  if (!created) {
    throw new Error("Project was not created")
  }
  return created
}

async function findProjectByWorkspace(
  workspaceId: string,
  database: CustomShellDb
): Promise<Project | null> {
  const [row] = await database
    .select()
    .from(projects)
    .where(eq(projects.workspaceId, workspaceId))
    .limit(1)
  return row ?? null
}

export async function updateProjectForUser(
  userId: string,
  projectId: string,
  input: {
    name?: string
    domain?: string
    locationCode?: number
    languageCode?: string
    scheduleFrequency?: string
  },
  database: CustomShellDb = db
) {
  const existing = await getOwnedProject(userId, projectId, database)

  const name = input.name?.trim() ?? existing.name
  if (!name) {
    throw new Error("Project name is required")
  }

  const domain =
    input.domain !== undefined ? input.domain.trim() || null : existing.domain
  const normalizedDomain = domain ? parseProjectDomain(domain) : null

  const location = await resolveLocationLanguage(
    input.locationCode ?? existing.locationCode,
    input.languageCode ?? existing.languageCode,
    database
  )

  const [project] = await database
    .update(projects)
    .set({
      name,
      domain,
      normalizedDomain,
      locationCode: location.locationCode,
      locationName: location.locationName,
      languageCode: location.languageCode,
      languageName: location.languageName,
      scheduleFrequency:
        input.scheduleFrequency ?? existing.scheduleFrequency,
      updatedAt: new Date(),
    })
    .where(and(eq(projects.id, projectId), eq(projects.userId, userId)))
    .returning()

  if (!project) {
    throw new Error("Project not found")
  }
  return project
}

export async function listCompetitorsForProject(
  userId: string,
  projectId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  return database
    .select()
    .from(projectCompetitors)
    .where(eq(projectCompetitors.projectId, projectId))
    .orderBy(asc(projectCompetitors.createdAt))
}

export async function addCompetitorToProject(
  userId: string,
  projectId: string,
  domain: string,
  database: CustomShellDb = db
) {
  const project = await getOwnedProject(userId, projectId, database)
  const normalizedDomain = parseProjectDomain(domain)

  if (
    project.normalizedDomain &&
    normalizedDomain === project.normalizedDomain
  ) {
    throw new Error("Competitor domain cannot match the project domain.")
  }

  const [existing] = await database
    .select({ id: projectCompetitors.id })
    .from(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.projectId, projectId),
        eq(projectCompetitors.normalizedDomain, normalizedDomain)
      )
    )
    .limit(1)

  if (existing) {
    throw new Error("This competitor is already added to the project.")
  }

  const [competitor] = await database
    .insert(projectCompetitors)
    .values({ projectId, domain: domain.trim(), normalizedDomain })
    .returning()

  if (!competitor) {
    throw new Error("Competitor was not added")
  }
  return competitor
}

export async function removeCompetitorFromProject(
  userId: string,
  projectId: string,
  competitorId: string,
  database: CustomShellDb = db
) {
  await getOwnedProject(userId, projectId, database)
  const [deleted] = await database
    .delete(projectCompetitors)
    .where(
      and(
        eq(projectCompetitors.id, competitorId),
        eq(projectCompetitors.projectId, projectId)
      )
    )
    .returning({ id: projectCompetitors.id })

  if (!deleted) {
    throw new Error("Competitor not found")
  }
  return deleted
}

export async function listLocationOptions(database: CustomShellDb = db) {
  return database
    .selectDistinct({
      locationCode: dataforseoLocationsLanguages.locationCode,
      locationName: dataforseoLocationsLanguages.locationName,
      countryIsoCode: dataforseoLocationsLanguages.countryIsoCode,
    })
    .from(dataforseoLocationsLanguages)
    .orderBy(asc(dataforseoLocationsLanguages.locationName))
}

export async function listLanguageOptions(
  locationCode: number,
  database: CustomShellDb = db
) {
  return database
    .select({
      languageCode: dataforseoLocationsLanguages.languageCode,
      languageName: dataforseoLocationsLanguages.languageName,
    })
    .from(dataforseoLocationsLanguages)
    .where(eq(dataforseoLocationsLanguages.locationCode, locationCode))
    .orderBy(asc(dataforseoLocationsLanguages.languageName))
}

type DataForSeoLocation = {
  location_code: number
  location_name: string
  location_type: string
  country_iso_code: string | null
  available_languages: Array<{
    language_name: string
    language_code: string
    keywords: number | null
    serps: number | null
  }> | null
}

/**
 * Refreshes the cached DataForSEO Labs locations/languages list. Only
 * country-level locations are stored to keep the selects usable.
 */
export async function syncLocationsLanguages(
  userId: string,
  database: CustomShellDb = db
) {
  const response = await dataForSeoGet<DataForSeoLocation>(
    "/v3/dataforseo_labs/locations_and_languages",
    { userId, endpointName: "locations_and_languages" },
    database
  )
  const { results } = collectTaskResults(response)
  const fetchedAt = new Date()

  let synced = 0
  for (const location of results) {
    if (location.location_type !== "Country") continue
    const languages = location.available_languages ?? []
    if (!languages.length) continue

    await database
      .insert(dataforseoLocationsLanguages)
      .values(
        languages.map((language) => ({
          locationCode: location.location_code,
          locationName: location.location_name,
          countryIsoCode: location.country_iso_code,
          languageCode: language.language_code,
          languageName: language.language_name,
          keywordsCount: language.keywords,
          serpsCount: language.serps,
          fetchedAt,
        }))
      )
      .onConflictDoUpdate({
        target: [
          dataforseoLocationsLanguages.locationCode,
          dataforseoLocationsLanguages.languageCode,
          dataforseoLocationsLanguages.source,
        ],
        set: {
          locationName: sql`excluded.location_name`,
          countryIsoCode: sql`excluded.country_iso_code`,
          keywordsCount: sql`excluded.keywords_count`,
          serpsCount: sql`excluded.serps_count`,
          fetchedAt,
        },
      })
    synced += languages.length
  }

  return { synced }
}

export async function countProjectKeywords(
  projectId: string,
  database: CustomShellDb = db
) {
  const [row] = await database
    .select({ value: count() })
    .from(projectKeywords)
    .where(eq(projectKeywords.projectId, projectId))
  return row?.value ?? 0
}
