import { z } from "zod"

export const AUTOMATION_NODE_KINDS = [
  "trigger",
  "sendEmail",
  "delay",
  "branch",
  "tag",
  "webhook",
] as const

export type AutomationNodeKind = (typeof AUTOMATION_NODE_KINDS)[number]

export const DELAY_UNITS = ["minutes", "hours", "days"] as const
export type DelayUnit = (typeof DELAY_UNITS)[number]

export const DELAY_UNIT_MS: Record<DelayUnit, number> = {
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
}

export const MAX_DELAY_MS = 180 * DELAY_UNIT_MS.days

const tagListSchema = z
  .array(z.string().trim().min(1).max(100))
  .max(50)
  .default([])

export const triggerSettingsSchema = z.object({
  source: z.string().trim().max(100).default(""),
  tags: tagListSchema,
})

export const sendEmailSettingsSchema = z.object({
  subject: z.string().trim().min(1).max(500),
  body: z.string().trim().min(1).max(100_000),
  preheader: z.string().trim().max(500).default(""),
})

export const delaySettingsSchema = z
  .object({
    amount: z.number().int().min(1).max(10_000),
    unit: z.enum(DELAY_UNITS),
  })
  .refine((value) => value.amount * DELAY_UNIT_MS[value.unit] <= MAX_DELAY_MS, {
    message: "Delay cannot exceed 180 days",
  })

export const BRANCH_FIELDS = ["tag", "source", "email"] as const
export type BranchField = (typeof BRANCH_FIELDS)[number]

export const BRANCH_OPS = ["has", "is", "contains"] as const
export type BranchOp = (typeof BRANCH_OPS)[number]

export const BRANCH_OPS_BY_FIELD: Record<BranchField, BranchOp[]> = {
  tag: ["has", "contains"],
  source: ["is", "contains"],
  email: ["is", "contains"],
}

export const branchSettingsSchema = z
  .object({
    field: z.enum(BRANCH_FIELDS),
    op: z.enum(BRANCH_OPS),
    value: z.string().trim().min(1).max(255),
  })
  .refine((value) => BRANCH_OPS_BY_FIELD[value.field].includes(value.op), {
    message: "Condition does not match the selected field",
  })

export const tagSettingsSchema = z.object({
  mode: z.enum(["add", "remove"]),
  tags: z.array(z.string().trim().min(1).max(100)).min(1).max(50),
})

export const webhookSettingsSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1)
    .max(2000)
    .refine((value) => {
      try {
        const url = new URL(value)
        return url.protocol === "http:" || url.protocol === "https:"
      } catch {
        return false
      }
    }, "Webhook URL must be a valid http(s) URL"),
  note: z.string().trim().max(500).default(""),
})

export const AUTOMATION_NODE_SETTINGS_SCHEMAS = {
  trigger: triggerSettingsSchema,
  sendEmail: sendEmailSettingsSchema,
  delay: delaySettingsSchema,
  branch: branchSettingsSchema,
  tag: tagSettingsSchema,
  webhook: webhookSettingsSchema,
} as const

const compiledNodeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("trigger"), settings: triggerSettingsSchema }),
  z.object({ kind: z.literal("sendEmail"), settings: sendEmailSettingsSchema }),
  z.object({ kind: z.literal("delay"), settings: delaySettingsSchema }),
  z.object({ kind: z.literal("branch"), settings: branchSettingsSchema }),
  z.object({ kind: z.literal("tag"), settings: tagSettingsSchema }),
  z.object({ kind: z.literal("webhook"), settings: webhookSettingsSchema }),
])

export const compiledConfigSchema = z.object({
  v: z.literal(1),
  kind: z.literal("newsletterAutomation"),
  entryNodeId: z.string().min(1),
  nodes: z.record(z.string(), compiledNodeSchema),
  edges: z.array(
    z.object({
      from: z.string().min(1),
      sourcePort: z.string().nullish(),
      to: z.string().min(1),
    })
  ),
})

export type CompiledNode = z.infer<typeof compiledNodeSchema>
export type CompiledConfig = z.infer<typeof compiledConfigSchema>

/**
 * Resolves the node that follows `fromNodeId`. Branch nodes must pass the
 * chosen output port ("yes" | "no"); single-output nodes take their first
 * outgoing edge regardless of the edge's sourcePort. Returns null when the
 * path ends.
 */
export function nextNodeId(
  config: CompiledConfig,
  fromNodeId: string,
  port?: string
): string | null {
  for (const edge of config.edges) {
    if (edge.from !== fromNodeId) continue
    if (port !== undefined && edge.sourcePort !== port) continue
    return edge.to
  }
  return null
}
