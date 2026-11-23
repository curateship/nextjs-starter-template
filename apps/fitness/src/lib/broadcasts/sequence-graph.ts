import { z } from "zod"

import {
  EMPTY_AUTOMATION_GRAPH,
  type AutomationEdge,
  type AutomationGraph,
  type AutomationNode,
} from "@/lib/automations/graph"
import { sendEmailDraftSettingsSchema, sendEmailNode } from "@/lib/automations/nodes/send-email"
import {
  describeWaitLength,
  readWaitSettings,
  WAIT_MAX_DAYS,
  WAIT_UNITS,
  waitDurationMs,
  waitNode,
} from "@/lib/automations/nodes/wait"
import {
  broadcastBlocksSchema,
  createStarterBlocks,
  safeLinkUrl,
  type BroadcastBlock,
} from "@/lib/broadcasts/blocks"

/**
 * A sequence, the CRM's timed series of emails (Tyler, 16 Nov 2026: "create
 * a tab for sequence"), is an automation underneath with no start of its own:
 * a straight chain of Send email, then a Wait and a Send email for each email
 * after it. Who gets it and when is an automation's business, through its
 * Send sequence step ("The trigger is set in automation. This just organizes
 * sequence"). This file turns the list the Sequences tab draws into that
 * chain and back, so the automations engine does the sending and the waiting.
 *
 * Every email keeps its own id, and its steps are named from it. A person
 * partway through holds their own copy of the steps, so the ids staying put
 * across saves is what keeps the chain readable.
 */

/** The most emails one sequence holds: 2 × 30 steps stays under a flow's 100. */
export const SEQUENCE_MAX_EMAILS = 30

const ROW_GAP = 160

const sequenceWaitSchema = z.object({
  /** 0 is "right away", the same moment as the email before it. */
  amount: z.number().int().min(0).max(WAIT_MAX_DAYS * 24),
  unit: z.enum(WAIT_UNITS),
})
export type SequenceWait = z.infer<typeof sequenceWaitSchema>

const sequenceEmailSchema = sendEmailDraftSettingsSchema.extend({
  id: z.string().regex(/^[A-Za-z0-9-]{1,40}$/),
  wait: sequenceWaitSchema,
  blocks: broadcastBlocksSchema,
})
export type SequenceEmail = z.infer<typeof sequenceEmailSchema> & { blocks: BroadcastBlock[] }

export const sequenceStepsSchema = z.object({
  emails: z.array(sequenceEmailSchema).min(1).max(SEQUENCE_MAX_EMAILS),
})
export type SequenceSteps = z.infer<typeof sequenceStepsSchema>

/** A fresh email: starter blocks, and two days after the one before unless it is the first. */
export function newSequenceEmail(first: boolean): SequenceEmail {
  return {
    id: Math.random().toString(36).slice(2, 12),
    wait: first ? { amount: 0, unit: "days" } : { amount: 2, unit: "days" },
    subject: "",
    preheader: "",
    fromName: "",
    blocks: createStarterBlocks(),
  }
}

/** "Right away", "3 days later", "1 hour later". */
export function describeSequenceWait(wait: SequenceWait): string {
  if (wait.amount === 0) return "Right away"
  return `${describeWaitLength({ ...wait, stopOnClick: false })} later`
}

/**
 * What stops the sequence being sent, in plain words, first problem first.
 * The server's compile is the rule that refuses it; this says why in the
 * sequence's own terms rather than the canvas's steps.
 */
export function sequenceProblems(steps: SequenceSteps): string[] {
  const problems: string[] = []
  steps.emails.forEach((email, index) => {
    const name = `Email ${index + 1}`
    if (!email.subject.trim()) problems.push(`${name} needs a subject.`)
    if (email.blocks.length === 0) problems.push(`${name} has nothing in it.`)
    if (email.blocks.some((block) => block.kind === "button" && !safeLinkUrl(block.content.url))) {
      problems.push(`${name} has a button without a full, safe link.`)
    }
    if (index > 0 && email.wait.amount === 0) problems.push(`${name} needs a wait of at least 1 hour.`)
    if (waitDurationMs({ ...email.wait, stopOnClick: false }) > WAIT_MAX_DAYS * 24 * 3_600_000) {
      problems.push(`${name} waits longer than ${WAIT_MAX_DAYS} days.`)
    }
  })
  return problems
}

const sendId = (email: SequenceEmail) => `email-${email.id}`
const waitId = (email: SequenceEmail) => `wait-${email.id}`

/** The list as the automation chain the engine runs. */
export function sequenceToGraph(steps: SequenceSteps): AutomationGraph {
  const nodes: AutomationNode[] = []
  const edges: AutomationEdge[] = []
  let previous: string | null = null
  const link = (to: string) => {
    if (previous) edges.push({ id: `${previous}-to-${to}`, from: previous, sourcePort: "then", to })
    previous = to
  }
  steps.emails.forEach((email, index) => {
    // The first email's wait is always nothing: it goes when the person arrives.
    if (index > 0) {
      nodes.push({
        id: waitId(email),
        kind: waitNode.kind,
        x: 0,
        y: nodes.length * ROW_GAP,
        // Never stops for a click: a series carries on whatever they open.
        settings: { amount: email.wait.amount, unit: email.wait.unit, stopOnClick: false },
      })
      link(waitId(email))
    }
    nodes.push({
      id: sendId(email),
      kind: sendEmailNode.kind,
      x: 0,
      y: nodes.length * ROW_GAP,
      settings: {
        subject: email.subject,
        preheader: email.preheader,
        fromName: email.fromName,
        // Blocks are plain JSON, which is all a setting may hold.
        blocks: email.blocks as unknown as AutomationNode["settings"][string],
      },
    })
    link(sendId(email))
  })
  return { ...EMPTY_AUTOMATION_GRAPH, nodes, edges }
}

/**
 * The chain back as the list, or null when the stored steps are not a chain
 * this tab drew. The canvas never saves a sequence, so null means data
 * written some other way, and the tab says so instead of guessing.
 */
export function sequenceFromGraph(graph: AutomationGraph): SequenceSteps | null {
  const byId = new Map(graph.nodes.map((node) => [node.id, node]))
  const next = new Map<string, string>()
  for (const edge of graph.edges) {
    if (next.has(edge.from)) return null
    next.set(edge.from, edge.to)
  }
  // The chain starts at the one step nothing leads into.
  const fedInto = new Set(graph.edges.map((edge) => edge.to))
  const roots = graph.nodes.filter((node) => !fedInto.has(node.id))
  if (roots.length !== 1) return null

  const emails: SequenceEmail[] = []
  let pendingWait: SequenceWait = { amount: 0, unit: "days" }
  const seen = new Set<string>()
  for (let at: string | undefined = roots[0]!.id; at !== undefined; at = next.get(at)) {
    if (seen.has(at)) return null
    seen.add(at)
    const node = byId.get(at)
    if (!node) return null
    if (node.kind === waitNode.kind) {
      const wait = readWaitSettings(node.settings)
      pendingWait = { amount: wait.amount, unit: wait.unit }
      continue
    }
    if (node.kind !== sendEmailNode.kind || !node.id.startsWith("email-")) return null
    const parsed = sendEmailDraftSettingsSchema.safeParse(node.settings)
    if (!parsed.success) return null
    emails.push({ id: node.id.slice("email-".length), wait: pendingWait, ...parsed.data })
    pendingWait = { amount: 0, unit: "days" }
  }
  if (seen.size !== graph.nodes.length || emails.length === 0) return null
  return { emails }
}
