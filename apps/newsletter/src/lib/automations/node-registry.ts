import type {
  AutomationNode,
  AutomationSourcePort,
} from "@/lib/automations/automation"

export type AutomationPaletteKey =
  | "trigger-contact-added"
  | "action-send-email"
  | "flow-delay"
  | "flow-branch"
  | "action-tag"
  | "action-webhook"

export type AutomationNodeIconName =
  | "userPlus"
  | "mail"
  | "timer"
  | "gitBranch"
  | "tag"
  | "webhook"

export type AutomationNodeInspectorKind =
  | "trigger"
  | "sendEmail"
  | "delay"
  | "branch"
  | "tag"
  | "webhook"

export type AutomationPaletteGroup = "Triggers" | "Actions" | "Flow"

export type AutomationNodePort = {
  id: AutomationSourcePort
  label: string
}

type PaletteDetails = {
  key: AutomationPaletteKey
  group: AutomationPaletteGroup
  description: string
}

type AutomationNodeDefinition = {
  palette: PaletteDetails | null
  matches: (node: AutomationNode) => boolean
  create?: (position: { id: string; x: number; y: number }) => AutomationNode
  name: (node: AutomationNode) => string
  description: (node: AutomationNode) => string
  icon: AutomationNodeIconName
  inspector: AutomationNodeInspectorKind
  outputPorts: readonly AutomationNodePort[]
  /** Whether the node accepts an inbound connection (false only for triggers). */
  hasInput: boolean
  connectionError: (
    sourcePort: AutomationSourcePort,
    target: AutomationNode
  ) => string | null
}

/** The only connection rule in the newsletter graph: nothing enters a trigger. */
const rejectTriggerTarget = (
  _sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null =>
  target.kind === "trigger" ? "Nothing can connect into a trigger." : null

const thenPort: readonly AutomationNodePort[] = [{ id: "then", label: "Then" }]

function listPreview(values: string[]): string {
  const shown = values.slice(0, 3).join(", ")
  return values.length > 3 ? `${shown}, …` : shown
}

const AUTOMATION_NODE_DEFINITIONS: readonly AutomationNodeDefinition[] = [
  {
    palette: {
      key: "trigger-contact-added",
      group: "Triggers",
      description: "Start when a contact is added, optionally filtered",
    },
    matches: (node) => node.kind === "trigger",
    create: ({ id, x, y }) => ({
      id,
      kind: "trigger",
      x,
      y,
      source: "",
      tags: [],
    }),
    name: () => "Contact added",
    description: (node) => {
      if (node.kind !== "trigger") return ""
      const parts = [
        node.source.trim() ? `from ${node.source.trim()}` : "",
        node.tags.length > 0 ? `tagged ${listPreview(node.tags)}` : "",
      ].filter(Boolean)
      return parts.length > 0
        ? `Fires when a contact is added ${parts.join(" and ")}.`
        : "Fires when a contact is added from any source."
    },
    icon: "userPlus",
    inspector: "trigger",
    outputPorts: [{ id: "contact", label: "Contact" }],
    hasInput: false,
    connectionError: rejectTriggerTarget,
  },
  {
    palette: {
      key: "action-send-email",
      group: "Actions",
      description: "Send an email to the contact",
    },
    matches: (node) => node.kind === "sendEmail",
    create: ({ id, x, y }) => ({
      id,
      kind: "sendEmail",
      x,
      y,
      subject: "",
      body: "",
      preheader: "",
    }),
    name: () => "Send email",
    description: (node) => {
      if (node.kind !== "sendEmail") return ""
      return node.subject.trim()
        ? `Sends “${node.subject.trim()}”.`
        : "Sends an email to the contact."
    },
    icon: "mail",
    inspector: "sendEmail",
    outputPorts: thenPort,
    hasInput: true,
    connectionError: rejectTriggerTarget,
  },
  {
    palette: {
      key: "flow-delay",
      group: "Flow",
      description: "Wait before running the next step",
    },
    matches: (node) => node.kind === "delay",
    create: ({ id, x, y }) => ({
      id,
      kind: "delay",
      x,
      y,
      amount: 1,
      unit: "hours",
    }),
    name: () => "Delay",
    description: (node) =>
      node.kind === "delay"
        ? `Waits ${node.amount} ${node.unit} before the next step.`
        : "",
    icon: "timer",
    inspector: "delay",
    outputPorts: thenPort,
    hasInput: true,
    connectionError: rejectTriggerTarget,
  },
  {
    palette: {
      key: "flow-branch",
      group: "Flow",
      description: "Split the flow on a contact condition",
    },
    matches: (node) => node.kind === "branch",
    create: ({ id, x, y }) => ({
      id,
      kind: "branch",
      x,
      y,
      field: "tag",
      op: "has",
      value: "",
    }),
    name: () => "Branch",
    description: (node) => {
      if (node.kind !== "branch") return ""
      return node.value.trim()
        ? `Yes when ${node.field} ${node.op} “${node.value.trim()}”.`
        : "Splits into Yes and No paths on a contact condition."
    },
    icon: "gitBranch",
    inspector: "branch",
    outputPorts: [
      { id: "yes", label: "Yes" },
      { id: "no", label: "No" },
    ],
    hasInput: true,
    connectionError: rejectTriggerTarget,
  },
  {
    palette: {
      key: "action-tag",
      group: "Actions",
      description: "Add or remove tags on the contact",
    },
    matches: (node) => node.kind === "tag",
    create: ({ id, x, y }) => ({
      id,
      kind: "tag",
      x,
      y,
      mode: "add",
      tags: [],
    }),
    name: () => "Tag",
    description: (node) => {
      if (node.kind !== "tag") return ""
      const verb = node.mode === "add" ? "Adds" : "Removes"
      return node.tags.length > 0
        ? `${verb} ${listPreview(node.tags)}.`
        : `${verb} tags on the contact.`
    },
    icon: "tag",
    inspector: "tag",
    outputPorts: thenPort,
    hasInput: true,
    connectionError: rejectTriggerTarget,
  },
  {
    palette: {
      key: "action-webhook",
      group: "Actions",
      description: "POST the contact to an external URL",
    },
    matches: (node) => node.kind === "webhook",
    create: ({ id, x, y }) => ({
      id,
      kind: "webhook",
      x,
      y,
      url: "",
      note: "",
    }),
    name: () => "Webhook",
    description: (node) => {
      if (node.kind !== "webhook") return ""
      return node.url.trim()
        ? `POSTs the contact to ${node.url.trim()}.`
        : "Sends the contact to a webhook URL."
    },
    icon: "webhook",
    inspector: "webhook",
    outputPorts: thenPort,
    hasInput: true,
    connectionError: rejectTriggerTarget,
  },
]

export const AUTOMATION_PALETTE_GROUPS: readonly AutomationPaletteGroup[] = [
  "Triggers",
  "Actions",
  "Flow",
]

export const AUTOMATION_PALETTE_ITEMS = AUTOMATION_NODE_DEFINITIONS.flatMap(
  (definition) => {
    if (!definition.palette) return []
    return [
      {
        ...definition.palette,
        name: definition.name(
          definition.create!({ id: "palette", x: 0, y: 0 })
        ),
        icon: definition.icon,
      },
    ]
  }
).sort(
  (left, right) =>
    AUTOMATION_PALETTE_GROUPS.indexOf(left.group) -
    AUTOMATION_PALETTE_GROUPS.indexOf(right.group)
)

export const AUTOMATION_PALETTE_KEYS: readonly AutomationPaletteKey[] =
  AUTOMATION_PALETTE_ITEMS.map((item) => item.key)

function definitionForNode(node: AutomationNode): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find((item) =>
    item.matches(node)
  )
  if (!definition) throw new Error(`Unknown Automation node: ${node.kind}`)
  return definition
}

function definitionForPaletteKey(
  key: AutomationPaletteKey
): AutomationNodeDefinition {
  const definition = AUTOMATION_NODE_DEFINITIONS.find(
    (item) => item.palette?.key === key
  )
  if (!definition?.create)
    throw new Error(`Unknown Automation node key: ${key}`)
  return definition
}

export function createAutomationNode(
  key: AutomationPaletteKey,
  position: { id: string; x: number; y: number }
): AutomationNode {
  return definitionForPaletteKey(key).create!(position)
}

export function automationPaletteKeyForRegisteredNode(
  node: AutomationNode
): AutomationPaletteKey | null {
  return definitionForNode(node).palette?.key ?? null
}

export function automationNodeName(node: AutomationNode): string {
  return definitionForNode(node).name(node)
}

export function automationNodeDescription(node: AutomationNode): string {
  return definitionForNode(node).description(node)
}

export function automationNodeIcon(
  node: AutomationNode
): AutomationNodeIconName {
  return definitionForNode(node).icon
}

export function automationNodeInspector(
  node: AutomationNode
): AutomationNodeInspectorKind {
  return definitionForNode(node).inspector
}

export function automationNodeOutputPorts(
  node: AutomationNode
): readonly AutomationNodePort[] {
  return definitionForNode(node).outputPorts
}

export function automationNodeHasInput(node: AutomationNode): boolean {
  return definitionForNode(node).hasInput
}

export function automationNodeSourcePortIsValid(
  node: AutomationNode,
  sourcePort: AutomationSourcePort
): boolean {
  return definitionForNode(node).outputPorts.some(
    (port) => port.id === sourcePort
  )
}

export function automationNodeConnectionError(
  source: AutomationNode,
  sourcePort: AutomationSourcePort,
  target: AutomationNode
): string | null {
  if (!automationNodeSourcePortIsValid(source, sourcePort)) {
    return "Connection uses an invalid output."
  }
  return definitionForNode(source).connectionError(sourcePort, target)
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
