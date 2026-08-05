import { z } from "zod"

/**
 * The automation canvas document. Nodes carry their per-kind settings in a
 * generic `settings` bag; what those settings mean is defined by the node's
 * descriptor in the registry (`node-registry.ts`). Keeping the stored shape
 * generic means a saved graph never becomes unreadable because a node kind was
 * renamed or removed — unknown kinds still parse, render as "unsupported", and
 * are reported at compile time instead of crashing the page.
 */
/**
 * One value inside a node's settings bag.
 *
 * Settings are stored as JSON and travel to the browser inside the loader's
 * answer, so this says exactly that: anything JSON can hold, and nothing else.
 * It used to be `unknown`, which is not the same claim — the router cannot
 * prove `unknown` is safe to send, so it refused, and the refusal spread up
 * until the whole automation editor screen lost its type. Every reader already
 * narrows with `typeof` before using a setting, so nothing here loses safety.
 */
export type AutomationSettingValue =
  | string
  | number
  | boolean
  | null
  | AutomationSettingValue[]
  | { [key: string]: AutomationSettingValue }

export type AutomationNode = {
  id: string
  kind: string
  x: number
  y: number
  settings: Record<string, AutomationSettingValue>
}

export type AutomationSourcePort = string

export type AutomationEdge = {
  id: string
  from: string
  sourcePort: AutomationSourcePort
  to: string
}

export type AutomationViewport = { x: number; y: number; zoom: number }

export type AutomationGraph = {
  nodes: AutomationNode[]
  edges: AutomationEdge[]
  viewport: AutomationViewport
}

export type AutomationValidationError = {
  code:
    | "duplicate_id"
    | "missing_node"
    | "invalid_port"
    | "invalid_edge"
    | "invalid_settings"
    | "unknown_node"
    | "cycle"
    | "fan_out"
    | "empty"
    | "limit"
  nodeId?: string
  edgeId?: string
  message: string
}

/**
 * The same claim as `AutomationSettingValue` above, made to zod. `z.lazy` is
 * how a schema refers to itself, which is what nesting needs.
 */
export const automationSettingValueSchema: z.ZodType<AutomationSettingValue> = z.lazy(
  () =>
    z.union([
      z.string(),
      z.number(),
      z.boolean(),
      z.null(),
      z.array(automationSettingValueSchema),
      z.record(z.string(), automationSettingValueSchema),
    ])
)

const idSchema = z.string().min(1).max(64)

// The maximum stored size of one graph document. The node/edge count limits
// bound the structure; this bounds free-text settings so a single automation
// row can't balloon the workspace payloads that load it.
const MAX_GRAPH_JSON_LENGTH = 200_000

// The DRAFT schema is deliberately lenient: structure only, so half-filled
// nodes always save as drafts. Strict per-kind settings validation happens at
// compile time through each node descriptor's settings schema.
export const automationGraphSchema = z
  .object({
    nodes: z
      .array(
        z.object({
          id: idSchema,
          kind: z.string().min(1).max(64),
          x: z.number().finite(),
          y: z.number().finite(),
          settings: z.record(z.string(), automationSettingValueSchema),
        })
      )
      .max(100),
    edges: z
      .array(
        z.object({
          id: idSchema,
          from: idSchema,
          sourcePort: z.string().min(1).max(32),
          to: idSchema,
        })
      )
      .max(200),
    viewport: z.object({
      x: z.number().finite(),
      y: z.number().finite(),
      zoom: z.number().finite().min(0.25).max(2),
    }),
  })
  .refine((graph) => JSON.stringify(graph).length <= MAX_GRAPH_JSON_LENGTH, {
    message: "Automation is too large to save.",
  })

export const EMPTY_AUTOMATION_GRAPH: AutomationGraph = {
  nodes: [],
  edges: [],
  // 90%, matching what "Fit automation to view" settles on, so a new canvas
  // opens at the same size the Fit button would give it.
  viewport: { x: 0, y: 0, zoom: 0.9 },
}
