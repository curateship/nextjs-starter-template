import {
  AudioLinesIcon,
  BotIcon,
  ClapperboardIcon,
  FileTextIcon,
  FilmIcon,
  ImageIcon,
  LinkIcon,
  MusicIcon,
  PanelsTopLeftIcon,
  UploadIcon,
  UserRoundIcon,
  type LucideIcon,
} from "lucide-react"
import { z } from "zod"

import {
  automationSettingValueSchema,
  type AutomationNode,
  type AutomationSettingValue,
} from "@/lib/automations/graph"
import { defineNode, type AutomationNodeDescriptor } from "@/lib/automations/node-descriptor"

/**
 * The nodes a flow is built from (workspace/docs/flow.md).
 *
 * Every node does something: an AI node follows its prompt. What it asks you
 * for, such as a transcript or a raw video, is a box inside the node, set in
 * its right panel, the way an automation's Send email holds its own email
 * (Tyler, 14 Nov 2026: "even the other canvas dashboard does not have nodes
 * for a single use like you did here"). Lines only carry what one node made
 * into the next.
 *
 * Flow draws its nodes on the shell's automation canvas, which reads each
 * node's name, icon and ports from the automation node list. So each kind is
 * declared there through `automations.nodes` in `src/app/options.ts`, with
 * no palette entry: none of them shows in `/admin/automations`, and the
 * automation engine never runs one. Flow runs its own nodes, in
 * `src/server/video/flow/`.
 *
 * This file is read on the server too, so it imports zod, lucide and types
 * only.
 */

/** The nodes, each run by an AI following its prompt and nothing else. */
export const FLOW_KINDS = ["ai-text", "ai-video", "ai-thumbnail", "ai-picture", "ai-voice", "ai-music"] as const
export type FlowKind = (typeof FLOW_KINDS)[number]

/** Every Flow kind is stored with this in front, so it never meets a shell kind's name. */
const KIND_PREFIX = "video-flow-"

export function storedFlowKind(kind: FlowKind): string {
  return `${KIND_PREFIX}${kind}`
}

/** The Flow kind a stored node is, or null for anything else, an older Flow's input nodes included. */
export function flowKindOf(storedKind: string): FlowKind | null {
  if (!storedKind.startsWith(KIND_PREFIX)) return null
  const kind = storedKind.slice(KIND_PREFIX.length)
  return (FLOW_KINDS as readonly string[]).includes(kind) ? (kind as FlowKind) : null
}

type KindInfo = {
  name: string
  icon: LucideIcon
  /** One line in the nodes panel. */
  description: string
  /** The step's main button in the guide, until the node says otherwise. */
  button: string
}

export const FLOW_KIND_INFO: Record<FlowKind, KindInfo> = {
  "ai-text": {
    name: "AI text",
    icon: BotIcon,
    description: "Writes words from your prompt, its boxes and what is connected to it.",
    button: "Write it",
  },
  // Stored as ai-video, which saved flows name; shown as the AI editor
  // since it uses the editor's own tools (flow.md, "AI editor").
  "ai-video": {
    name: "AI editor",
    icon: ClapperboardIcon,
    description: "Builds the video with the editor's tools as your prompt says: cuts, moving pictures, music, sounds, timers, text.",
    button: "Make the video",
  },
  "ai-thumbnail": {
    name: "AI thumbnail",
    icon: FilmIcon,
    description: "Makes a thumbnail from your prompt and the connected video.",
    button: "Make the thumbnail",
  },
  "ai-picture": {
    name: "AI picture",
    icon: ImageIcon,
    description: "Makes a picture from your prompt.",
    button: "Make the picture",
  },
  "ai-voice": {
    name: "AI voice",
    icon: AudioLinesIcon,
    description: "Reads its text aloud.",
    button: "Read it aloud",
  },
  "ai-music": {
    name: "AI music",
    icon: MusicIcon,
    description: "Makes music to the mood in your prompt.",
    button: "Make the music",
  },
}

/** The boxes a node can ask you for, filled in on its step of a run. */
export const FLOW_BOX_KINDS = ["text", "video", "media", "link", "actor-voice"] as const
export type FlowBoxKind = (typeof FLOW_BOX_KINDS)[number]

/**
 * One box a node asks you for: its kind, the name over it on the step, and
 * whether it can be left empty (`optional`), such as "Your scene" when the
 * node falls back on an AI picture without it.
 */
export type FlowBox = { id: string; kind: FlowBoxKind; label: string; optional?: boolean }

export const FLOW_BOX_INFO: Record<FlowBoxKind, { name: string; icon: LucideIcon; label: string; description: string }> = {
  text: { name: "Text", icon: FileTextIcon, label: "Text", description: "Words you paste, such as a transcript or notes." },
  video: { name: "Video upload", icon: UploadIcon, label: "Video", description: "A video you upload. It goes on the project's Media shelf." },
  media: { name: "Pick from Media", icon: PanelsTopLeftIcon, label: "Files", description: "Videos, pictures or sounds already in Media." },
  link: {
    name: "Video link",
    icon: LinkIcon,
    label: "Link",
    description: "A YouTube, TikTok or Instagram link. The app downloads it and writes down what is said.",
  },
  "actor-voice": { name: "Actor or voice", icon: UserRoundIcon, label: "Actor and voice", description: "One of your actors, a voice, or both." },
}

/** The most boxes one node asks for. */
export const FLOW_BOXES_MAX = 6

/** How long a node's title, prompt and words may be. */
export const FLOW_TITLE_MAX = 80
export const FLOW_PROMPT_MAX = 8000
/** The guide's words for a step (workspace/docs/flow.md, "The stepped guide"). */
export const FLOW_GUIDE_LINE_MAX = 200
export const FLOW_GUIDE_TEXT_MAX = 2000

/** A node's settings, read field by field: a field that no longer reads falls back. */
export type FlowNodeSettings = {
  title: string
  /** The whole of what the AI is asked, before its boxes and what is connected. */
  prompt: string
  /** The run stops here until the person says OK. */
  waitForOk: boolean
  /** The boxes it asks you for, in order. */
  asks: FlowBox[]
  /**
   * The stepped guide's words for this step, each written in the builder
   * (Tyler, 14 Nov 2026, picked "Written per node in the builder"). An empty
   * one doesn't show, apart from the button, which falls back to the kind's.
   */
  heading: string
  line: string
  explanation: string
  tip: string
  button: string
}

function readBoxes(value: AutomationSettingValue | undefined): FlowBox[] {
  if (!Array.isArray(value)) return []
  const boxes: FlowBox[] = []
  for (const item of value) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    const kind = item.kind
    const id = item.id
    if (typeof id !== "string" || !id || typeof kind !== "string" || !(FLOW_BOX_KINDS as readonly string[]).includes(kind)) continue
    const label = typeof item.label === "string" ? item.label.slice(0, FLOW_TITLE_MAX) : ""
    boxes.push({ id: id.slice(0, 64), kind: kind as FlowBoxKind, label, ...(item.optional === true ? { optional: true } : {}) })
  }
  return boxes.slice(0, FLOW_BOXES_MAX)
}

export function readFlowNodeSettings(settings: Record<string, AutomationSettingValue>): FlowNodeSettings {
  const text = (key: string, max: number) => {
    const value = settings[key]
    return typeof value === "string" ? value.slice(0, max) : ""
  }
  return {
    title: text("title", FLOW_TITLE_MAX),
    prompt: text("prompt", FLOW_PROMPT_MAX),
    waitForOk: settings.waitForOk === true,
    asks: readBoxes(settings.asks),
    heading: text("heading", FLOW_TITLE_MAX),
    line: text("line", FLOW_GUIDE_LINE_MAX),
    explanation: text("explanation", FLOW_GUIDE_TEXT_MAX),
    tip: text("tip", FLOW_GUIDE_TEXT_MAX),
    button: text("button", FLOW_TITLE_MAX),
  }
}

/** A box's name on the step: its own, or its kind's. */
export function flowBoxLabel(box: FlowBox): string {
  return box.label.trim() || FLOW_BOX_INFO[box.kind].label
}

/** The step's main button in the guide: the node's own words, or its kind's. */
export function flowButtonLabel(kind: FlowKind, settings: FlowNodeSettings): string {
  return settings.button.trim() || FLOW_KIND_INFO[kind].button
}

/** The name drawn on a node: its own title, or its kind's name. */
export function flowNodeName(node: Pick<AutomationNode, "kind" | "settings">): string {
  const kind = flowKindOf(node.kind)
  const title = readFlowNodeSettings(node.settings).title.trim()
  if (title) return title
  return kind ? FLOW_KIND_INFO[kind].name : "Unknown node"
}

/** A node's settings as stored, the boxes as plain objects. */
export function storedFlowSettings(settings: FlowNodeSettings): Record<string, AutomationSettingValue> {
  return { ...settings, asks: settings.asks.map((box) => ({ ...box })) }
}

const EMPTY_SETTINGS: FlowNodeSettings = {
  title: "",
  prompt: "",
  waitForOk: false,
  asks: [],
  heading: "",
  line: "",
  explanation: "",
  tip: "",
  button: "",
}

// Flow checks its own nodes (`validate.ts`); this is only the shape the
// automation node list asks every descriptor for.
const settingsSchema = z.record(z.string(), automationSettingValueSchema)

function descriptorFor(kind: FlowKind): AutomationNodeDescriptor {
  const info = FLOW_KIND_INFO[kind]
  return defineNode({
    kind: storedFlowKind(kind),
    // No palette entry: a Flow node is never offered on an automation's canvas.
    palette: null,
    createSettings: () => storedFlowSettings(EMPTY_SETTINGS),
    settingsSchema,
    name: (settings) => flowNodeName({ kind: storedFlowKind(kind), settings }),
    description: (settings) => {
      const read = readFlowNodeSettings(settings)
      const asks = read.asks.length ? `Asks for ${read.asks.map(flowBoxLabel).join(", ")}. ` : ""
      const prompt = read.prompt.trim().replace(/\s+/g, " ")
      return `${asks}${prompt ? prompt.slice(0, 120) : "No prompt yet."}`
    },
    icon: info.icon,
    outputPorts: [{ id: "out", label: "Next" }],
    hasInput: true,
    connectionError: () => null,
  })
}

/** Every Flow node, as the automation node list wants them. */
export const FLOW_NODE_DESCRIPTORS: readonly AutomationNodeDescriptor[] = FLOW_KINDS.map(descriptorFor)

/** A fresh node of one kind at a place on the canvas. */
export function createFlowNode(kind: FlowKind, position: { id: string; x: number; y: number }): AutomationNode {
  return {
    id: position.id,
    kind: storedFlowKind(kind),
    x: position.x,
    y: position.y,
    settings: storedFlowSettings(EMPTY_SETTINGS),
  }
}

/** A new box of one kind for a node, with no name of its own yet. */
export function createFlowBox(kind: FlowBoxKind, id: string): FlowBox {
  return { id, kind, label: "" }
}
