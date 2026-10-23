import type { ComponentType } from "react"
import type { z } from "zod"

import type {
  AutomationGraph,
  AutomationNode,
  AutomationSettingValue,
  AutomationSourcePort,
} from "./graph"

/**
 * The heading a step sits under in the palette.
 *
 * Deliberately a plain string rather than the shell's own five names. An app
 * that adds steps of its own usually wants a heading of its own too — Trade's
 * backtest steps are not Actions or Flow — and a fixed list here could never
 * gain one without editing a shell file, which is the exact fork this whole
 * arrangement exists to avoid.
 *
 * Nothing is lost by widening it. The registry still knows the full list at
 * run time, since it is the shell's own headings plus the ones the app declared
 * in `automations.paletteGroups`, and a step naming a heading that is in
 * neither is refused out loud rather than quietly vanishing from the palette.
 * A typo was a compile error before and is a loud throw now.
 */
export type AutomationPaletteGroup = string

/**
 * A node's icon — the component itself, imported by the node's own file.
 *
 * Deliberately not a list of allowed names. A name has to be written down
 * somewhere in the shell, and a node an app adds could never get onto that list
 * without editing a shell file. Lucide's icons already take a `className`, so
 * any of them goes straight through.
 */
export type AutomationNodeIcon = ComponentType<{ className?: string }>

export type AutomationNodePort = {
  id: AutomationSourcePort
  label: string
}

export type AutomationNodeSettings = Record<string, AutomationSettingValue>

/**
 * Small JSON-only data a completed step may hand to its run-history view.
 * Large app records stay in the app's own table; this carries the id and the
 * few values the view needs to find and describe them.
 */
export type AutomationRunOutput = AutomationSettingValue

/**
 * What a node's settings panel is handed: the node as it stands, and the single
 * way to change it. The same pair the shell's own field components already
 * take, written down so an app's node can be handed it too.
 */
export type AutomationNodeFieldsProps = {
  node: AutomationNode
  /** The current draft, for panels that explain their surrounding flow. */
  graph?: AutomationGraph
  onChange: (node: AutomationNode) => void
  /** Opens the node's full-screen editor when it has one. */
  onOpenEditor?: () => void
}

/** What an app-owned run result is handed inside the shell's history row. */
export type AutomationNodeRunResultProps = {
  runId: string
  stepId: string
  nodeId: string
  output: AutomationRunOutput
}

/**
 * Everything the canvas and the compiler need to know about one node kind, in
 * one place, assembled by `node-registry.ts`. Adding a kind means writing one of
 * these rather than editing a catalogue, a parser, a validator and the canvas
 * separately.
 *
 * A node starts with this descriptor and the executor keyed by the same `kind`.
 * It may point at separate browser files for its settings and its rich run
 * result; the shell loads either only when that view is actually drawn.
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
  icon: AutomationNodeIcon
  outputPorts: readonly AutomationNodePort[]
  /** Whether the node accepts an inbound connection (false only for triggers). */
  hasInput: boolean
  /** False when pressing Run cannot provide the real event or member it needs. */
  manualStart?: boolean
  /** A human reason this connection is not allowed, or null when it is. */
  connectionError: (
    sourcePort: AutomationSourcePort,
    target: AutomationNode
  ) => string | null
  /**
   * The node's settings panel — **a pointer to another file, never the
   * component itself**: `fields: () => import("./send-sms-panel")`.
   *
   * That shape is deliberate, and it is the one thing about a node that cannot
   * be relaxed. The engine reads these descriptors, so everything a
   * descriptor's module imports is loaded on the server too — and a panel that
   * loads something to choose from imports `@/lib/api/*`, which builds a server
   * function the moment it loads. Outside a request that throws at boot, and
   * the whole app fails to start over one dropdown.
   *
   * A function returning an import is not followed until something draws the
   * panel, which only ever happens in a browser. So the panel can load whatever
   * it likes and there is nothing for whoever writes a node to remember: the
   * only thing this type will accept is already the safe one.
   *
   * Unset means the node has no settings to show.
   */
  fields?: () => Promise<{ default: ComponentType<AutomationNodeFieldsProps> }>
  /**
   * An optional rich view of this step's structured output.
   *
   * Like `fields`, this is a pointer to another file rather than the component
   * itself. The engine reads descriptors on the server and must never load an
   * app's browser-only result view while it is running a flow.
   */
  runResult?: () => Promise<{
    default: ComponentType<AutomationNodeRunResultProps>
  }>
}

/** Identity helper so descriptor literals stay fully typed at the definition. */
export function defineNode(
  descriptor: AutomationNodeDescriptor
): AutomationNodeDescriptor {
  return descriptor
}
