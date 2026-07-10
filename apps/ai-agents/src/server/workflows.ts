import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import { and, asc, desc, eq } from "drizzle-orm"

import {
  CONTACT_NODE_TYPES,
  createInitialNodes,
  typeDef,
  type FlowEdge,
  type FlowNode,
} from "@/components/automation/catalog"
import { applyNormalizedCall } from "@/server/calls"
import { buildContactVariables } from "@/server/contacts"
import { syncAgentToProvider } from "@/server/agents"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { getVoiceProvider, isVoiceProviderConfigured } from "@/server/providers"
import { ProviderError } from "@/server/providers/types"
import {
  aiAgentsAgents,
  aiAgentsAutomationWorkflows,
  aiAgentsCalls,
  aiAgentsContactNotes,
  aiAgentsContacts,
  aiAgentsPhoneNumbers,
  aiAgentsWorkflowRuns,
  aiAgentsWorkflowRunSteps,
  type AiAgentsAutomationWorkflow,
  type AiAgentsContact,
  type AiAgentsWorkflowRun,
  type AiAgentsWorkflowRunStep,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type WorkflowItem = {
  id: string
  name: string
  node_count: number
  last_run_status: string | null
  last_run_at: string | null
  created_at: string
  updated_at: string
}

export type WorkflowListResponse = {
  workflows: WorkflowItem[]
}

export type WorkflowDetail = {
  id: string
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
  created_at: string
  updated_at: string
}

export type WorkflowRunStepItem = {
  id: string
  node_id: string
  node_type: string
  node_name: string
  status: string
  output: Record<string, unknown> | null
  call_id: string | null
  error: string | null
  started_at: string | null
  finished_at: string | null
}

export type WorkflowRunDetail = {
  run: {
    id: string
    workflow_id: string
    status: string
    contact_id: string | null
    error: string | null
    started_at: string
    finished_at: string | null
  }
  steps: WorkflowRunStepItem[]
}

export type WorkflowEditorData = {
  workflow: WorkflowDetail
  agents: { id: string; name: string }[]
  phone_numbers: { id: string; number: string; name: string | null }[]
  provider_configured: boolean
  latest_run: WorkflowRunDetail | null
}

// No backing integration yet (no SMS provider, no LLM client in this app) —
// these complete instantly with a `simulated` marker so real nodes downstream
// still run.
const SIMULATED_NODE_TYPES = new Set(["sms", "classifier", "writer"])
const TERMINAL_STEP_STATUSES = new Set(["completed", "failed", "skipped"])
const FINAL_CALL_STATUSES = new Set(["ended", "failed"])
const HTTP_TIMEOUT_MS = 10_000
const HTTP_BODY_SNIPPET_CHARS = 500
// Stop reading a response after this many bytes — the timeout bounds time,
// not size, and only a snippet is ever stored.
const HTTP_BODY_MAX_BYTES = 64 * 1024
// Synchronous nodes cascade within one tick; the cap only guards against a
// cyclic graph looping forever.
const MAX_TICK_ITERATIONS = 100

function workflowNodes(row: { nodes: unknown }): FlowNode[] {
  return (row.nodes ?? []) as FlowNode[]
}

function workflowEdges(row: { edges: unknown }): FlowEdge[] {
  return (row.edges ?? []) as FlowEdge[]
}

function serializeWorkflow(row: AiAgentsAutomationWorkflow): WorkflowDetail {
  return {
    id: row.id,
    name: row.name,
    nodes: workflowNodes(row),
    edges: workflowEdges(row),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

function serializeStep(row: AiAgentsWorkflowRunStep): WorkflowRunStepItem {
  return {
    id: row.id,
    node_id: row.nodeId,
    node_type: row.nodeType,
    node_name: row.nodeName,
    status: row.status,
    output: (row.output ?? null) as Record<string, unknown> | null,
    call_id: row.callId,
    error: row.error,
    started_at: row.startedAt ? row.startedAt.toISOString() : null,
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  }
}

function serializeRun(
  run: AiAgentsWorkflowRun,
  steps: AiAgentsWorkflowRunStep[]
): WorkflowRunDetail {
  return {
    run: {
      id: run.id,
      workflow_id: run.workflowId,
      status: run.status,
      contact_id: run.contactId,
      error: run.error,
      started_at: run.startedAt.toISOString(),
      finished_at: run.finishedAt ? run.finishedAt.toISOString() : null,
    },
    steps: steps.map(serializeStep),
  }
}

async function requireWorkspaceWorkflow(workspaceId: string, workflowId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsAutomationWorkflows)
    .where(
      and(
        eq(aiAgentsAutomationWorkflows.workspaceId, workspaceId),
        eq(aiAgentsAutomationWorkflows.id, workflowId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Workflow not found")
  }
  return row
}

async function requireWorkspaceRun(workspaceId: string, runId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsWorkflowRuns)
    .where(
      and(
        eq(aiAgentsWorkflowRuns.workspaceId, workspaceId),
        eq(aiAgentsWorkflowRuns.id, runId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Run not found")
  }
  return row
}

async function loadRunSteps(runId: string) {
  return db
    .select()
    .from(aiAgentsWorkflowRunSteps)
    .where(eq(aiAgentsWorkflowRunSteps.runId, runId))
    .orderBy(asc(aiAgentsWorkflowRunSteps.createdAt))
}

async function getWorkflowRunDetail(
  workspaceId: string,
  runId: string
): Promise<WorkflowRunDetail> {
  const run = await requireWorkspaceRun(workspaceId, runId)
  return serializeRun(run, await loadRunSteps(runId))
}

async function hasActiveRun(workflowId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: aiAgentsWorkflowRuns.id })
    .from(aiAgentsWorkflowRuns)
    .where(
      and(
        eq(aiAgentsWorkflowRuns.workflowId, workflowId),
        eq(aiAgentsWorkflowRuns.status, "running")
      )
    )
    .limit(1)
  return Boolean(row)
}

async function getLatestRunDetail(
  workflowId: string
): Promise<WorkflowRunDetail | null> {
  const [run] = await db
    .select()
    .from(aiAgentsWorkflowRuns)
    .where(eq(aiAgentsWorkflowRuns.workflowId, workflowId))
    .orderBy(desc(aiAgentsWorkflowRuns.startedAt))
    .limit(1)
  if (!run) return null
  return serializeRun(run, await loadRunSteps(run.id))
}

// --- CRUD ---

export async function listWorkflows(
  workspaceId: string
): Promise<WorkflowListResponse> {
  const rows = await db
    .select()
    .from(aiAgentsAutomationWorkflows)
    .where(eq(aiAgentsAutomationWorkflows.workspaceId, workspaceId))
    .orderBy(desc(aiAgentsAutomationWorkflows.updatedAt))
  const runRows = await db
    .select({
      workflowId: aiAgentsWorkflowRuns.workflowId,
      status: aiAgentsWorkflowRuns.status,
      startedAt: aiAgentsWorkflowRuns.startedAt,
    })
    .from(aiAgentsWorkflowRuns)
    .where(eq(aiAgentsWorkflowRuns.workspaceId, workspaceId))
    .orderBy(desc(aiAgentsWorkflowRuns.startedAt))
  const latestRunByWorkflow = new Map<
    string,
    { status: string; startedAt: Date }
  >()
  for (const run of runRows) {
    if (!latestRunByWorkflow.has(run.workflowId)) {
      latestRunByWorkflow.set(run.workflowId, run)
    }
  }
  return {
    workflows: rows.map((row) => {
      const latest = latestRunByWorkflow.get(row.id)
      return {
        id: row.id,
        name: row.name,
        node_count: workflowNodes(row).length,
        last_run_status: latest?.status ?? null,
        last_run_at: latest ? latest.startedAt.toISOString() : null,
        created_at: row.createdAt.toISOString(),
        updated_at: row.updatedAt.toISOString(),
      }
    }),
  }
}

export async function createWorkflow(
  workspaceId: string,
  name: string
): Promise<WorkflowDetail> {
  const createdAt = now()
  const [row] = await db
    .insert(aiAgentsAutomationWorkflows)
    .values({
      id: uuid(),
      workspaceId,
      name,
      nodes: createInitialNodes(),
      edges: [],
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return serializeWorkflow(row)
}

export async function getWorkflowEditorData(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowEditorData> {
  const workflow = await requireWorkspaceWorkflow(workspaceId, workflowId)
  const agents = await db
    .select({ id: aiAgentsAgents.id, name: aiAgentsAgents.name })
    .from(aiAgentsAgents)
    .where(eq(aiAgentsAgents.workspaceId, workspaceId))
    .orderBy(desc(aiAgentsAgents.createdAt))
  const phoneNumbers = await db
    .select({
      id: aiAgentsPhoneNumbers.id,
      number: aiAgentsPhoneNumbers.number,
      name: aiAgentsPhoneNumbers.name,
    })
    .from(aiAgentsPhoneNumbers)
    .where(eq(aiAgentsPhoneNumbers.workspaceId, workspaceId))
    .orderBy(desc(aiAgentsPhoneNumbers.createdAt))
  return {
    workflow: serializeWorkflow(workflow),
    agents,
    phone_numbers: phoneNumbers,
    provider_configured: isVoiceProviderConfigured(),
    latest_run: await getLatestRunDetail(workflowId),
  }
}

export async function updateWorkflow(
  workspaceId: string,
  input: { workflowId: string; name: string; nodes: FlowNode[]; edges: FlowEdge[] }
): Promise<WorkflowDetail> {
  await requireWorkspaceWorkflow(workspaceId, input.workflowId)
  const [row] = await db
    .update(aiAgentsAutomationWorkflows)
    .set({
      name: input.name,
      nodes: input.nodes,
      edges: input.edges,
      updatedAt: now(),
    })
    .where(eq(aiAgentsAutomationWorkflows.id, input.workflowId))
    .returning()
  return serializeWorkflow(row)
}

export async function duplicateWorkflow(
  workspaceId: string,
  workflowId: string
): Promise<WorkflowDetail> {
  const source = await requireWorkspaceWorkflow(workspaceId, workflowId)
  const createdAt = now()
  const [row] = await db
    .insert(aiAgentsAutomationWorkflows)
    .values({
      id: uuid(),
      workspaceId,
      name: `${source.name} copy`.slice(0, 255),
      nodes: workflowNodes(source),
      edges: workflowEdges(source),
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return serializeWorkflow(row)
}

export async function deleteWorkflow(
  workspaceId: string,
  workflowId: string
): Promise<void> {
  await requireWorkspaceWorkflow(workspaceId, workflowId)
  if (await hasActiveRun(workflowId)) {
    throw new Error("Cancel the active run before deleting")
  }
  await db
    .delete(aiAgentsAutomationWorkflows)
    .where(eq(aiAgentsAutomationWorkflows.id, workflowId))
}

// --- Run engine ---
// Same execution model as campaigns: no background worker, the editor polls
// tickWorkflowRun while the run is live and each beat is idempotent.

export async function startWorkflowRun(
  workspaceId: string,
  workflowId: string,
  contactId?: string | null
): Promise<WorkflowRunDetail> {
  const workflow = await requireWorkspaceWorkflow(workspaceId, workflowId)
  const nodes = workflowNodes(workflow)
  const edges = workflowEdges(workflow)

  const triggers = nodes.filter((node) => typeDef(node.type).cat === "trigger")
  if (triggers.length === 0) {
    throw new Error("Workflow has no trigger node")
  }
  if (await hasActiveRun(workflowId)) {
    throw new Error("A run is already in progress")
  }

  let contact: AiAgentsContact | null = null
  if (nodes.some((node) => CONTACT_NODE_TYPES.has(node.type))) {
    if (!contactId) {
      throw new Error("Select a contact for this run")
    }
    const [row] = await db
      .select()
      .from(aiAgentsContacts)
      .where(
        and(
          eq(aiAgentsContacts.workspaceId, workspaceId),
          eq(aiAgentsContacts.id, contactId)
        )
      )
      .limit(1)
    if (!row) {
      throw new Error("Contact not found")
    }
    contact = row
  }

  // Voice prerequisites fail the whole start, not a mid-run step — the
  // config problem is fixable before anything has happened.
  const voiceNodes = nodes.filter((node) => node.type === "voicecall")
  if (voiceNodes.length > 0) {
    if (!isVoiceProviderConfigured()) {
      throw new Error("Voice provider not configured")
    }
    for (const node of voiceNodes) {
      await requireVoiceNodeAgent(workspaceId, node)
      await requireVoiceNodePhoneNumber(workspaceId, node)
    }
  }

  // Steps exist only for nodes reachable from a trigger; orphans never run.
  const reachable = new Set(triggers.map((node) => node.id))
  const queue = [...reachable]
  while (queue.length) {
    const id = queue.shift() as string
    for (const edge of edges) {
      if (edge.from === id && !reachable.has(edge.to)) {
        reachable.add(edge.to)
        queue.push(edge.to)
      }
    }
  }

  const timestamp = now()
  const [run] = await db
    .insert(aiAgentsWorkflowRuns)
    .values({
      id: uuid(),
      workspaceId,
      workflowId,
      contactId: contact?.id ?? null,
      status: "running",
      triggerType: "manual",
      nodes,
      edges,
      startedAt: timestamp,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  await db.insert(aiAgentsWorkflowRunSteps).values(
    nodes
      .filter((node) => reachable.has(node.id))
      .map((node) => ({
        id: uuid(),
        workspaceId,
        runId: run.id,
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        status: "pending",
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
  )

  return tickWorkflowRun(workspaceId, run.id)
}

export async function tickWorkflowRun(
  workspaceId: string,
  runId: string
): Promise<WorkflowRunDetail> {
  const run = await requireWorkspaceRun(workspaceId, runId)
  if (run.status !== "running") {
    return serializeRun(run, await loadRunSteps(runId))
  }

  const nodes = workflowNodes(run)
  const edges = workflowEdges(run)
  const nodeById = new Map(nodes.map((node) => [node.id, node]))
  const context: TickContext = {
    workspaceId,
    run,
    contact: run.contactId ? await loadRunContact(workspaceId, run.contactId) : null,
    syncedAgents: new Map(),
    deferredNodeIds: new Set(),
  }

  // 1) Settle voice calls started on earlier ticks.
  const waitingSteps = (await loadRunSteps(runId)).filter(
    (step) => step.status === "waiting"
  )
  for (const step of waitingSteps) {
    await settleVoiceStep(step)
  }

  // 2) Execute every step that became ready, looping so synchronous chains
  // finish within a single tick.
  for (let iteration = 0; iteration < MAX_TICK_ITERATIONS; iteration++) {
    const steps = await loadRunSteps(runId)
    const stepByNode = new Map(steps.map((step) => [step.nodeId, step]))
    let progressed = false

    for (const step of steps) {
      if (step.status !== "pending" || context.deferredNodeIds.has(step.nodeId)) {
        continue
      }
      // Only edges from nodes that have steps count — a reachable node can
      // also be fed by an orphaned node that never runs.
      const incoming = edges
        .filter((edge) => edge.to === step.nodeId && stepByNode.has(edge.from))
        .map((edge) => ({
          edge,
          source: stepByNode.get(edge.from) as AiAgentsWorkflowRunStep,
        }))
      if (
        !incoming.every(({ source }) => TERMINAL_STEP_STATUSES.has(source.status))
      ) {
        continue
      }
      const hasTakenEdge = incoming.some(({ edge, source }) =>
        isEdgeTaken(edge, source)
      )
      if (incoming.length > 0 && !hasTakenEdge) {
        // Every path in was skipped, failed, or branched away.
        await updateStep(step.id, { status: "skipped", finishedAt: now() })
        progressed = true
        continue
      }
      const [claimed] = await db
        .update(aiAgentsWorkflowRunSteps)
        .set({ status: "running", startedAt: now(), updatedAt: now() })
        .where(
          and(
            eq(aiAgentsWorkflowRunSteps.id, step.id),
            eq(aiAgentsWorkflowRunSteps.status, "pending")
          )
        )
        .returning()
      if (!claimed) continue // Another tick claimed it.
      const node = nodeById.get(step.nodeId)
      if (!node) {
        await updateStep(step.id, {
          status: "failed",
          error: "Node missing from run snapshot",
          finishedAt: now(),
        })
      } else {
        await executeStep(context, node, claimed, steps)
      }
      progressed = true
    }

    if (!progressed) break
  }

  // 3) Finalize when nothing can move anymore.
  const steps = await loadRunSteps(runId)
  const open = steps.some((step) => !TERMINAL_STEP_STATUSES.has(step.status))
  if (!open) {
    const failed = steps.some((step) => step.status === "failed")
    const timestamp = now()
    await db
      .update(aiAgentsWorkflowRuns)
      .set({
        status: failed ? "failed" : "completed",
        finishedAt: timestamp,
        updatedAt: timestamp,
      })
      .where(eq(aiAgentsWorkflowRuns.id, runId))
  }

  return getWorkflowRunDetail(workspaceId, runId)
}

export async function cancelWorkflowRun(
  workspaceId: string,
  runId: string
): Promise<WorkflowRunDetail> {
  const run = await requireWorkspaceRun(workspaceId, runId)
  if (run.status !== "running") {
    return serializeRun(run, await loadRunSteps(runId))
  }
  const timestamp = now()
  await db
    .update(aiAgentsWorkflowRuns)
    .set({ status: "canceled", finishedAt: timestamp, updatedAt: timestamp })
    .where(eq(aiAgentsWorkflowRuns.id, runId))
  const steps = await loadRunSteps(runId)
  for (const step of steps) {
    if (TERMINAL_STEP_STATUSES.has(step.status)) continue
    await updateStep(step.id, { status: "skipped", finishedAt: timestamp })
  }
  return getWorkflowRunDetail(workspaceId, runId)
}

type TickContext = {
  workspaceId: string
  run: AiAgentsWorkflowRun
  contact: AiAgentsContact | null
  // syncAgentToProvider once per agent per tick, not once per node.
  syncedAgents: Map<string, string>
  // Rate-limited (429) this tick — left pending for the next beat, and the
  // in-tick loop must not immediately re-claim them.
  deferredNodeIds: Set<string>
}

async function loadRunContact(workspaceId: string, contactId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspaceId),
        eq(aiAgentsContacts.id, contactId)
      )
    )
    .limit(1)
  return row ?? null
}

async function updateStep(
  stepId: string,
  fields: Partial<{
    status: string
    output: Record<string, unknown>
    callId: string | null
    error: string | null
    finishedAt: Date
  }>
) {
  await db
    .update(aiAgentsWorkflowRunSteps)
    .set({ ...fields, updatedAt: now() })
    .where(eq(aiAgentsWorkflowRunSteps.id, stepId))
}

// An edge carries execution when its source completed and, for multi-output
// nodes (branch), the source actually chose this port.
function isEdgeTaken(edge: FlowEdge, source: AiAgentsWorkflowRunStep): boolean {
  if (source.status !== "completed") return false
  if ((typeDef(source.nodeType).outputs ?? 1) <= 1) return true
  const output = (source.output ?? {}) as Record<string, unknown>
  return edge.port === Number(output.port ?? 0)
}

async function requireVoiceNodeAgent(workspaceId: string, node: FlowNode) {
  const agentId = String(node.config.agentId ?? "")
  const [agent] = agentId
    ? await db
        .select()
        .from(aiAgentsAgents)
        .where(
          and(
            eq(aiAgentsAgents.workspaceId, workspaceId),
            eq(aiAgentsAgents.id, agentId)
          )
        )
        .limit(1)
    : []
  if (!agent) {
    throw new Error("Agent not found")
  }
  return agent
}

async function requireVoiceNodePhoneNumber(workspaceId: string, node: FlowNode) {
  const phoneNumberId = String(node.config.phoneNumberId ?? "")
  const [phoneNumber] = phoneNumberId
    ? await db
        .select()
        .from(aiAgentsPhoneNumbers)
        .where(
          and(
            eq(aiAgentsPhoneNumbers.workspaceId, workspaceId),
            eq(aiAgentsPhoneNumbers.id, phoneNumberId)
          )
        )
        .limit(1)
    : []
  if (!phoneNumber) {
    throw new Error("Phone number not found")
  }
  return phoneNumber
}

// Reads the finished call for a waiting voicecall step and finalizes it.
async function settleVoiceStep(step: AiAgentsWorkflowRunStep) {
  let [call] = step.callId
    ? await db
        .select()
        .from(aiAgentsCalls)
        .where(eq(aiAgentsCalls.id, step.callId))
        .limit(1)
    : []
  if (!call) {
    await updateStep(step.id, {
      status: "failed",
      error: "Call record missing",
      finishedAt: now(),
    })
    return
  }
  if (!FINAL_CALL_STATUSES.has(call.status) && call.providerCallId) {
    await applyNormalizedCall(
      call.id,
      await getVoiceProvider().getCall(call.providerCallId)
    )
    ;[call] = await db
      .select()
      .from(aiAgentsCalls)
      .where(eq(aiAgentsCalls.id, call.id))
      .limit(1)
  }
  if (!FINAL_CALL_STATUSES.has(call.status)) return // Still live — next tick.
  await updateStep(step.id, {
    status: call.status === "ended" ? "completed" : "failed",
    output: { call_status: call.status, ended_reason: call.endedReason },
    error: call.status === "failed" ? call.endedReason : null,
    finishedAt: now(),
  })
}

async function executeStep(
  context: TickContext,
  node: FlowNode,
  step: AiAgentsWorkflowRunStep,
  steps: AiAgentsWorkflowRunStep[]
) {
  const category = typeDef(node.type).cat
  try {
    if (category === "trigger") {
      await updateStep(step.id, {
        status: "completed",
        output: { fired: "manual" },
        finishedAt: now(),
      })
    } else if (node.type === "merge") {
      await updateStep(step.id, {
        status: "completed",
        output: { merged: true },
        finishedAt: now(),
      })
    } else if (SIMULATED_NODE_TYPES.has(node.type)) {
      await updateStep(step.id, {
        status: "completed",
        output: { simulated: true },
        finishedAt: now(),
      })
    } else if (node.type === "branch") {
      await executeBranchStep(node, step, steps)
    } else if (node.type === "http") {
      await executeHttpStep(context, node, step)
    } else if (node.type === "updatecontact") {
      await executeUpdateContactStep(context, node, step)
    } else if (node.type === "voicecall") {
      await executeVoiceCallStep(context, node, step)
    } else {
      throw new Error(`Unsupported node type: ${node.type}`)
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    await updateStep(step.id, {
      status: "failed",
      error: message,
      finishedAt: now(),
    })
  }
}

const CONDITION_RE = /^\s*(\w+)\s*(==|!=)\s*"([^"]*)"\s*$/

// The variables a branch condition can reference, derived from what already
// happened in this run. Today that's the latest finished voice call.
function buildRunContext(
  steps: AiAgentsWorkflowRunStep[]
): Record<string, string> {
  const voiceSteps = steps
    .filter(
      (step) =>
        step.nodeType === "voicecall" &&
        step.status === "completed" &&
        step.finishedAt
    )
    .sort(
      (a, b) => (b.finishedAt?.getTime() ?? 0) - (a.finishedAt?.getTime() ?? 0)
    )
  const latest = voiceSteps[0]
  if (!latest) return {}
  const output = (latest.output ?? {}) as Record<string, unknown>
  const callStatus = String(output.call_status ?? "")
  const endedReason = String(output.ended_reason ?? "")
  const outcome =
    callStatus !== "ended"
      ? "failed"
      : /no[-_ ]?answer|did-not-answer|busy|voicemail/i.test(endedReason)
        ? "no_answer"
        : "completed"
  return { outcome, status: callStatus, ended_reason: endedReason }
}

async function executeBranchStep(
  node: FlowNode,
  step: AiAgentsWorkflowRunStep,
  steps: AiAgentsWorkflowRunStep[]
) {
  const cond = String(node.config.cond ?? "")
  const context = buildRunContext(steps)
  const match = CONDITION_RE.exec(cond)
  let result = false
  if (match) {
    const [, key, op, expected] = match
    const actual = context[key]
    if (actual !== undefined) {
      result = op === "==" ? actual === expected : actual !== expected
    }
  }
  // Port 0 is the "true" output, port 1 is "false" (canvas port labels).
  await updateStep(step.id, {
    status: "completed",
    output: { cond, result, port: result ? 0 : 1 },
    finishedAt: now(),
  })
}

// SSRF guard: the server fetches user-configured URLs, so refuse addresses
// only the server can reach — loopback, private LAN, link-local (cloud
// metadata), CGNAT, and unique-local IPv6.
function isPrivateAddress(address: string): boolean {
  if (isIP(address) === 6) {
    const ip = address.toLowerCase()
    // IPv4-mapped IPv6, dotted (::ffff:127.0.0.1) or hex (::ffff:7f00:1 —
    // the form WHATWG URLs normalize to): check the embedded IPv4 instead.
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip)
    if (mapped) return isPrivateAddress(mapped[1])
    const hexMapped = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/.exec(ip)
    if (hexMapped) {
      const hi = Number.parseInt(hexMapped[1], 16)
      const lo = Number.parseInt(hexMapped[2], 16)
      return isPrivateAddress(
        `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`
      )
    }
    return (
      ip === "::" ||
      ip === "::1" ||
      ip.startsWith("fe80:") ||
      ip.startsWith("fc") ||
      ip.startsWith("fd")
    )
  }
  const octets = address.split(".").map(Number)
  if (
    octets.length !== 4 ||
    octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)
  ) {
    return true // Unparseable — refuse rather than guess.
  }
  const [a, b] = octets
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168)
  )
}

// Tests stub DNS so results don't depend on the machine's resolver
// (e.g. local dev resolvers map *.test to 127.0.0.1).
let dnsLookupOverride: ((hostname: string) => Promise<string[]>) | null = null

export function setDnsLookupForTests(
  fn: ((hostname: string) => Promise<string[]>) | null
) {
  dnsLookupOverride = fn
}

async function resolveHostname(hostname: string): Promise<string[]> {
  if (dnsLookupOverride) return dnsLookupOverride(hostname)
  return (await lookup(hostname, { all: true })).map((entry) => entry.address)
}

async function assertPublicHttpUrl(parsed: URL) {
  const hostname = parsed.hostname.replace(/^\[|\]$/g, "")
  if (
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("URL points to a private address")
  }
  let addresses: string[]
  if (isIP(hostname)) {
    addresses = [hostname]
  } else {
    try {
      addresses = await resolveHostname(hostname)
    } catch {
      // Unresolvable now means unresolvable for fetch too — let fetch report
      // the network error. (A DNS-rebinding race between this check and the
      // fetch's own lookup remains a known v1 limitation.)
      return
    }
  }
  if (addresses.some(isPrivateAddress)) {
    throw new Error("URL points to a private address")
  }
}

// Reads at most maxBytes of the body; only a snippet is stored anyway.
async function readBodySnippet(
  response: Response,
  maxBytes: number
): Promise<string> {
  const reader = response.body?.getReader()
  if (!reader) return ""
  const decoder = new TextDecoder()
  let text = ""
  let bytes = 0
  while (bytes < maxBytes) {
    const { done, value } = await reader.read()
    if (done) break
    bytes += value.byteLength
    text += decoder.decode(value, { stream: true })
  }
  await reader.cancel().catch(() => {})
  return text + decoder.decode()
}

async function executeHttpStep(
  context: TickContext,
  node: FlowNode,
  step: AiAgentsWorkflowRunStep
) {
  const url = String(node.config.url ?? "")
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    throw new Error("Invalid URL")
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("Invalid URL")
  }
  await assertPublicHttpUrl(parsed)
  const configMethod = String(node.config.method ?? "POST")
  const method = ["POST", "GET", "PATCH"].includes(configMethod)
    ? configMethod
    : "POST"
  const response = await fetch(url, {
    method,
    headers: method === "GET" ? undefined : { "content-type": "application/json" },
    body:
      method === "GET"
        ? undefined
        : JSON.stringify({
            workflow_id: context.run.workflowId,
            run_id: context.run.id,
            node_name: node.name,
            contact: context.contact ? buildContactVariables(context.contact) : null,
          }),
    // Manual: a redirect is recorded as the outcome instead of followed —
    // following one could bounce the request to a private address.
    redirect: "manual",
    signal: AbortSignal.timeout(HTTP_TIMEOUT_MS),
  })
  const body = (
    await readBodySnippet(response, HTTP_BODY_MAX_BYTES)
  ).slice(0, HTTP_BODY_SNIPPET_CHARS)
  const output = { status: response.status, ok: response.ok, body }
  if (!response.ok) {
    await updateStep(step.id, {
      status: "failed",
      output,
      error: `HTTP ${response.status}`,
      finishedAt: now(),
    })
    return
  }
  await updateStep(step.id, { status: "completed", output, finishedAt: now() })
}

async function executeUpdateContactStep(
  context: TickContext,
  node: FlowNode,
  step: AiAgentsWorkflowRunStep
) {
  const contact = context.contact
  if (!contact) {
    throw new Error("Contact not found")
  }
  const field = String(node.config.field ?? "Status")
  const value = String(node.config.value ?? "")
  const timestamp = now()
  if (field === "Notes") {
    await db.insert(aiAgentsContactNotes).values({
      id: uuid(),
      workspaceId: context.workspaceId,
      contactId: contact.id,
      body: value,
      createdAt: timestamp,
    })
  } else if (field === "Tags") {
    const tags = contact.tags ?? []
    if (!tags.includes(value)) {
      const nextTags = [...tags, value]
      await db
        .update(aiAgentsContacts)
        .set({ tags: nextTags, updatedAt: timestamp })
        .where(eq(aiAgentsContacts.id, contact.id))
      context.contact = { ...contact, tags: nextTags }
    }
  } else {
    const customFields = {
      ...((contact.customFields ?? {}) as Record<string, string>),
      status: value,
    }
    await db
      .update(aiAgentsContacts)
      .set({ customFields, updatedAt: timestamp })
      .where(eq(aiAgentsContacts.id, contact.id))
    context.contact = { ...contact, customFields }
  }
  await updateStep(step.id, {
    status: "completed",
    output: { field, value },
    finishedAt: now(),
  })
}

// Same recipe as the campaign dialer: insert the calls row first so history
// exists even if the provider call fails, then start it. 429 releases the
// claim so the next tick retries.
async function executeVoiceCallStep(
  context: TickContext,
  node: FlowNode,
  step: AiAgentsWorkflowRunStep
) {
  const agent = await requireVoiceNodeAgent(context.workspaceId, node)
  const phoneNumber = await requireVoiceNodePhoneNumber(context.workspaceId, node)
  const contact = context.contact
  if (!contact) {
    throw new Error("Contact not found")
  }

  let providerAssistantId = context.syncedAgents.get(agent.id)
  if (!providerAssistantId) {
    const synced = await syncAgentToProvider(agent)
    providerAssistantId = synced.providerAssistantId as string
    context.syncedAgents.set(agent.id, providerAssistantId)
  }

  const timestamp = now()
  const [callRow] = await db
    .insert(aiAgentsCalls)
    .values({
      id: uuid(),
      workspaceId: context.workspaceId,
      direction: "outbound",
      status: "queued",
      contactId: contact.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      customerNumber: contact.phone,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  await updateStep(step.id, { callId: callRow.id })

  try {
    const { providerCallId } = await getVoiceProvider().startOutboundCall({
      providerAssistantId,
      providerPhoneNumberId: phoneNumber.providerPhoneNumberId,
      customerNumber: contact.phone,
      variables: buildContactVariables(contact),
    })
    await db
      .update(aiAgentsCalls)
      .set({ providerCallId, updatedAt: now() })
      .where(eq(aiAgentsCalls.id, callRow.id))
    await updateStep(step.id, { status: "waiting" })
  } catch (error) {
    if (error instanceof ProviderError && error.status === 429) {
      await db.delete(aiAgentsCalls).where(eq(aiAgentsCalls.id, callRow.id))
      await db
        .update(aiAgentsWorkflowRunSteps)
        .set({
          status: "pending",
          callId: null,
          startedAt: null,
          updatedAt: now(),
        })
        .where(eq(aiAgentsWorkflowRunSteps.id, step.id))
      context.deferredNodeIds.add(step.nodeId)
      return
    }
    const message = error instanceof Error ? error.message : String(error)
    await db
      .update(aiAgentsCalls)
      .set({ status: "failed", endedReason: message.slice(0, 100), updatedAt: now() })
      .where(eq(aiAgentsCalls.id, callRow.id))
    throw error
  }
}

// --- Current-user wrappers (auth + origin, then the workspace-scoped core) ---

export async function listWorkflowsForCurrentUser(): Promise<WorkflowListResponse> {
  const { workspace } = await requireUserWorkspace()
  return listWorkflows(workspace.id)
}

export async function getWorkflowEditorDataForCurrentUser(
  workflowId: string
): Promise<WorkflowEditorData> {
  const { workspace } = await requireUserWorkspace()
  return getWorkflowEditorData(workspace.id, workflowId)
}

export async function createWorkflowForCurrentUser(
  name: string
): Promise<WorkflowDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return createWorkflow(workspace.id, name)
}

export async function updateWorkflowForCurrentUser(input: {
  workflowId: string
  name: string
  nodes: FlowNode[]
  edges: FlowEdge[]
}): Promise<WorkflowDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return updateWorkflow(workspace.id, input)
}

export async function duplicateWorkflowForCurrentUser(
  workflowId: string
): Promise<WorkflowDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return duplicateWorkflow(workspace.id, workflowId)
}

export async function deleteWorkflowForCurrentUser(
  workflowId: string
): Promise<void> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return deleteWorkflow(workspace.id, workflowId)
}

export async function startWorkflowRunForCurrentUser(input: {
  workflowId: string
  contactId?: string | null
}): Promise<WorkflowRunDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return startWorkflowRun(workspace.id, input.workflowId, input.contactId)
}

export async function tickWorkflowRunForCurrentUser(
  runId: string
): Promise<WorkflowRunDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return tickWorkflowRun(workspace.id, runId)
}

export async function cancelWorkflowRunForCurrentUser(
  runId: string
): Promise<WorkflowRunDetail> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  return cancelWorkflowRun(workspace.id, runId)
}
