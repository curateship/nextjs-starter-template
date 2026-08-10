import { lazy, type ComponentType } from "react"
import { CircleHelpIcon } from "lucide-react"

import { appAutomationNodes } from "@/lib/app-options"

import type { AutomationNode, AutomationSourcePort } from "./graph"
import type {
  AutomationNodeDescriptor,
  AutomationNodeFieldsProps,
  AutomationNodeIcon,
  AutomationNodePort,
  AutomationNodeRunResultProps,
  AutomationPaletteGroup,
} from "./node-descriptor"
import { aiStepNode } from "./nodes/ai-step"
import { audienceNode } from "./nodes/audience"
import { billingMomentNode } from "./nodes/billing-moment"
import { placeholderNode } from "./nodes/placeholder"
import { sendEmailNode } from "./nodes/send-email"
import { timeActivateNode } from "./nodes/time-activate"
import { waitForApprovalNode } from "./nodes/wait-for-approval"
import { webhookNode } from "./nodes/webhook"

export type {
  AutomationNodeIcon,
  AutomationNodePort,
  AutomationPaletteGroup,
} from "./node-descriptor"

/** Every node kind the shell itself ships, one descriptor module each under `nodes/`. */
const SHELL_NODE_DESCRIPTORS: readonly AutomationNodeDescriptor[] = [
  aiStepNode,
  audienceNode,
  billingMomentNode,
  timeActivateNode,
  placeholderNode,
  sendEmailNode,
  waitForApprovalNode,
  webhookNode,
]

export const AUTOMATION_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  "Triggers",
  "Actions",
  "Flow",
  "AI",
  "Steps",
]

export type AutomationPaletteItem = {
  key: string
  group: AutomationPaletteGroup
  description: string
  name: string
  icon: AutomationNodeIcon
}

type Registry = {
  descriptors: readonly AutomationNodeDescriptor[]
  byKind: Map<string, AutomationNodeDescriptor>
  paletteItems: readonly AutomationPaletteItem[]
  paletteKeys: Set<string>
}

let registry: Registry | null = null

/**
 * The shell's nodes plus whatever the app added, worked out the first time
 * anything asks and kept.
 *
 * Deliberately not a module-level constant. An app's extra nodes come from its
 * options file, which imports app components, which import shell components,
 * which can import this file — a real circle. Building the list while modules
 * are still loading would read a half-built one. Everything here is called from
 * a component, a loader or a request, all of which happen long after boot.
 */
function automationRegistry(): Registry {
  if (registry) return registry

  const descriptors = [...SHELL_NODE_DESCRIPTORS, ...appAutomationNodes()]

  const byKind = new Map<string, AutomationNodeDescriptor>()
  const paletteKeys = new Set<string>()
  for (const descriptor of descriptors) {
    // An app adds steps; it never replaces one. Silently winning would change
    // what the shell's own flows do, and a saved graph naming that kind would
    // quietly start meaning something else.
    if (byKind.has(descriptor.kind)) {
      throw new Error(
        `Two automation steps both call themselves "${descriptor.kind}". An app's own step needs a kind the shell isn't already using.`
      )
    }
    byKind.set(descriptor.kind, descriptor)

    const key = descriptor.palette?.key
    if (key === undefined) continue
    if (paletteKeys.has(key)) {
      throw new Error(
        `Two automation steps both claim the palette key "${key}". An app's own step needs a key the shell isn't already using.`
      )
    }
    paletteKeys.add(key)
  }

  const paletteItems = descriptors
    .flatMap((descriptor) =>
      descriptor.palette
        ? [
            {
              ...descriptor.palette,
              name: descriptor.name(descriptor.createSettings()),
              icon: descriptor.icon,
            },
          ]
        : []
    )
    .sort(
      (left, right) =>
        AUTOMATION_PALETTE_GROUPS.indexOf(left.group) -
        AUTOMATION_PALETTE_GROUPS.indexOf(right.group)
    )

  registry = { descriptors, byKind, paletteItems, paletteKeys }
  return registry
}

export function automationPaletteItems(): readonly AutomationPaletteItem[] {
  return automationRegistry().paletteItems
}

export function isAutomationPaletteKey(value: unknown): value is string {
  return (
    typeof value === "string" && automationRegistry().paletteKeys.has(value)
  )
}

/** Drops stale keys (removed node kinds) from a stored favorites list. */
export function cleanAutomationPaletteKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter(isAutomationPaletteKey))]
}

/**
 * Never throws on an unknown kind. A saved graph can outlive the registry that
 * wrote it (a node kind removed, or a graph imported from a newer app), and one
 * unreadable node must not take down the list page or the editor — the node
 * renders as an inert "unsupported" card and the compiler reports it instead.
 */
export function descriptorForNode(
  node: AutomationNode
): AutomationNodeDescriptor | null {
  return automationRegistry().byKind.get(node.kind) ?? null
}

export function isSupportedNode(node: AutomationNode): boolean {
  return automationRegistry().byKind.has(node.kind)
}

/**
 * Whether a step is a trigger — one that starts a flow when something happens,
 * rather than one a flow reaches.
 *
 * Read off `hasInput` rather than a second flag saying the same thing. "Nothing
 * can connect into it" and "it is where a flow begins" are one property, and
 * two of them could disagree.
 *
 * A kind nothing recognises is not a trigger. That is the safe way round: an
 * unreadable node must not become the start of a flow that then runs.
 */
export function automationKindIsTrigger(kind: string): boolean {
  return automationRegistry().byKind.get(kind)?.hasInput === false
}

function descriptorForPaletteKey(key: string): AutomationNodeDescriptor {
  const descriptor = automationRegistry().descriptors.find(
    (item) => item.palette?.key === key
  )
  if (!descriptor) throw new Error(`Unknown automation node key: ${key}`)
  return descriptor
}

export function createAutomationNode(
  key: string,
  position: { id: string; x: number; y: number }
): AutomationNode {
  const descriptor = descriptorForPaletteKey(key)
  return {
    id: position.id,
    kind: descriptor.kind,
    x: position.x,
    y: position.y,
    settings: descriptor.createSettings(),
  }
}

export function automationPaletteKeyForNode(
  node: AutomationNode
): string | null {
  return descriptorForNode(node)?.palette?.key ?? null
}

export function automationNodeName(node: AutomationNode): string {
  return descriptorForNode(node)?.name(node.settings) ?? "Unsupported step"
}

export function automationNodeDescription(node: AutomationNode): string {
  const descriptor = descriptorForNode(node)
  if (!descriptor) {
    return `"${node.kind}" steps aren't available in this app. The rest of the flow still loads.`
  }
  return descriptor.description(node.settings)
}

/** A step nobody recognises gets the question mark, not nothing. */
export function automationNodeIcon(node: AutomationNode): AutomationNodeIcon {
  return descriptorForNode(node)?.icon ?? CircleHelpIcon
}

/**
 * The node's settings panel, when the node brings its own.
 *
 * Every node points at its own panel file — the shell's four and any an app
 * adds alike, so there is one way to do this rather than two.
 *
 * The descriptor holds a pointer to that file rather than the component, so the
 * engine never loads it (see the `fields` doc comment). Turning the pointer
 * into something drawable is React's `lazy`, and it is done once per node kind
 * and kept: a fresh one each call would be a different component every render,
 * and the panel would be thrown away and rebuilt on every keystroke.
 */
const lazyFields = new Map<string, ComponentType<AutomationNodeFieldsProps>>()

export function automationNodeFields(
  node: AutomationNode
): ComponentType<AutomationNodeFieldsProps> | null {
  const descriptor = descriptorForNode(node)
  if (!descriptor?.fields) return null

  const cached = lazyFields.get(descriptor.kind)
  if (cached) return cached

  const component = lazy(descriptor.fields)
  lazyFields.set(descriptor.kind, component)
  return component
}

/**
 * The rich run-history view a node brings with it, when it has one.
 *
 * Kept lazy for the same server/browser boundary as settings panels, and kept
 * by kind so opening another run does not rebuild the app's component.
 */
const lazyRunResults = new Map<
  string,
  ComponentType<AutomationNodeRunResultProps>
>()

export function automationNodeRunResult(
  kind: string
): ComponentType<AutomationNodeRunResultProps> | null {
  const descriptor = automationRegistry().byKind.get(kind)
  if (!descriptor?.runResult) return null

  const cached = lazyRunResults.get(kind)
  if (cached) return cached

  const component = lazy(descriptor.runResult)
  lazyRunResults.set(kind, component)
  return component
}

export function automationNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return descriptorForNode(node)?.outputPorts ?? []
}

export function automationNodeHasInput(node: AutomationNode): boolean {
  // Unsupported nodes keep their input so saved edges into them still render.
  return descriptorForNode(node)?.hasInput ?? true
}

export function automationNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  return automationNodeOutputPorts(node).some((port) => port.id === sourcePort)
}

export function automationNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  const descriptor = descriptorForNode(source)
  if (!descriptor) {
    return "This step isn't available in this app, so it can't be connected."
  }
  if (!automationNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  // Asked here rather than in every node's own `connectionError`: a trigger is
  // where a flow begins, so nothing may feed into one, and that is true whoever
  // is doing the connecting. One place means the canvas refuses to draw it and
  // the compiler refuses to accept it from the same rule.
  if (!automationNodeHasInput(target)) {
    return `"${automationNodeName(target)}" starts a flow, so nothing can connect into it.`
  }
  return descriptor.connectionError(sourcePort, target)
}

export function canConnectAutomationNodes(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): boolean {
  return (
    source.id !== target.id &&
    automationNodeConnectionError(source, sourcePort, target) === null
  )
}
