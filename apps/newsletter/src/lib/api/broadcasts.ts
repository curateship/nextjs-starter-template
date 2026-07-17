import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  broadcastAudienceFilterSchema,
  broadcastBlocksSchema,
  describeAudienceFilter,
  parseAudienceFilter,
  parseStoredBlocks,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"
import {
  broadcastDripConfigSchema,
  parseDripConfig,
  type BroadcastDripConfig,
} from "@/lib/broadcasts/drip"
import type {
  NewsletterBroadcast,
  NewsletterBroadcastTemplate,
} from "@/server/schema"

export const BROADCAST_STATUSES = [
  "draft",
  "scheduled",
  "sending",
  "paused",
  "sent",
] as const
export type BroadcastStatus = (typeof BROADCAST_STATUSES)[number]

export type BroadcastListItem = {
  id: string
  name: string
  subject: string
  status: BroadcastStatus
  audienceLabel: string
  totalRecipients: number
  totalSent: number
  totalFailed: number
  scheduled_at: string | null
  sent_at: string | null
  updated_at: string
}

export type BroadcastDetail = {
  id: string
  name: string
  subject: string
  preheader: string
  fromName: string | null
  status: BroadcastStatus
  blocks: BroadcastBlock[]
  audienceFilter: BroadcastAudienceFilter
  dripConfig: BroadcastDripConfig
  pausedReason: string | null
  totalRecipients: number
  totalSent: number
  totalFailed: number
  batchesSent: number
  scheduled_at: string | null
  sent_at: string | null
  created_at: string
  updated_at: string
}

export type BroadcastTemplateItem = {
  id: string
  name: string
  isDefault: boolean
  blocks: BroadcastBlock[]
  updated_at: string
}

const nameSchema = z.string().trim().min(1).max(120)
const broadcastIdSchema = z.object({ broadcastId: z.string().uuid() })
const listSchema = z.object({
  search: z.string().max(200).optional(),
  page: z.number().int().min(0).default(0),
  pageSize: z.number().int().min(1).max(200).default(50),
})
const updateSchema = broadcastIdSchema.extend({
  name: nameSchema.optional(),
  subject: z.string().max(500).optional(),
  preheader: z.string().max(300).optional(),
  fromName: z.string().max(255).nullable().optional(),
  blocks: broadcastBlocksSchema.optional(),
  audienceFilter: broadcastAudienceFilterSchema.optional(),
  dripConfig: broadcastDripConfigSchema.optional(),
})
const scheduleSchema = broadcastIdSchema.extend({
  scheduledAt: z.iso.datetime({ offset: true }),
})
const sendTestSchema = broadcastIdSchema.extend({
  email: z.string().trim().email().max(255),
})
const idsSchema = z.object({
  broadcastIds: z.array(z.string().uuid()).min(1).max(100),
})
const audienceSchema = z.object({ filter: broadcastAudienceFilterSchema })
const templateIdSchema = z.object({ templateId: z.string().uuid() })
const createTemplateSchema = z.object({
  name: nameSchema,
  blocks: broadcastBlocksSchema,
})
const setDefaultTemplateSchema = templateIdSchema.extend({
  isDefault: z.boolean(),
})
const templateIdsSchema = z.object({
  templateIds: z.array(z.string().uuid()).min(1).max(100),
})

const SAFE_ERROR_MESSAGES = new Set([
  "Broadcast not found",
  "Template not found",
  "Missing Custom Shell session",
  "Add a subject before sending",
  "Add at least one content block before sending",
  "Email settings are not configured",
  "No contacts match this audience",
  "Only a draft or scheduled broadcast can be sent",
  "Only a draft or scheduled broadcast can be scheduled",
  "Pick a time in the future",
  "Broadcast is not scheduled",
  "Broadcast is not currently sending",
  "Broadcast is not paused",
  "This broadcast is currently sending. Pause it before editing.",
  "This broadcast was already sent and can no longer be edited.",
])
const FALLBACK_ERROR = "Broadcast request failed."

export function getBroadcastErrorMessage(error: unknown): string {
  if (!(error instanceof Error)) return FALLBACK_ERROR
  return SAFE_ERROR_MESSAGES.has(error.message) ? error.message : FALLBACK_ERROR
}

function toListItem(row: NewsletterBroadcast): BroadcastListItem {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    status: row.status as BroadcastStatus,
    audienceLabel: describeAudienceFilter(
      parseAudienceFilter(row.audienceFilter)
    ),
    totalRecipients: row.totalRecipients,
    totalSent: row.totalSent,
    totalFailed: row.totalFailed,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    sent_at: row.sentAt?.toISOString() ?? null,
    updated_at: row.updatedAt.toISOString(),
  }
}

function toDetail(row: NewsletterBroadcast): BroadcastDetail {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    preheader: row.preheader,
    fromName: row.fromName,
    status: row.status as BroadcastStatus,
    blocks: parseStoredBlocks(row.blocks),
    audienceFilter: parseAudienceFilter(row.audienceFilter),
    dripConfig: parseDripConfig(row.dripConfig),
    pausedReason: row.pausedReason,
    totalRecipients: row.totalRecipients,
    totalSent: row.totalSent,
    totalFailed: row.totalFailed,
    batchesSent: row.batchesSent,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    sent_at: row.sentAt?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function toTemplateItem(
  row: NewsletterBroadcastTemplate
): BroadcastTemplateItem {
  return {
    id: row.id,
    name: row.name,
    isDefault: row.isDefault,
    blocks: parseStoredBlocks(row.blocks),
    updated_at: row.updatedAt.toISOString(),
  }
}

const listBroadcastsFn = createServerFn({ method: "GET" })
  .inputValidator(listSchema)
  .handler(
    async ({
      data,
    }): Promise<{ broadcasts: BroadcastListItem[]; total: number }> =>
      safeRequest(async () => {
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { listWorkspaceBroadcasts } = await import(
          "@/server/broadcasts/crud"
        )
        const { broadcasts, total } = await listWorkspaceBroadcasts(
          workspace.id,
          {
            search: data.search,
            limit: data.pageSize,
            offset: data.page * data.pageSize,
          }
        )
        return { broadcasts: broadcasts.map(toListItem), total }
      })
  )

const getBroadcastFn = createServerFn({ method: "GET" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { getWorkspaceBroadcast } = await import(
          "@/server/broadcasts/crud"
        )
        const row = await getWorkspaceBroadcast(workspace.id, data.broadcastId)
        if (!row) throw new Error("Broadcast not found")
        return toDetail(row)
      })
  )

const createBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(z.object({ name: nameSchema }))
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { createWorkspaceBroadcast } = await import(
          "@/server/broadcasts/crud"
        )
        return toDetail(await createWorkspaceBroadcast(workspace.id, data))
      })
  )

const updateBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(updateSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { updateWorkspaceBroadcast } = await import(
          "@/server/broadcasts/crud"
        )
        const { broadcastId, ...updates } = data
        const row = await updateWorkspaceBroadcast(workspace.id, {
          id: broadcastId,
          ...updates,
        })
        if (!row) throw new Error("Broadcast not found")
        return toDetail(row)
      })
  )

const duplicateBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { duplicateWorkspaceBroadcast } = await import(
          "@/server/broadcasts/crud"
        )
        const row = await duplicateWorkspaceBroadcast(
          workspace.id,
          data.broadcastId
        )
        if (!row) throw new Error("Broadcast not found")
        return toDetail(row)
      })
  )

const deleteBroadcastsFn = createServerFn({ method: "POST" })
  .inputValidator(idsSchema)
  .handler(
    async ({ data }): Promise<{ deleted: number }> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { deleteWorkspaceBroadcasts } = await import(
          "@/server/broadcasts/crud"
        )
        return {
          deleted: await deleteWorkspaceBroadcasts(
            workspace.id,
            data.broadcastIds
          ),
        }
      })
  )

const sendBroadcastNowFn = createServerFn({ method: "POST" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { startBroadcastSendNow } = await import(
          "@/server/broadcasts/send"
        )
        await startBroadcastSendNow(workspace.id, data.broadcastId)
        return refreshedDetail(workspace.id, data.broadcastId)
      })
  )

const scheduleBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(scheduleSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { scheduleBroadcast } = await import("@/server/broadcasts/send")
        await scheduleBroadcast(
          workspace.id,
          data.broadcastId,
          new Date(data.scheduledAt)
        )
        return refreshedDetail(workspace.id, data.broadcastId)
      })
  )

const cancelBroadcastScheduleFn = createServerFn({ method: "POST" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { cancelBroadcastSchedule } = await import(
          "@/server/broadcasts/send"
        )
        await cancelBroadcastSchedule(workspace.id, data.broadcastId)
        return refreshedDetail(workspace.id, data.broadcastId)
      })
  )

const pauseBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { pauseBroadcast } = await import("@/server/broadcasts/send")
        await pauseBroadcast(workspace.id, data.broadcastId)
        return refreshedDetail(workspace.id, data.broadcastId)
      })
  )

const resumeBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(broadcastIdSchema)
  .handler(
    async ({ data }): Promise<BroadcastDetail> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { resumeBroadcast } = await import("@/server/broadcasts/send")
        await resumeBroadcast(workspace.id, data.broadcastId)
        return refreshedDetail(workspace.id, data.broadcastId)
      })
  )

const sendTestBroadcastFn = createServerFn({ method: "POST" })
  .inputValidator(sendTestSchema)
  .handler(
    async ({ data }): Promise<{ ok: boolean; error?: string }> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { sendTestBroadcast } = await import("@/server/broadcasts/send")
        return sendTestBroadcast(workspace.id, data.broadcastId, data.email)
      })
  )

const countAudienceFn = createServerFn({ method: "GET" })
  .inputValidator(audienceSchema)
  .handler(
    async ({ data }): Promise<{ count: number }> =>
      safeRequest(async () => {
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { countBroadcastAudience } = await import(
          "@/server/broadcasts/send"
        )
        return {
          count: await countBroadcastAudience(workspace.id, data.filter),
        }
      })
  )

const listContactTagsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ tags: string[] }> =>
    safeRequest(async () => {
      const user = await requireUser()
      const workspace = await requireWorkspace(user.id)
      const { db } = await import("@/server/db")
      const { sql } = await import("drizzle-orm")
      const result = await db.execute(sql`
        SELECT DISTINCT unnest(tags) AS tag
        FROM newsletter_contacts
        WHERE workspace_id = ${workspace.id}
        ORDER BY tag ASC
        LIMIT 200
      `)
      return {
        tags: (result.rows as Array<{ tag: string }>).map((row) => row.tag),
      }
    })
)

const listTemplatesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ templates: BroadcastTemplateItem[] }> =>
    safeRequest(async () => {
      const user = await requireUser()
      const workspace = await requireWorkspace(user.id)
      const { listWorkspaceTemplates } = await import(
        "@/server/broadcasts/crud"
      )
      const rows = await listWorkspaceTemplates(workspace.id)
      return { templates: rows.map(toTemplateItem) }
    })
)

const createTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(createTemplateSchema)
  .handler(
    async ({ data }): Promise<BroadcastTemplateItem> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { createWorkspaceTemplate } = await import(
          "@/server/broadcasts/crud"
        )
        return toTemplateItem(await createWorkspaceTemplate(workspace.id, data))
      })
  )

const setDefaultTemplateFn = createServerFn({ method: "POST" })
  .inputValidator(setDefaultTemplateSchema)
  .handler(
    async ({ data }): Promise<BroadcastTemplateItem> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { setDefaultWorkspaceTemplate } = await import(
          "@/server/broadcasts/crud"
        )
        const row = await setDefaultWorkspaceTemplate(
          workspace.id,
          data.templateId,
          data.isDefault
        )
        if (!row) throw new Error("Template not found")
        return toTemplateItem(row)
      })
  )

const deleteTemplatesFn = createServerFn({ method: "POST" })
  .inputValidator(templateIdsSchema)
  .handler(
    async ({ data }): Promise<{ deleted: number }> =>
      safeRequest(async () => {
        await requireOrigin()
        const user = await requireUser()
        const workspace = await requireWorkspace(user.id)
        const { deleteWorkspaceTemplates } = await import(
          "@/server/broadcasts/crud"
        )
        return {
          deleted: await deleteWorkspaceTemplates(
            workspace.id,
            data.templateIds
          ),
        }
      })
  )

export function listBroadcasts(input: z.input<typeof listSchema> = {}) {
  return listBroadcastsFn({ data: input })
}

export function getBroadcast(broadcastId: string) {
  return getBroadcastFn({ data: { broadcastId } })
}

export function createBroadcast(name: string) {
  return createBroadcastFn({ data: { name } })
}

export function updateBroadcast(input: z.input<typeof updateSchema>) {
  return updateBroadcastFn({ data: input })
}

export function duplicateBroadcast(broadcastId: string) {
  return duplicateBroadcastFn({ data: { broadcastId } })
}

export function deleteBroadcasts(broadcastIds: string[]) {
  return deleteBroadcastsFn({ data: { broadcastIds } })
}

export function sendBroadcastNow(broadcastId: string) {
  return sendBroadcastNowFn({ data: { broadcastId } })
}

export function scheduleBroadcastAt(broadcastId: string, scheduledAt: string) {
  return scheduleBroadcastFn({ data: { broadcastId, scheduledAt } })
}

export function cancelBroadcastSchedule(broadcastId: string) {
  return cancelBroadcastScheduleFn({ data: { broadcastId } })
}

export function pauseBroadcast(broadcastId: string) {
  return pauseBroadcastFn({ data: { broadcastId } })
}

export function resumeBroadcast(broadcastId: string) {
  return resumeBroadcastFn({ data: { broadcastId } })
}

export function sendTestBroadcast(broadcastId: string, email: string) {
  return sendTestBroadcastFn({ data: { broadcastId, email } })
}

export function countBroadcastAudience(filter: BroadcastAudienceFilter) {
  return countAudienceFn({ data: { filter } })
}

export function listContactTags() {
  return listContactTagsFn()
}

export function listBroadcastTemplates() {
  return listTemplatesFn()
}

export function createBroadcastTemplate(
  name: string,
  blocks: BroadcastBlock[]
) {
  return createTemplateFn({ data: { name, blocks } })
}

export function setDefaultBroadcastTemplate(
  templateId: string,
  isDefault: boolean
) {
  return setDefaultTemplateFn({ data: { templateId, isDefault } })
}

export function deleteBroadcastTemplates(templateIds: string[]) {
  return deleteTemplatesFn({ data: { templateIds } })
}

async function refreshedDetail(workspaceId: string, broadcastId: string) {
  const { getWorkspaceBroadcast } = await import("@/server/broadcasts/crud")
  const row = await getWorkspaceBroadcast(workspaceId, broadcastId)
  if (!row) throw new Error("Broadcast not found")
  return toDetail(row)
}

async function requireOrigin() {
  const { requireAppOrigin } = await import("@/server/origin")
  requireAppOrigin()
}

async function requireUser() {
  const { findCurrentUser } = await import("@/server/security")
  const user = await findCurrentUser()
  if (!user) throw new Error("Missing Custom Shell session")
  return user
}

async function requireWorkspace(userId: string) {
  const { getOrCreateCurrentWorkspace } = await import("@/server/workspaces")
  return getOrCreateCurrentWorkspace(userId)
}

async function safeRequest<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const message = getBroadcastErrorMessage(error)
    if (message === FALLBACK_ERROR) {
      console.error("broadcast request failed", error)
    }
    throw new Error(message)
  }
}
