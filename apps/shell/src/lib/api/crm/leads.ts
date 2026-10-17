import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  CRM_MAX_VALUE_CENTS,
  CRM_STAGES,
  type CrmStage,
} from "@/lib/crm/crm"
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
}

export type LeadBundle = { lead: LeadPanel }

const leadSchema = z.object({ leadId: z.string().min(1).max(36) })

const loadLeadFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(leadSchema)
  .handler(async ({ data, context }): Promise<LeadBundle> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    const lead = await getLead(workspaceId, data.leadId)
    if (!lead) throw new Error("CRM_LEAD_NOT_FOUND")

    return {
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
  { CRM_LEAD_NOT_FOUND: "That lead is no longer here." },
  "That did not save. Try again."
)
