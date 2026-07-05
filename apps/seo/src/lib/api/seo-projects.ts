import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ProjectOverview } from "@/server/project-overview"

export type { ProjectOverview }

export type ScheduleFrequency = "manual" | "daily" | "weekly"

export const scheduleFrequencyLabels: Record<ScheduleFrequency, string> = {
  manual: "Manual",
  daily: "Daily",
  weekly: "Weekly",
}

export type ProjectItem = {
  id: string
  name: string
  domain: string | null
  locationCode: number
  locationName: string | null
  languageCode: string
  languageName: string | null
  scheduleFrequency: ScheduleFrequency
  scheduleLastRunAt: string | null
  competitorCount: number
  keywordCount: number
  created_at: string
}

export type CompetitorItem = {
  id: string
  domain: string
  normalizedDomain: string
  created_at: string
}

export type LocationOption = {
  locationCode: number
  locationName: string
  countryIsoCode: string | null
}

export type LanguageOption = {
  languageCode: string
  languageName: string
}

export function getProjectErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Project request failed."
}

const projectFieldsSchema = z.object({
  name: z.string().min(1).max(255),
  domain: z.string().max(255),
  locationCode: z.number().int(),
  languageCode: z.string().min(1).max(20),
  scheduleFrequency: z.enum(["manual", "daily", "weekly"]).optional(),
})

const projectIdSchema = z.object({ projectId: z.string().min(1) })

function serializeProject(
  project: {
    id: string
    name: string
    domain: string | null
    locationCode: number
    locationName: string | null
    languageCode: string
    languageName: string | null
    scheduleFrequency: string
    scheduleLastRunAt: Date | null
    createdAt: Date
  },
  counts: { competitorCount?: number; keywordCount?: number } = {}
): ProjectItem {
  return {
    id: project.id,
    name: project.name,
    domain: project.domain,
    locationCode: project.locationCode,
    locationName: project.locationName,
    languageCode: project.languageCode,
    languageName: project.languageName,
    scheduleFrequency: project.scheduleFrequency as ScheduleFrequency,
    scheduleLastRunAt: project.scheduleLastRunAt
      ? project.scheduleLastRunAt.toISOString()
      : null,
    competitorCount: counts.competitorCount ?? 0,
    keywordCount: counts.keywordCount ?? 0,
    created_at: project.createdAt.toISOString(),
  }
}

const loadProjectsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ projects: ProjectItem[] }> => {
    const user = await requireUser()
    const { listProjectsForUser } = await import("@/server/seo-projects")
    const rows = await listProjectsForUser(user.id)
    return {
      projects: rows.map((row) =>
        serializeProject(row.project, {
          competitorCount: row.competitorCount,
          keywordCount: row.keywordCount,
        })
      ),
    }
  }
)

function serializeCompetitor(competitor: {
  id: string
  domain: string
  normalizedDomain: string
  createdAt: Date
}): CompetitorItem {
  return {
    id: competitor.id,
    domain: competitor.domain,
    normalizedDomain: competitor.normalizedDomain,
    created_at: competitor.createdAt.toISOString(),
  }
}

const loadCurrentProjectFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{
    project: ProjectItem
    competitors: CompetitorItem[]
  }> => {
    const user = await requireUser()
    const {
      getProjectForCurrentWorkspace,
      listCompetitorsForProject,
      countProjectKeywords,
    } = await import("@/server/seo-projects")
    const project = await getProjectForCurrentWorkspace(user.id)
    const competitors = await listCompetitorsForProject(user.id, project.id)
    const keywordCount = await countProjectKeywords(project.id)
    return {
      project: serializeProject(project, {
        competitorCount: competitors.length,
        keywordCount,
      }),
      competitors: competitors.map(serializeCompetitor),
    }
  }
)

const updateProjectFn = createServerFn({ method: "POST" })
  .inputValidator(projectFieldsSchema.partial().extend(projectIdSchema.shape))
  .handler(async ({ data }): Promise<{ project: ProjectItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { updateProjectForUser } = await import("@/server/seo-projects")
    const { projectId, ...fields } = data
    const project = await updateProjectForUser(user.id, projectId, fields)
    return { project: serializeProject(project) }
  })

const addCompetitorFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ domain: z.string().min(1).max(255) }))
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { addCompetitorToProject } = await import("@/server/seo-projects")
    await addCompetitorToProject(user.id, data.projectId, data.domain)
    return { added: true }
  })

const removeCompetitorFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ competitorId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { removeCompetitorFromProject } = await import("@/server/seo-projects")
    await removeCompetitorFromProject(
      user.id,
      data.projectId,
      data.competitorId
    )
    return { removed: true }
  })

const loadCurrentProjectOverviewFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ project: ProjectItem; overview: ProjectOverview }> => {
    const user = await requireUser()
    const { getProjectForCurrentWorkspace } = await import(
      "@/server/seo-projects"
    )
    const { getProjectOverviewForUser } = await import(
      "@/server/project-overview"
    )
    const project = await getProjectForCurrentWorkspace(user.id)
    const overview = await getProjectOverviewForUser(user.id, project.id)
    return { project: serializeProject(project), overview }
  }
)

const loadLocationsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ locations: LocationOption[] }> => {
    await requireUser()
    const { listLocationOptions } = await import("@/server/seo-projects")
    return { locations: await listLocationOptions() }
  }
)

const loadLanguagesFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ locationCode: z.number().int() }))
  .handler(async ({ data }): Promise<{ languages: LanguageOption[] }> => {
    await requireUser()
    const { listLanguageOptions } = await import("@/server/seo-projects")
    return { languages: await listLanguageOptions(data.locationCode) }
  })

const syncLocationsFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { syncLocationsLanguages } = await import("@/server/seo-projects")
    return syncLocationsLanguages(user.id)
  }
)

export function loadProjects() {
  return loadProjectsFn()
}

export function loadCurrentProject() {
  return loadCurrentProjectFn()
}

export function loadCurrentProjectOverview() {
  return loadCurrentProjectOverviewFn()
}

export function updateProject(
  projectId: string,
  input: {
    name?: string
    domain?: string
    locationCode?: number
    languageCode?: string
    scheduleFrequency?: ScheduleFrequency
  }
) {
  return updateProjectFn({ data: { projectId, ...input } })
}

export function addCompetitor(projectId: string, domain: string) {
  return addCompetitorFn({ data: { projectId, domain } })
}

export function removeCompetitor(projectId: string, competitorId: string) {
  return removeCompetitorFn({ data: { projectId, competitorId } })
}

export function loadLocations() {
  return loadLocationsFn()
}

export function loadLanguages(locationCode: number) {
  return loadLanguagesFn({ data: { locationCode } })
}

export function syncLocations() {
  return syncLocationsFn()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
