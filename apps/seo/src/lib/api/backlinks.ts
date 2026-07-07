import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { KeywordJobItem } from "@/lib/api/keywords"
import { BACKLINK_PROSPECT_STATUSES } from "@/lib/backlinks"
import type {
  BacklinkProspect,
  BacklinkSummary,
  ProspectSortField,
} from "@/server/backlinks"

export type { BacklinkProspect, BacklinkSummary, ProspectSortField }

export function getBacklinkErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Backlink request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1) })

const listProspectsFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      q: z.string().max(255).optional(),
      status: z.array(z.enum(BACKLINK_PROSPECT_STATUSES)).optional(),
      sort: z
        .object({
          field: z.enum(["domain", "domainRank", "status", "updatedAt"]),
          direction: z.enum(["asc", "desc"]),
        })
        .optional(),
      pagination: z.object({
        page: z.number().int().min(1),
        pageSize: z.number().int().min(1).max(100),
      }),
    })
  )
  .handler(
    async ({ data }): Promise<{ rows: BacklinkProspect[]; total: number }> => {
      const user = await requireUser()
      const { listProspectsForProject } = await import("@/server/backlinks")
      return listProspectsForProject(user.id, data)
    }
  )

const statusCountsFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }) => {
    const user = await requireUser()
    const { getProspectStatusCounts } = await import("@/server/backlinks")
    return getProspectStatusCounts(user.id, data.projectId)
  })

const updateProspectFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      prospectId: z.string().min(1),
      status: z.enum(BACKLINK_PROSPECT_STATUSES).optional(),
      contactUrl: z.string().max(2000).optional(),
      contactEmail: z.string().max(255).optional(),
      notes: z.string().max(5000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ prospect: BacklinkProspect }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { updateProspect } = await import("@/server/backlinks")
    const { projectId, prospectId, ...fields } = data
    return {
      prospect: await updateProspect(user.id, projectId, prospectId, fields),
    }
  })

const addProspectFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      domain: z.string().min(1).max(255),
      contactUrl: z.string().max(2000).optional(),
      contactEmail: z.string().max(255).optional(),
      notes: z.string().max(5000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ prospect: BacklinkProspect }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { addManualProspect } = await import("@/server/backlinks")
    const { projectId, ...fields } = data
    return { prospect: await addManualProspect(user.id, projectId, fields) }
  })

const deleteProspectFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema.extend({ prospectId: z.string().min(1) }))
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { deleteProspect } = await import("@/server/backlinks")
    return deleteProspect(user.id, data.projectId, data.prospectId)
  })

const backlinkSummaryFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(
    async ({ data }): Promise<{ summary: BacklinkSummary | null }> => {
      const user = await requireUser()
      const { getBacklinkSummary } = await import("@/server/backlinks")
      return { summary: await getBacklinkSummary(user.id, data.projectId) }
    }
  )

const exportCsvFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }): Promise<{ filename: string; csv: string }> => {
    const user = await requireUser()
    const { exportProspectsCsv } = await import("@/server/backlinks")
    return exportProspectsCsv(user.id, data.projectId)
  })

const createDiscoveryJobFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      limit: z.number().int().min(10).max(1000).optional(),
    })
  )
  .handler(async ({ data }): Promise<{ job: KeywordJobItem }> => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { createBacklinkDiscoveryJobForUser } = await import(
      "@/server/backlinks"
    )
    const job = await createBacklinkDiscoveryJobForUser(
      user.id,
      data.projectId,
      { limit: data.limit }
    )
    return {
      job: {
        id: job.id,
        type: job.type as KeywordJobItem["type"],
        status: job.status as KeywordJobItem["status"],
        progress: job.progress,
        currentStep: job.currentStep,
        errorMessage: job.errorMessage,
        created_at: job.createdAt.toISOString(),
      },
    }
  })

export function listProspects(input: {
  projectId: string
  q?: string
  status?: (typeof BACKLINK_PROSPECT_STATUSES)[number][]
  sort?: { field: ProspectSortField; direction: "asc" | "desc" }
  pagination: { page: number; pageSize: number }
}) {
  return listProspectsFn({ data: input })
}

export function getProspectStatusCounts(projectId: string) {
  return statusCountsFn({ data: { projectId } })
}

export function updateProspect(input: {
  projectId: string
  prospectId: string
  status?: (typeof BACKLINK_PROSPECT_STATUSES)[number]
  contactUrl?: string
  contactEmail?: string
  notes?: string
}) {
  return updateProspectFn({ data: input })
}

export function addProspect(input: {
  projectId: string
  domain: string
  contactUrl?: string
  contactEmail?: string
  notes?: string
}) {
  return addProspectFn({ data: input })
}

export function deleteProspect(projectId: string, prospectId: string) {
  return deleteProspectFn({ data: { projectId, prospectId } })
}

export function getBacklinkSummary(projectId: string) {
  return backlinkSummaryFn({ data: { projectId } })
}

export function exportProspectsCsv(projectId: string) {
  return exportCsvFn({ data: { projectId } })
}

export function createBacklinkDiscoveryJob(input: {
  projectId: string
  limit?: number
}) {
  return createDiscoveryJobFn({ data: input })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
