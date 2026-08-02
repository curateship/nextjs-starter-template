import type { z } from "zod"

import type { AutomationNode, AutomationSourcePort } from "./graph"

export type AutomationPaletteGroup =
  | "Triggers"
  | "Actions"
  | "Flow"
  | "AI"
  | "Steps"

export type AutomationNodeIconName = "squareDashed" | "circleHelp" | "sparkles"

export type AutomationNodePort = {
  id: AutomationSourcePort
  label: string
}

export type AutomationNodeSettings = Record<string, unknown>

/**
 * Everything the app needs to know about one automation node kind, in one
 * place: one file per kind under `nodes/`, assembled by `node-registry.ts`.
 * Adding a node kind means writing one of these (plus its inspector fields and,
 * once the engine exists, its executor) instead of editing a catalog, a parser,
 * a validator, and the canvas separately.
 */
export type AutomationNodeDescriptor = {
  kind: string
  /** Palette card details; null would mean a legacy kind that is no longer addable. */
  palette: {
    key: string
    group: AutomationPaletteGroup
    description: string
  } | null
  /** Default settings for a freshly added node. */
  createSettings: () => AutomationNodeSettings
  /**
   * Strict settings validation, applied at compile time. The draft graph
   * schema stays lenient so half-filled nodes always save; nothing compiles
   * until every node passes this schema.
   */
  settingsSchema: z.ZodType<AutomationNodeSettings>
  name: (settings: AutomationNodeSettings) => string
  description: (settings: AutomationNodeSettings) => string
  icon: AutomationNodeIconName
  outputPorts: readonly AutomationNodePort[]
  /** Whether the node accepts an inbound connection (false only for triggers). */
  hasInput: boolean
  /** A human reason this connection is not allowed, or null when it is. */
  connectionError: (
    sourcePort: AutomationSourcePort,
    target: AutomationNode
  ) => string | null
}

/** Identity helper so descriptor literals stay fully typed at the definition. */
export function defineNode(
  descriptor: AutomationNodeDescriptor
): AutomationNodeDescriptor {
  return descriptor
}
