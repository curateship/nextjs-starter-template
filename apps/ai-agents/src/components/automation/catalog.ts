export type NodeCategory = "trigger" | "agent" | "action" | "logic"

export type FieldKind = "text" | "textarea" | "select" | "range"

export type FieldDef = {
  key: string
  label: string
  kind: FieldKind
  options?: string[]
  def: string | number
  min?: number
  max?: number
  step?: number
}

export type CatalogItem = {
  type: string
  name: string
  desc: string
  outputs?: number
  fields: FieldDef[]
}

export type CatalogGroup = {
  group: string
  cat: NodeCategory
  items: CatalogItem[]
}

export type FlowNode = {
  id: string
  type: string
  x: number
  y: number
  name: string
  config: Record<string, string | number>
}

export type FlowEdge = {
  id: string
  from: string
  port: number
  to: string
}

const MODEL_OPTIONS = ["claude-haiku-4-5", "claude-sonnet-5", "claude-opus-4-8"]

export const catalog: CatalogGroup[] = [
  {
    group: "Triggers",
    cat: "trigger",
    items: [
      {
        type: "appointment",
        name: "Appointment Reminder",
        desc: "When an appointment is coming up",
        fields: [
          {
            key: "before",
            label: "Remind before",
            kind: "select",
            options: ["15 minutes", "1 hour", "24 hours"],
            def: "24 hours",
          },
          {
            key: "source",
            label: "Source",
            kind: "select",
            options: ["Bookings", "Google Calendar", "Manual"],
            def: "Bookings",
          },
        ],
      },
      {
        type: "newcontact",
        name: "New contact",
        desc: "When a contact is added",
        fields: [{ key: "tag", label: "Tag", kind: "text", def: "inbound" }],
      },
      {
        type: "schedule",
        name: "Schedule",
        desc: "Run on a fixed cadence",
        fields: [
          { key: "cron", label: "Cron expression", kind: "text", def: "0 9 * * *" },
          {
            key: "tz",
            label: "Timezone",
            kind: "select",
            options: ["UTC", "US/Pacific", "Europe/Berlin"],
            def: "UTC",
          },
        ],
      },
    ],
  },
  {
    group: "AI agents",
    cat: "agent",
    items: [
      {
        type: "voicecall",
        name: "Voice call agent",
        desc: "Call the contact with an agent",
        fields: [
          {
            key: "agent",
            label: "Agent",
            kind: "select",
            options: ["Appointment Reminder", "Receptionist", "Sales"],
            def: "Appointment Reminder",
          },
          {
            key: "instructions",
            label: "Instructions",
            kind: "textarea",
            def: "Call the contact, remind them of their upcoming appointment, and offer to reschedule if needed.",
          },
          { key: "temp", label: "Temperature", kind: "range", min: 0, max: 1, step: 0.1, def: 0.4 },
        ],
      },
      {
        type: "classifier",
        name: "Classifier agent",
        desc: "Route by call outcome",
        fields: [
          { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS, def: "claude-haiku-4-5" },
          {
            key: "instructions",
            label: "Instructions",
            kind: "textarea",
            def: "Classify the call outcome as confirmed, reschedule, or no_answer. Return only the label.",
          },
          { key: "temp", label: "Temperature", kind: "range", min: 0, max: 1, step: 0.1, def: 0.2 },
        ],
      },
      {
        type: "writer",
        name: "Writer agent",
        desc: "Draft an SMS or email",
        fields: [
          { key: "model", label: "Model", kind: "select", options: MODEL_OPTIONS, def: "claude-sonnet-5" },
          {
            key: "instructions",
            label: "Instructions",
            kind: "textarea",
            def: "Write a short, friendly reminder message with the appointment time and location.",
          },
          { key: "temp", label: "Temperature", kind: "range", min: 0, max: 1, step: 0.1, def: 0.7 },
        ],
      },
    ],
  },
  {
    group: "Actions",
    cat: "action",
    items: [
      {
        type: "sms",
        name: "Send SMS",
        desc: "Text the contact",
        fields: [
          { key: "to", label: "To", kind: "text", def: "{contact.phone}" },
          { key: "message", label: "Message", kind: "textarea", def: "{draft}" },
        ],
      },
      {
        type: "updatecontact",
        name: "Update contact",
        desc: "Write back to the CRM",
        fields: [
          {
            key: "field",
            label: "Field",
            kind: "select",
            options: ["Status", "Notes", "Tags"],
            def: "Status",
          },
          { key: "value", label: "Value", kind: "text", def: "reminded" },
        ],
      },
      {
        type: "http",
        name: "HTTP request",
        desc: "Call an external API",
        fields: [
          { key: "url", label: "URL", kind: "text", def: "https://api.example.com/v1/events" },
          {
            key: "method",
            label: "Method",
            kind: "select",
            options: ["POST", "GET", "PATCH"],
            def: "POST",
          },
        ],
      },
    ],
  },
  {
    group: "Logic",
    cat: "logic",
    items: [
      {
        type: "branch",
        name: "Branch",
        desc: "Split by condition",
        outputs: 2,
        fields: [
          { key: "cond", label: "Condition", kind: "text", def: 'outcome == "no_answer"' },
        ],
      },
      { type: "merge", name: "Merge", desc: "Join two paths", fields: [] },
    ],
  },
]

export const glyphs: Record<NodeCategory, string> = {
  trigger: "●",
  agent: "✳",
  action: "→",
  logic: "◆",
}

export function catColor(cat: NodeCategory) {
  if (cat === "agent") return "var(--primary)"
  if (cat === "trigger") return "oklch(0.62 0.13 70)"
  if (cat === "action") return "oklch(0.55 0.11 225)"
  return "var(--muted-foreground)"
}

export type ResolvedCatalogItem = CatalogItem & { cat: NodeCategory }

export function typeDef(type: string): ResolvedCatalogItem {
  for (const group of catalog) {
    const item = group.items.find((entry) => entry.type === type)
    if (item) {
      return { ...item, cat: group.cat }
    }
  }
  throw new Error(`Unknown node type: ${type}`)
}

function defaultConfig(item: CatalogItem) {
  const config: Record<string, string | number> = {}
  for (const field of item.fields) {
    config[field.key] = field.def
  }
  return config
}

export function createNode(type: string, x: number, y: number): FlowNode {
  const def = typeDef(type)
  return {
    id: crypto.randomUUID(),
    type,
    x,
    y,
    name: def.name,
    config: defaultConfig(def),
  }
}

export function createInitialNodes(): FlowNode[] {
  return [createNode("appointment", 120, 200)]
}
