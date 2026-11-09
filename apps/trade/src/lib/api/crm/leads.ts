import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CRM_MAX_VALUE_CENTS,
  CRM_STAGES,
  type CrmStage,
} from "@/lib/crm/crm"
import { CRM_LEAD_TAG_MAX_LENGTH } from "@/lib/crm/lead-tags"
import { changeLeadTag, listLeadTags, listWorkspaceLeadTags } from "@/server/crm/lead-tags"
import { addLeadToContacts, getLead, updateLead } from "@/server/crm/leads"
import { adminGet, adminPost } from "@/server/guards"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

export type LeadPanel = {
  id: string
  email: string
  name: string | null
  company: string | null
  phone: string | null
  source: string | null
  stage: CrmStage
  /** Cents. Every screen that shows it divides by 100 and says dollars. */
  valueCents: number
  follow_up_at: string | null
  followUpNote: string | null
  /** The newsletter contact they are, or null when they are not one. */
  contactId: string | null
  created_at: string
  /** What kind of lead it is, A to Z (CRM task 27). */
  tags: string[]
}

export type LeadBundle = {
  lead: LeadPanel
  /** Every tag the site uses, for picking one already in use. */
  siteTags: string[]
}

const leadSchema = z.object({ leadId: z.string().min(1).max(36) })

const loadLeadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(leadSchema)
  .handler(async ({ data, context }): Promise<LeadBundle> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const lead = await getLead(workspaceId, data.leadId)
    if (!lead) throw new Error("CRM_LEAD_NOT_FOUND")
    const [tags, siteTags] = await Promise.all([
      listLeadTags([lead.id]),
      listWorkspaceLeadTags(workspaceId),
    ])

    return {
      siteTags,
      lead: {
        id: lead.id,
        email: lead.email,
        name: lead.name,
        company: lead.company,
        phone: lead.phone,
        source: lead.source,
        stage: lead.stage,
        valueCents: lead.valueCents,
        follow_up_at: lead.followUpAt?.toISOString() ?? null,
        followUpNote: lead.followUpNote,
        contactId: lead.contactId,
        created_at: lead.createdAt.toISOString(),
        tags: tags.get(lead.id) ?? [],
      },
    }
  })

/**
 * Changes one field of a lead.
 *
 * Every field is optional and only what was sent is written, which is what
 * lets the panel save a box as it is left rather than posting the whole record
 * and overwriting somebody else's change.
 */
const saveLeadSchema = leadSchema.extend({
  name: z.string().trim().max(255).nullable().optional(),
  company: z.string().trim().max(255).nullable().optional(),
  phone: z.string().trim().max(60).nullable().optional(),
  stage: z.enum(CRM_STAGES).optional(),
  valueCents: z.number().int().min(0).max(CRM_MAX_VALUE_CENTS).optional(),
  followUpAt: z.string().datetime().nullable().optional(),
  followUpNote: z.string().trim().max(2000).nullable().optional(),
})

const saveLeadFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(saveLeadSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const { leadId, followUpAt, ...rest } = data
    const changed = await updateLead(workspaceId, leadId, {
      ...rest,
      // Undefined means "not mentioned", so it has to survive the trip rather
      // than becoming null here.
      ...(followUpAt === undefined
        ? {}
        : { followUpAt: followUpAt ? new Date(followUpAt) : null }),
    })
    if (!changed) throw new Error("CRM_LEAD_NOT_FOUND")
    return { changed }
  })

const addToContactsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(leadSchema)
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const result = await addLeadToContacts(workspaceId, data.leadId)
    if (!result) throw new Error("CRM_LEAD_NOT_FOUND")
    return result
  })

/** Adds or takes away one tag on a lead. */
const changeTagFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    leadSchema.extend({
      mode: z.enum(["add", "remove"]),
      tag: z.string().trim().min(1).max(CRM_LEAD_TAG_MAX_LENGTH),
    })
  )
  .handler(async ({ data, context }) => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return { change: await changeLeadTag(workspaceId, data.leadId, data.mode, data.tag) }
  })

export function changeLeadTagOn(leadId: string, mode: "add" | "remove", tag: string) {
  return changeTagFn({ data: { leadId, mode, tag } })
}

export function loadLead(leadId: string) {
  return loadLeadFn({ data: { leadId } })
}

export function saveLead(input: z.input<typeof saveLeadSchema>) {
  return saveLeadFn({ data: input })
}

export function addLeadToContactList(leadId: string) {
  return addToContactsFn({ data: { leadId } })
}

export const getLeadErrorMessage = createErrorMessage(
  {
    CRM_LEAD_NOT_FOUND: "That lead is no longer here.",
    CRM_LEAD_TAG_INVALID: "A tag is a short word or two, with no comma.",
    CRM_LEAD_TAG_LIMIT: "That lead has 30 tags, the most it can hold. Take one off first.",
  },
  "That did not save. Try again."
)
