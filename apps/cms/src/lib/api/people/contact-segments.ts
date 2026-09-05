import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  MAX_SEGMENT_DESCRIPTION_LENGTH,
  MAX_SEGMENT_NAME_LENGTH,
  SEGMENT_KINDS,
  parseSegmentRules,
  segmentRulesSchema,
  type SegmentKind,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import {
  contactFilterSchema,
  type ContactFilterInput,
} from "@/lib/contacts/contact-filter"
import {
  addContactsToSegment,
  addMatchingContactsToSegment,
  countDraftSegmentContacts,
  createWorkspaceSegment,
  deleteWorkspaceSegments,
  listSegmentMembers,
  listSegmentNames,
  listWorkspaceContactSources,
  listWorkspaceSegments,
  updateWorkspaceSegment,
  type SegmentDeleteResult,
} from "@/server/people/contact-segments"
import { listWorkspaceTags, syncContactsFromUsers } from "@/server/people/contacts"
import { adminGet, adminPost } from "@/server/guards"
import { listPlans } from "@/server/billing/plans"
import { currentWorkspaceId } from "@/server/people/workspaces"

import { createErrorMessage } from "../error-message"

export type SegmentItem = {
  id: string
  name: string
  description: string
  kind: SegmentKind
  rules: SegmentRules
  /** How many contacts are in it right now, worked out fresh on this read. */
  total: number
  created_at: string
  updated_at: string
}

export type SegmentsPage = {
  segments: SegmentItem[]
  /** Everything the rule builder offers, so it can only ever name real things. */
  tags: string[]
  sources: string[]
  plans: { slug: string; name: string }[]
}

const segmentErrorMessages: Record<string, string> = {
  SEGMENT_NOT_FOUND: "That segment no longer exists.",
  SEGMENT_NAME_REQUIRED: "Give the segment a name.",
  SEGMENT_NAME_TAKEN: "A segment with that name is already here.",
  SEGMENT_RULE_INCOMPLETE:
    "One of the rules is not finished. Fill it in or take it out.",
  SEGMENT_PLAN_MISSING: "That plan no longer exists, so the rule cannot be saved.",
  SEGMENT_REFERENCE_MISSING:
    "One of the segments this one uses no longer exists.",
  SEGMENT_LOOP:
    "A segment cannot use itself, or use another segment that points back to it.",
  SEGMENT_IS_RULES:
    "That segment works itself out from its rules, so people cannot be added to it by hand.",
  SEGMENT_CONTACT_MISSING: "One of the people picked is no longer a contact.",
  SEGMENT_SAVE_FAILED: "We could not save that. Please try again.",
}

export const getSegmentErrorMessage = createErrorMessage(
  segmentErrorMessages,
  "We could not save that change. Please try again."
)

export const getSegmentLoadErrorMessage = createErrorMessage(
  segmentErrorMessages,
  "We could not load your segments. Please try again."
)

const segmentInputSchema = z.object({
  name: z.string().trim().min(1, "SEGMENT_NAME_REQUIRED").max(MAX_SEGMENT_NAME_LENGTH),
  description: z.string().trim().max(MAX_SEGMENT_DESCRIPTION_LENGTH).default(""),
  kind: z.enum(SEGMENT_KINDS),
  rules: segmentRulesSchema,
  contactIds: z.array(z.string().min(1).max(36)).max(1000).default([]),
})

export type SegmentFormInput = z.input<typeof segmentInputSchema>


const loadSegmentsPageFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<SegmentsPage> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    // The same first move the contacts page makes: bring the list up to date
    // with who has signed up, so a segment's count and the contacts list are
    // counting the same people.
    await syncContactsFromUsers(workspaceId)

    const [items, tags, sources, plans] = await Promise.all([
      listWorkspaceSegments(workspaceId),
      listWorkspaceTags(workspaceId),
      listWorkspaceContactSources(workspaceId),
      listPlans(),
    ])

    return {
      tags,
      sources,
      plans: plans.map((plan) => ({ slug: plan.slug, name: plan.name })),
      segments: items.map(({ segment, rules, total }) => ({
        id: segment.id,
        name: segment.name,
        description: segment.description,
        kind: segment.kind === "static" ? "static" : "rules",
        rules,
        total,
        created_at: segment.createdAt.toISOString(),
        updated_at: segment.updatedAt.toISOString(),
      })),
    }
  })

export type SegmentChoice = {
  id: string
  name: string
  kind: SegmentKind
}

/**
 * Just the segments' names, for a dropdown that points a flow at one — the
 * full page load above syncs contacts and counts every segment, which is far
 * more work than a list of names needs.
 */
const listSegmentChoicesFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<SegmentChoice[]> => {
    return listSegmentNames(await currentWorkspaceId(context.user.id))
  })

const loadSegmentMembersFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(z.object({ segmentId: z.string().min(1).max(36) }))
  .handler(
    async ({
      data,
      context,
    }): Promise<{ members: { id: string; email: string }[] }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return {
        members: await listSegmentMembers(workspaceId, data.segmentId),
      }
    }
  )

const saveSegmentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      segmentId: z.string().min(1).max(36).nullable().default(null),
      segment: segmentInputSchema,
    })
  )
  .handler(async ({ data, context }): Promise<{ id: string }> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    // Parsed rather than trusted: the shape the browser sent has already been
    // checked, and this is what drops anything that got past it.
    const input = {
      ...data.segment,
      rules: parseSegmentRules(data.segment.rules),
    }
    const saved = data.segmentId
      ? await updateWorkspaceSegment(workspaceId, data.segmentId, input)
      : await createWorkspaceSegment(workspaceId, input)
    return { id: saved.id }
  })

const countDraftSegmentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(segmentRulesSchema)
  .handler(
    async ({ data, context }): Promise<{ matching: number; everyone: number }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return countDraftSegmentContacts(
        workspaceId,
        // The validator above is the trust boundary. The database only sees
        // the checked shape, never the browser's original object.
        parseSegmentRules(data)
      )
    }
  )

const deleteSegmentsFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({ segmentIds: z.array(z.string().min(1).max(36)).max(200) })
  )
  .handler(async ({ data, context }): Promise<SegmentDeleteResult> => {
    const workspaceId = await currentWorkspaceId(context.user.id)
    return deleteWorkspaceSegments(workspaceId, data.segmentIds)
  })

const addToSegmentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    z.object({
      segmentId: z.string().min(1).max(36),
      contactIds: z.array(z.string().min(1).max(36)).min(1).max(500),
    })
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ added: number; alreadyThere: number }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return addContactsToSegment(workspaceId, data.segmentId, data.contactIds)
    }
  )

/**
 * Puts everybody the contacts list's filters match into a hand-picked segment.
 *
 * The ticked-rows path above caps at 500 ids; this one carries no ids at all,
 * so a filter matching thousands goes in one request and means exactly the
 * people the list was showing.
 */
const addMatchingToSegmentFn = createServerFn({ method: "POST" })
  .middleware([adminPost])
  .inputValidator(
    contactFilterSchema.extend({ segmentId: z.string().min(1).max(36) })
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ added: number; alreadyThere: number }> => {
      const workspaceId = await currentWorkspaceId(context.user.id)
      return addMatchingContactsToSegment(workspaceId, data.segmentId, {
        search: data.search,
        rules: data.rules,
      })
    }
  )

export function loadSegmentsPage() {
  return loadSegmentsPageFn()
}

export function loadSegmentChoices() {
  return listSegmentChoicesFn()
}

export function addContactsToWorkspaceSegment(
  segmentId: string,
  contactIds: string[]
) {
  return addToSegmentFn({ data: { segmentId, contactIds } })
}

export function addMatchingContactsToWorkspaceSegment(
  segmentId: string,
  filter: ContactFilterInput
) {
  return addMatchingToSegmentFn({ data: { ...filter, segmentId } })
}

export function loadSegmentMembers(segmentId: string) {
  return loadSegmentMembersFn({ data: { segmentId } })
}

export function saveSegment(
  segmentId: string | null,
  segment: SegmentFormInput
) {
  return saveSegmentFn({ data: { segmentId, segment } })
}

export function countDraftSegment(rules: SegmentRules) {
  return countDraftSegmentFn({ data: rules })
}

export function deleteSegments(segmentIds: string[]) {
  return deleteSegmentsFn({ data: { segmentIds } })
}
