import { MailIcon } from "lucide-react"
import { z } from "zod"

import {
  broadcastBlocksSchema,
  createStarterBlocks,
  safeLinkUrl,
} from "@/lib/broadcasts/blocks"

import type { AutomationGraph, AutomationNode } from "../graph"
import { defineNode } from "../node-descriptor"
import { audienceWording, isAudienceKind } from "./audience"

export const sendEmailDraftSettingsSchema = z.object({
  subject: z
    .string()
    .max(200, "Keep the subject to 200 characters or fewer.")
    .refine((subject) => !/[\r\n]/.test(subject), {
      message: "Keep the subject on one line.",
    }),
  preheader: z
    .string()
    .max(300, "Keep the preview line to 300 characters or fewer.")
    .refine((preheader) => !/[\r\n]/.test(preheader), {
      message: "Keep the preview line on one line.",
    }),
  fromName: z
    .string()
    .max(120, "Keep the sender name to 120 characters or fewer.")
    .refine((fromName) => !/[\r\n]/.test(fromName), {
      message: "Keep the sender name on one line.",
    }),
  blocks: broadcastBlocksSchema,
})

export const sendEmailSettingsSchema = sendEmailDraftSettingsSchema.superRefine(
  (settings, context) => {
    if (!settings.subject.trim()) {
      context.addIssue({
        code: "custom",
        path: ["subject"],
        message: "Write a subject before this flow can run.",
      })
    }
    if (settings.blocks.length === 0) {
      context.addIssue({
        code: "custom",
        path: ["blocks"],
        message: "Add at least one block before this flow can run.",
      })
    }
    settings.blocks.forEach((block, index) => {
      if (block.kind !== "button" || safeLinkUrl(block.content.url)) return
      context.addIssue({
        code: "custom",
        path: ["blocks", index, "content", "url"],
        message:
          "Give every button a complete, safe link before this flow can run.",
      })
    })
  }
)

export type SendEmailSettings = z.infer<typeof sendEmailSettingsSchema>
export type SendEmailDraftSettings = z.infer<
  typeof sendEmailDraftSettingsSchema
>

/** Refuses unreadable saved settings instead of sending guessed-at wording. */
export function readSendEmailSettings(
  settings: Record<string, unknown>
): SendEmailSettings {
  return sendEmailSettingsSchema.parse(settings)
}

export function readSendEmailDraftSettings(
  settings: Record<string, unknown>
): SendEmailDraftSettings {
  return sendEmailDraftSettingsSchema.parse(settings)
}

/**
 * The closest Audience step feeding this one, for the inspector's plain
 * recipient line. A flow that joins two paths at the same distance is left
 * unnamed rather than showing one of them as if it were certain.
 */
export function upstreamAudienceNode(
  graph: Pick<AutomationGraph, "nodes" | "edges">,
  nodeId: string
): AutomationNode | null {
  const nodes = new Map(graph.nodes.map((node) => [node.id, node]))
  const visited = new Set([nodeId])
  let frontier = [nodeId]

  while (frontier.length > 0) {
    const parentIds = Array.from(
      new Set(
        graph.edges
          .filter((edge) => frontier.includes(edge.to))
          .map((edge) => edge.from)
          .filter((id) => !visited.has(id))
      )
    )
    const audiences = parentIds
      .map((id) => nodes.get(id))
      .filter((node): node is AutomationNode => node?.kind === "audience")
    if (audiences.length === 1) return audiences[0]
    if (audiences.length > 1) return null

    for (const id of parentIds) visited.add(id)
    frontier = parentIds
  }

  return null
}

/** The words shown beside “Who this goes to” in the inspector. */
export function sendEmailAudienceWording(
  graph: Pick<AutomationGraph, "nodes" | "edges"> | undefined,
  nodeId: string
): string {
  const node = graph ? upstreamAudienceNode(graph, nodeId) : null
  if (!node || !isAudienceKind(node.settings.audience)) {
    return "The member this run is about. A run started by hand has no recipient unless an Audience step comes first."
  }

  const wording = audienceWording(
    node.settings.audience,
    typeof node.settings.planSlug === "string" ? node.settings.planSlug : "",
    typeof node.settings.segmentName === "string"
      ? node.settings.segmentName
      : "",
    typeof node.settings.tag === "string" ? node.settings.tag : ""
  )
  return wording.charAt(0).toUpperCase() + wording.slice(1) + "."
}

export const sendEmailNode = defineNode({
  kind: "sendEmail",
  palette: {
    key: "action-send-email",
    group: "Actions",
    description: "Email this run's audience and record every delivery",
  },
  createSettings: () => ({
    subject: "",
    preheader: "",
    fromName: "",
    blocks: createStarterBlocks(),
  }),
  settingsSchema: sendEmailSettingsSchema,
  name: () => "Send email",
  description: (settings) => {
    const subject =
      typeof settings.subject === "string" ? settings.subject.trim() : ""
    return subject ? `Subject: ${subject}` : "Build the email and add a subject"
  },
  icon: MailIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/send-email-panel"),
})
