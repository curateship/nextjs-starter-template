import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  broadcastAudienceFilterSchema,
  broadcastBlocksSchema,
  parseAudienceFilter,
  parseStoredBlocks,
  broadcastBlockSchema,
  type BroadcastAudienceFilter,
  type BroadcastBlock,
  type BroadcastBlockDefaults,
} from "@/lib/broadcasts/blocks"
import {
  dripConfigSchema,
  parseDripConfig,
  type DripConfig,
} from "@/lib/broadcasts/drip"
import {
  cancelBroadcastSchedule,
  countBroadcastAudience,
  pauseBroadcast,
  resumeBroadcast,
  scheduleBroadcast,
  sendTestBroadcast,
  startBroadcastSendNow,
} from "@/server/email/broadcast-send"
import {
  createWorkspaceBroadcast,
  createWorkspaceTemplate,
  deleteWorkspaceBroadcasts,
  deleteWorkspaceTemplates,
  duplicateWorkspaceBroadcast,
  getWorkspaceBroadcast,
  listWorkspaceBroadcasts,
  listWorkspaceTemplates,
  sanitizeBlocks,
  setDefaultWorkspaceTemplate,
  updateWorkspaceBroadcast,
} from "@/server/email/broadcasts"
import { listBroadcastDeliveries } from "@/server/email/deliveries"
import { adminGet, adminPost } from "@/server/guards"
import {
  getOrCreateCurrentWorkspace,
  parseWorkspaceSettings,
  saveWorkspaceBroadcastBlockDefault,
} from "@/server/people/workspaces"
import type { CustomShellBroadcast } from "@/server/schema"

import { createErrorMessage } from "../error-message"

export type BroadcastStatus =
  | "draft"
  | "scheduled"
  | "sending"
  | "paused"
  | "sent"

export type BroadcastListItem = {
  id: string
  name: string
  subject: string
  status: BroadcastStatus
  totalRecipients: number
  totalSent: number
  totalFailed: number
  sent_at: string | null
  scheduled_at: string | null
  /** When the next batch may go, for a paced send that is between batches. */
  next_batch_at: string | null
  batchesSent: number
  updated_at: string
}

export type BroadcastDetail = BroadcastListItem & {
  preheader: string
  fromName: string | null
  blocks: BroadcastBlock[]
  audienceFilter: BroadcastAudienceFilter
  dripConfig: DripConfig
  pausedReason: string | null
  created_at: string
}

export type BroadcastsPage = {
  broadcasts: BroadcastListItem[]
  total: number
}

export type BroadcastTemplateItem = {
  id: string
  name: string
  blocks: BroadcastBlock[]
  isDefault: boolean
  updated_at: string
}

export type BroadcastDeliveryItem = {
  id: string
  toEmail: string
  status: "sent" | "failed"
  error: string | null
  created_at: string
}

export type BroadcastDeliveriesPage = {
  deliveries: BroadcastDeliveryItem[]
  hasMore: boolean
}

function toListItem(row: CustomShellBroadcast): BroadcastListItem {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    status: row.status as BroadcastStatus,
    totalRecipients: row.totalRecipients,
    totalSent: row.totalSent,
    totalFailed: row.totalFailed,
    sent_at: row.sentAt?.toISOString() ?? null,
    scheduled_at: row.scheduledAt?.toISOString() ?? null,
    next_batch_at: row.nextBatchAt?.toISOString() ?? null,
    batchesSent: row.batchesSent,
    updated_at: row.updatedAt.toISOString(),
  }
}

function toDetail(row: CustomShellBroadcast): BroadcastDetail {
  return {
    ...toListItem(row),
    preheader: row.preheader,
    fromName: row.fromName,
    blocks: parseStoredBlocks(row.blocks),
    audienceFilter: parseAudienceFilter(row.audienceFilter),
    dripConfig: parseDripConfig(row.dripConfig),
    pausedReason: row.pausedReason,
    created_at: row.createdAt.toISOString(),
  }
}

const broadcastErrorMessages: Record<string, string> = {
  NOT_FOUND: "That newsletter no longer exists.",
  NAME_REQUIRED: "Name the newsletter first.",
  SENDING: "This one is sending right now. Pause it before you edit it.",
  ALREADY_SENT: "This one has already gone out, so it can no longer be edited.",
  SUBJECT_REQUIRED: "Write a subject line before sending.",
  BLOCKS_REQUIRED: "Add something to the email before sending.",
  BUTTON_WITHOUT_LINK:
    "One of your buttons has no usable address. Give it one starting with https://, or take the button out.",
  EMAIL_NOT_CONFIGURED:
    "Email is not set up yet. Add a from-address in settings first.",
  UNSUBSCRIBE_NOT_CONFIGURED:
    "This server cannot sign unsubscribe links, so nothing can go out. Set CUSTOM_SHELL_SECRET_ENCRYPTION_KEY and try again.",
  NO_AUDIENCE: "Nobody matches that audience.",
  SEGMENT_GONE:
    "The segment this was going to has been deleted. Pick who it is for again.",
  NOT_SENDABLE: "Only a draft or a scheduled newsletter can be sent.",
  NOT_SCHEDULED: "That newsletter is not scheduled.",
  NOT_SENDING: "That newsletter is not sending right now.",
  NOT_PAUSED: "That newsletter is not paused.",
  TIME_IN_PAST: "Pick a time in the future.",
  DRIP_SETTINGS_INVALID:
    "Those batch settings contradict each other. Check the smallest is not bigger than the largest.",
  CREATE_FAILED: "We could not create that. Please try again.",
}

export const getBroadcastErrorMessage = createErrorMessage(
  broadcastErrorMessages,
  "We could not save that change. Please try again."
)

/** The same codes, said the way a page that would not open needs them said. */
export const getBroadcastLoadErrorMessage = createErrorMessage(
  broadcastErrorMessages,
  "We could not load your newsletters. Please try again."
)

const broadcastIdSchema = z.object({
  broadcastId: z.string().min(1).max(36),
})
const nameSchema = z.string().trim().min(1).max(255)

const listSchema = z.object({
  search: z.string().trim().max(200).optional(),
  limit: z.number().int().min(1).max(200).optional(),
  offset: z.number().int().min(0).optional(),
})

const updateSchema = broadcastIdSchema.extend({
  name: nameSchema.optional(),
  subject: z.string().max(500).optional(),
  preheader: z.string().max(500).optional(),
  fromName: z.string().max(255).nullable().optional(),
  blocks: broadcastBlocksSchema.optional(),
  audienceFilter: broadcastAudienceFilterSchema.optional(),
  dripConfig: dripConfigSchema.optional(),
})

const templateIdSchema = z.object({ templateId: z.string().min(1).max(36) })

async function currentWorkspaceId(userId: string) {
  return (await getOrCreateCurrentWorkspace(userId)).id
}

const loadBroadcastsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(listSchema)
  .handler(async ({ data, context }): Promise<BroadcastsPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const { broadcasts, total } = await listWorkspaceBroadcasts(
      workspaceId,
      data
    )
    return { broadcasts: broadcasts.map(toListItem), total }
  })

const getBroadcastFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const createBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(z.object({ name: nameSchema }))
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return toDetail(await createWorkspaceBroadcast(workspaceId, data))
  })

const updateBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(updateSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const { broadcastId, ...fields } = data
    const row = await updateWorkspaceBroadcast(workspaceId, {
      id: broadcastId,
      ...fields,
    })
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const duplicateBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const row = await duplicateWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const deleteBroadcastsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ broadcastIds: z.array(z.string().min(1).max(36)).max(200) })
  )
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      deleted: await deleteWorkspaceBroadcasts(workspaceId, data.broadcastIds),
    }
  })

const audienceCountFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ audienceFilter: broadcastAudienceFilterSchema }))
  .handler(async ({ data, context }): Promise<{ total: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      total: await countBroadcastAudience(workspaceId, data.audienceFilter),
    }
  })

const sendBroadcastNowFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await startBroadcastSendNow(workspaceId, data.broadcastId)
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const scheduleBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema.extend({ scheduledAt: z.iso.datetime() }))
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await scheduleBroadcast(
      workspaceId,
      data.broadcastId,
      new Date(data.scheduledAt)
    )
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const cancelScheduleFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await cancelBroadcastSchedule(workspaceId, data.broadcastId)
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const pauseBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await pauseBroadcast(workspaceId, data.broadcastId)
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const resumeBroadcastFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema)
  .handler(async ({ data, context }): Promise<BroadcastDetail> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    await resumeBroadcast(workspaceId, data.broadcastId)
    const row = await getWorkspaceBroadcast(workspaceId, data.broadcastId)
    if (!row) throw new Error("NOT_FOUND")
    return toDetail(row)
  })

const sendTestFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(broadcastIdSchema.extend({ toEmail: z.email() }))
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; error?: string }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return sendTestBroadcast(workspaceId, data.broadcastId, data.toEmail)
    }
  )

const loadDeliveriesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    broadcastIdSchema.extend({
      limit: z.number().int().min(1).max(100).optional(),
      offset: z.number().int().min(0).optional(),
    })
  )
  .handler(async ({ data, context }): Promise<BroadcastDeliveriesPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const { deliveries, hasMore } = await listBroadcastDeliveries(
      workspaceId,
      data.broadcastId,
      { limit: data.limit, offset: data.offset }
    )
    return {
      hasMore,
      deliveries: deliveries.map((row) => ({
        id: row.id,
        toEmail: row.toEmail,
        status: row.status as "sent" | "failed",
        error: row.error,
        created_at: row.createdAt.toISOString(),
      })),
    }
  })

const loadTemplatesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ templates: BroadcastTemplateItem[] }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const rows = await listWorkspaceTemplates(workspaceId)
    return {
      templates: rows.map((row) => ({
        id: row.id,
        name: row.name,
        blocks: parseStoredBlocks(row.blocks),
        isDefault: row.isDefault,
        updated_at: row.updatedAt.toISOString(),
      })),
    }
  })

const createTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ name: nameSchema, blocks: broadcastBlocksSchema })
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const created = await createWorkspaceTemplate(workspaceId, data)
    return { id: created.id }
  })

const setDefaultTemplateFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(templateIdSchema.extend({ isDefault: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ ok: boolean }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const updated = await setDefaultWorkspaceTemplate(
      workspaceId,
      data.templateId,
      data.isDefault
    )
    if (!updated) throw new Error("NOT_FOUND")
    return { ok: true }
  })

/**
 * How each kind of block starts out in this workspace, and the one call that
 * changes it. Editing a block in the left panel — one that is in no email — is
 * editing this, so it saves as you type, the same as the email itself does.
 */
const loadBlockDefaultsFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<{ defaults: BroadcastBlockDefaults }> => {
    const workspace = await getOrCreateCurrentWorkspace(context.user.id)
    return { defaults: parseWorkspaceSettings(workspace.settings).broadcastBlockDefaults }
  })

const saveBlockDefaultFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  // A whole block, checked by the one schema that already describes blocks. Its
  // id is dropped on the way in — what is saved is the setup, not a block.
  .inputValidator(z.object({ block: broadcastBlockSchema }))
  .handler(async ({ data, context }): Promise<{ defaults: BroadcastBlockDefaults }> => {
    return {
      defaults: await saveWorkspaceBroadcastBlockDefault(
        context.user.id,
        // Through the same cleaner as every other way markup gets stored. A
        // saved rich-text setup is written into new blocks and drawn on the
        // page before the email it lands in has saved itself once, so markup
        // left dirty here would run in the next admin's browser.
        sanitizeBlocks([data.block])[0]
      ),
    }
  })

const deleteTemplatesFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ templateIds: z.array(z.string().min(1).max(36)).max(200) })
  )
  .handler(async ({ data, context }): Promise<{ deleted: number }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return {
      deleted: await deleteWorkspaceTemplates(workspaceId, data.templateIds),
    }
  })

export function loadBroadcastsPage(
  options: { search?: string; limit?: number; offset?: number } = {}
) {
  return loadBroadcastsPageFn({ data: options })
}

export function getBroadcast(broadcastId: string) {
  return getBroadcastFn({ data: { broadcastId } })
}

export function createBroadcast(name: string) {
  return createBroadcastFn({ data: { name } })
}

export function updateBroadcast(
  input: z.input<typeof updateSchema>
): Promise<BroadcastDetail> {
  return updateBroadcastFn({ data: input })
}

export function duplicateBroadcast(broadcastId: string) {
  return duplicateBroadcastFn({ data: { broadcastId } })
}

export function deleteBroadcasts(broadcastIds: string[]) {
  return deleteBroadcastsFn({ data: { broadcastIds } })
}

export function countAudience(audienceFilter: BroadcastAudienceFilter) {
  return audienceCountFn({ data: { audienceFilter } })
}

export function sendBroadcastNow(broadcastId: string) {
  return sendBroadcastNowFn({ data: { broadcastId } })
}

export function scheduleBroadcastSend(broadcastId: string, scheduledAt: string) {
  return scheduleBroadcastFn({ data: { broadcastId, scheduledAt } })
}

export function cancelBroadcastScheduleSend(broadcastId: string) {
  return cancelScheduleFn({ data: { broadcastId } })
}

export function pauseBroadcastSend(broadcastId: string) {
  return pauseBroadcastFn({ data: { broadcastId } })
}

export function resumeBroadcastSend(broadcastId: string) {
  return resumeBroadcastFn({ data: { broadcastId } })
}

export function sendTestEmail(broadcastId: string, toEmail: string) {
  return sendTestFn({ data: { broadcastId, toEmail } })
}

export function loadBroadcastDeliveries(
  broadcastId: string,
  options: { limit?: number; offset?: number } = {}
) {
  return loadDeliveriesFn({ data: { broadcastId, ...options } })
}

export function loadBroadcastTemplates() {
  return loadTemplatesFn()
}

export function createBroadcastTemplate(name: string, blocks: BroadcastBlock[]) {
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

export function loadBroadcastBlockDefaults() {
  return loadBlockDefaultsFn()
}

export function saveBroadcastBlockDefault(block: BroadcastBlock) {
  return saveBlockDefaultFn({ data: { block } })
}
