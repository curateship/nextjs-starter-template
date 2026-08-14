import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  AUDIENCE_KINDS,
  type AutomationAudienceKind,
} from "@/lib/automations/nodes/audience"
import {
  MissingAudiencePlanError,
  MissingAudienceSegmentError,
  previewAutomationAudience,
  type AudiencePreview,
} from "@/server/automations/audience"
import { syncContactsFromUsers } from "@/server/people/contacts"
import { adminGet } from "@/server/guards"
import { requireCurrentWorkspace } from "@/server/people/workspaces"
import {
  MEMBER_TAG_MAX_LENGTH,
  MEMBER_TAG_SEPARATOR,
  normalizeMemberTag,
} from "@/lib/member-tags"

import { createErrorMessage } from "../error-message"

export type {
  AudiencePreview,
  AudienceSampleContact,
} from "@/server/automations/audience"

const audiencePreviewMessages: Record<string, string> = {
  AUDIENCE_PLAN_MISSING:
    "That plan no longer exists, so nobody can be counted for it. Pick another one.",
  AUDIENCE_SEGMENT_MISSING:
    "That segment no longer exists, so nobody can be counted for it. Pick another one.",
}

export const getAudiencePreviewErrorMessage = createErrorMessage(
  audiencePreviewMessages,
  "We could not work out who this matches. Please try again."
)

/**
 * Who an audience choice matches right now, while somebody is still building
 * the flow.
 *
 * Reads through exactly the same resolver a run does, and brings the contact
 * list up to date with the accounts first for the same reason the running step
 * does — so the number in the panel is the number the run will report, not a
 * near miss.
 *
 * The two "it has been deleted" failures are turned into codes here. Their own
 * sentences are written for the run history, where the reader is looking at a
 * flow that already failed; in the panel the useful thing to say is which
 * dropdown to go and fix.
 */
const loadAudiencePreviewFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .inputValidator(
    z.object({
      audience: z.enum(AUDIENCE_KINDS),
      planSlug: z.string().trim().max(50).default(""),
      segmentId: z.string().trim().max(36).default(""),
      tag: z
        .string()
        .trim()
        .max(MEMBER_TAG_MAX_LENGTH)
        .refine((tag) => !tag.includes(MEMBER_TAG_SEPARATOR))
        .transform(normalizeMemberTag)
        .default(""),
    })
  )
  .handler(async ({ data, context }): Promise<AudiencePreview> => {
    const workspace = await requireCurrentWorkspace(context.user.id)
    await syncContactsFromUsers(workspace.id)

    try {
      return await previewAutomationAudience(
        {
          kind: data.audience,
          planSlug: data.audience === "plan" ? data.planSlug : "",
          segmentId: data.audience === "segment" ? data.segmentId : "",
          tag: data.audience === "tag" ? data.tag : "",
        },
        workspace.id
      )
    } catch (error) {
      if (error instanceof MissingAudiencePlanError) {
        throw new Error("AUDIENCE_PLAN_MISSING")
      }
      if (error instanceof MissingAudienceSegmentError) {
        throw new Error("AUDIENCE_SEGMENT_MISSING")
      }
      throw error
    }
  })

export function loadAudiencePreview(input: {
  audience: AutomationAudienceKind
  planSlug: string
  segmentId: string
  tag: string
}) {
  return loadAudiencePreviewFn({ data: input })
}
