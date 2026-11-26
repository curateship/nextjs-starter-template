import { DropletsIcon } from "lucide-react"

import {
  DEFAULT_DRIP_CONFIG,
  describeDripSchedule,
  dripConfigSchema,
  parseDripConfig,
  validateDripConfig,
  type DripConfig,
} from "@/lib/broadcasts/drip"

import { defineNode } from "../node-descriptor"

/**
 * Lets people through a few at a time (Tyler, 23 Nov 2026: "Create a new flow
 * node called \"Drip\""). Anyone who reaches it waits there, and it lets them
 * on to the next step a batch at a time, at the pace in its own settings:
 * people per batch, minutes between batches, weekends, sending hours and a
 * bounce limit. The same fields as a newsletter's pace, without the on/off
 * box, because a Drip step is always on.
 *
 * It is the only way a flow paces itself. The Segment start with "Also send to
 * people already in this segment" lets the whole segment in at once, and a
 * Drip after it is what spaces them out.
 */
export const dripNode = defineNode({
  kind: "drip",
  palette: {
    key: "flow-drip",
    group: "Flow",
    description: "Let people through a few at a time",
  },
  createSettings: () => dripStepSettings(DEFAULT_DRIP_CONFIG),
  settingsSchema: dripConfigSchema
    .omit({ enabled: true })
    .superRefine((settings, context) => {
      const invalid = validateDripConfig({ ...settings, enabled: true })
      if (invalid) context.addIssue({ code: "custom", message: invalid })
    }),
  name: () => "Drip",
  // The card says what is typed, even half-typed; the step's error says what
  // is wrong with it.
  description: (settings) =>
    `${describeDripSchedule(draftDripStep(settings))} Then carries on.`,
  icon: DropletsIcon,
  outputPorts: [{ id: "then", label: "Then" }],
  hasInput: true,
  connectionError: () => null,
  fields: () => import("@/components/automations/nodes/drip-panel"),
})

/** A step's settings: the pace without its on/off, which a step does not have. */
export function dripStepSettings(pace: DripConfig) {
  const { enabled: _enabled, ...settings } = pace
  return settings
}

/**
 * The pace as the panel shows it while it is being typed: every saved field
 * kept, even one that is not valid yet, so a cleared box or a 0 does not snap
 * the rest back to the defaults. The compiler and the engine use
 * `readDripStep`, which only ever sees settings that passed the schema.
 */
export function draftDripStep(settings: Record<string, unknown>): DripConfig {
  return { ...DEFAULT_DRIP_CONFIG, ...(settings as Partial<DripConfig>), enabled: true }
}

/** The pace a Drip step keeps to, always on. */
export function readDripStep(settings: Record<string, unknown>): DripConfig {
  // On after the parse, not only before it: a value that fails falls back to
  // the default pace, whose batches are off, and a Drip step is never off.
  return { ...parseDripConfig({ ...settings, enabled: true }), enabled: true }
}

type FlowShape = {
  nodes: Record<string, { kind: string; settings: Record<string, unknown> }>
  edges: ReadonlyArray<{ from: string; to: string }>
}

/** The first Drip step in a flow, for the Waits that keep to its sending hours. */
export function firstDripStep(flow: FlowShape): DripConfig | null {
  const drip = Object.values(flow.nodes).find((node) => node.kind === dripNode.kind)
  return drip ? readDripStep(drip.settings) : null
}

/** Steps that change nothing outside the flow, so they may come before a Drip. */
const HARMLESS_BEFORE_DRIP = new Set(["placeholder", "audience", "wait"])

/** The start that lets a whole segment in at once. Its kind is kept as saved. */
const SEGMENT_DRIP_KIND = "segmentDrip"

export const NEEDS_DRIP_MESSAGE =
  "Add a Drip step after Segment, or everyone in it is emailed at once."

/**
 * The Segment start lets everyone already in the segment in at once, so a flow
 * that starts there must reach a Drip step before any step that does
 * something to a person. Returns the start's id when it does not, or null.
 *
 * One rule for both places that ask: the compiler, so the flow cannot be
 * turned on, and the engine's segment scan, so a flow saved live before this
 * rule lets nobody in rather than everybody.
 */
export function segmentStartMissingDrip(flow: FlowShape): string | null {
  const start = Object.entries(flow.nodes).find(([, node]) => node.kind === SEGMENT_DRIP_KIND)
  if (!start) return null
  const next = new Map<string, string[]>()
  for (const edge of flow.edges) next.set(edge.from, [...(next.get(edge.from) ?? []), edge.to])
  const seen = new Set<string>()
  const queue = [...(next.get(start[0]) ?? [])]
  while (queue.length > 0) {
    const id = queue.shift()!
    if (seen.has(id)) continue
    seen.add(id)
    const kind = flow.nodes[id]?.kind
    if (!kind || kind === dripNode.kind) continue
    if (!HARMLESS_BEFORE_DRIP.has(kind)) return start[0]
    queue.push(...(next.get(id) ?? []))
  }
  return null
}
