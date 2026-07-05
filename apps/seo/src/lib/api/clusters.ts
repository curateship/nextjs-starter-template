import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { KEYWORD_STATUSES } from "@/lib/keyword-research"
import type { ClusterRow, ClusterSortField } from "@/server/keyword-clusters"

export type { ClusterRow, ClusterSortField }

export function getClusterErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : "Cluster request failed."
}

const projectIdSchema = z.object({ projectId: z.string().min(1) })

const rebuildClustersFn = createServerFn({ method: "POST" })
  .inputValidator(projectIdSchema)
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { rebuildClustersForProject } = await import(
      "@/server/keyword-clusters"
    )
    return rebuildClustersForProject(user.id, data.projectId)
  })

const listClustersFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      q: z.string().max(255).optional(),
      sort: z
        .object({
          field: z.enum(["name", "keywords", "volume", "opportunity"]),
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
    async ({
      data,
    }): Promise<{
      rows: ClusterRow[]
      total: number
      unclusteredCount: number
    }> => {
      const user = await requireUser()
      const { listClustersForProject } = await import(
        "@/server/keyword-clusters"
      )
      return listClustersForProject(user.id, data)
    }
  )

const renameClusterFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      clusterId: z.string().min(1),
      name: z.string().min(1).max(100),
    })
  )
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { renameCluster } = await import("@/server/keyword-clusters")
    return renameCluster(user.id, data.projectId, data.clusterId, data.name)
  })

const updateClusterStatusFn = createServerFn({ method: "POST" })
  .inputValidator(
    projectIdSchema.extend({
      clusterId: z.string().min(1),
      status: z.enum(KEYWORD_STATUSES),
    })
  )
  .handler(async ({ data }) => {
    const { requireAppOrigin } = await import("@/server/origin")
    requireAppOrigin()
    const user = await requireUser()
    const { updateClusterStatus } = await import("@/server/keyword-clusters")
    return updateClusterStatus(
      user.id,
      data.projectId,
      data.clusterId,
      data.status
    )
  })

export function rebuildClusters(projectId: string) {
  return rebuildClustersFn({ data: { projectId } })
}

export function listClusters(input: {
  projectId: string
  q?: string
  sort?: { field: ClusterSortField; direction: "asc" | "desc" }
  pagination: { page: number; pageSize: number }
}) {
  return listClustersFn({ data: input })
}

export function renameKeywordCluster(
  projectId: string,
  clusterId: string,
  name: string
) {
  return renameClusterFn({ data: { projectId, clusterId, name } })
}

export function updateKeywordClusterStatus(
  projectId: string,
  clusterId: string,
  status: (typeof KEYWORD_STATUSES)[number]
) {
  return updateClusterStatusFn({ data: { projectId, clusterId, status } })
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) {
    throw new Error("Missing Custom Shell session")
  }
  return user
}
