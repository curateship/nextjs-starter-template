import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { drizzle } from "drizzle-orm/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { FlowEdge, FlowNode } from "@/components/automation/catalog"
import { graphSchema } from "@/lib/api/workflows"
import { setDbForTests, type AiAgentsDb } from "@/server/db"
import { setVoiceProviderForTests } from "@/server/providers"
import {
  ProviderError,
  type NormalizedCall,
  type VoiceProvider,
} from "@/server/providers/types"
import {
  aiAgentsAgents,
  aiAgentsCalls,
  aiAgentsContactNotes,
  aiAgentsContacts,
  aiAgentsPhoneNumbers,
  aiAgentsUsers,
  aiAgentsWorkspaces,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import {
  cancelWorkflowRun,
  createWorkflow,
  deleteWorkflow,
  duplicateWorkflow,
  getWorkflowEditorData,
  listWorkflows,
  setDnsLookupForTests,
  startWorkflowRun,
  tickWorkflowRun,
  updateWorkflow,
  type WorkflowRunDetail,
} from "@/server/workflows"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
const hadVapiKey = Object.prototype.hasOwnProperty.call(
  process.env,
  "AI_AGENTS_VAPI_API_KEY"
)
const originalVapiKey = process.env.AI_AGENTS_VAPI_API_KEY

const MIGRATIONS = [
  "0000_baseline.sql",
  "0003_workspaces.sql",
  "0004_voice_domain.sql",
  "0005_automation_workflows.sql",
]

beforeEach(async () => {
  process.env.AI_AGENTS_VAPI_API_KEY = "test-key"
  // Machine-independent DNS: hostnames used in tests resolve to a public IP.
  setDnsLookupForTests(async () => ["93.184.216.34"])
  client = new PGlite()
  for (const migration of MIGRATIONS) {
    await client.exec(
      await readFile(new URL(`../../drizzle/${migration}`, import.meta.url), "utf8")
    )
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as AiAgentsDb)
})

afterEach(async () => {
  await client.close()
  setVoiceProviderForTests(null)
  setDnsLookupForTests(null)
  vi.unstubAllGlobals()
  if (hadVapiKey) {
    process.env.AI_AGENTS_VAPI_API_KEY = originalVapiKey
  } else {
    delete process.env.AI_AGENTS_VAPI_API_KEY
  }
})

async function seedWorkspace() {
  const createdAt = now()
  const userId = uuid()
  await database.insert(aiAgentsUsers).values({
    id: userId,
    email: `${userId}@internal.dev`,
    name: "Tyler",
    role: "admin",
    passwordHash: "hash",
    createdAt,
    updatedAt: createdAt,
  })
  const workspaceId = uuid()
  await database.insert(aiAgentsWorkspaces).values({
    id: workspaceId,
    userId,
    name: "Test workspace",
    settings: {},
    createdAt,
    updatedAt: createdAt,
  })
  return workspaceId
}

async function seedContact(workspaceId: string) {
  const createdAt = now()
  const id = uuid()
  await database.insert(aiAgentsContacts).values({
    id,
    workspaceId,
    firstName: "Ada",
    lastName: "Lovelace",
    phone: "+14165550123",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function seedAgent(workspaceId: string) {
  const createdAt = now()
  const id = uuid()
  await database.insert(aiAgentsAgents).values({
    id,
    workspaceId,
    name: "Reminder agent",
    providerAssistantId: "pa-1",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

async function seedPhoneNumber(workspaceId: string) {
  const createdAt = now()
  const id = uuid()
  await database.insert(aiAgentsPhoneNumbers).values({
    id,
    workspaceId,
    providerPhoneNumberId: "ppn-1",
    number: "+14165550100",
    createdAt,
    updatedAt: createdAt,
  })
  return id
}

function endedCall(endedReason: string): NormalizedCall {
  return {
    providerCallId: "pc-1",
    status: "ended",
    endedReason,
    startedAt: new Date(),
    endedAt: new Date(),
    recordingUrl: null,
    transcript: null,
    summary: null,
    cost: null,
  }
}

function liveCall(): NormalizedCall {
  return { ...endedCall(""), status: "in_progress", endedReason: null }
}

function fakeProvider(overrides: Partial<VoiceProvider> = {}): VoiceProvider {
  return {
    createAssistant: async () => ({ providerAssistantId: "pa-1" }),
    updateAssistant: async () => {},
    deleteAssistant: async () => {},
    startOutboundCall: async () => ({ providerCallId: "pc-1" }),
    getCall: async () => endedCall("customer-ended-call"),
    listPhoneNumbers: async () => [],
    ...overrides,
  }
}

function node(
  type: string,
  id: string,
  config: Record<string, string | number> = {}
): FlowNode {
  return { id, type, x: 0, y: 0, name: id, config }
}

function edge(from: string, to: string, port = 0): FlowEdge {
  return { id: `${from}->${to}:${port}`, from, port, to }
}

function stepByNode(detail: WorkflowRunDetail, nodeId: string) {
  const step = detail.steps.find((candidate) => candidate.node_id === nodeId)
  if (!step) throw new Error(`No step for node ${nodeId}`)
  return step
}

describe("workflow CRUD", () => {
  it("creates, updates, duplicates, lists, and deletes workflows", async () => {
    const workspaceId = await seedWorkspace()
    const created = await createWorkflow(workspaceId, "Reminders")
    expect(created.nodes).toHaveLength(1)
    expect(created.nodes[0].type).toBe("appointment")

    const nodes = [node("newcontact", "t1"), node("http", "h1")]
    const edges = [edge("t1", "h1")]
    const updated = await updateWorkflow(workspaceId, {
      workflowId: created.id,
      name: "Renamed",
      nodes,
      edges,
    })
    expect(updated.name).toBe("Renamed")
    expect(updated.nodes).toHaveLength(2)

    const editorData = await getWorkflowEditorData(workspaceId, created.id)
    expect(editorData.workflow.name).toBe("Renamed")
    expect(editorData.workflow.edges).toEqual(edges)
    expect(editorData.latest_run).toBeNull()

    const copy = await duplicateWorkflow(workspaceId, created.id)
    expect(copy.name).toBe("Renamed copy")
    expect(copy.nodes).toEqual(nodes)
    expect(copy.id).not.toBe(created.id)

    const listed = await listWorkflows(workspaceId)
    expect(listed.workflows).toHaveLength(2)
    expect(listed.workflows.map((w) => w.node_count)).toEqual([2, 2])

    await deleteWorkflow(workspaceId, created.id)
    expect((await listWorkflows(workspaceId)).workflows).toHaveLength(1)
  })

  it("scopes workflows to their workspace", async () => {
    const workspaceA = await seedWorkspace()
    const workspaceB = await seedWorkspace()
    const workflow = await createWorkflow(workspaceA, "Private")

    await expect(getWorkflowEditorData(workspaceB, workflow.id)).rejects.toThrow(
      "Workflow not found"
    )
    await expect(
      updateWorkflow(workspaceB, {
        workflowId: workflow.id,
        name: "Hijack",
        nodes: [],
        edges: [],
      })
    ).rejects.toThrow("Workflow not found")
    expect((await listWorkflows(workspaceB)).workflows).toHaveLength(0)
  })
})

describe("workflow graph validation", () => {
  const trigger = node("newcontact", "t1")

  it("rejects unknown node types", () => {
    const result = graphSchema.safeParse({
      nodes: [node("teleport", "x1")],
      edges: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects edges to missing nodes", () => {
    const result = graphSchema.safeParse({
      nodes: [trigger],
      edges: [edge("t1", "ghost")],
    })
    expect(result.success).toBe(false)
  })

  it("rejects invalid output ports and edges into triggers", () => {
    expect(
      graphSchema.safeParse({
        nodes: [trigger, node("http", "h1")],
        edges: [edge("t1", "h1", 1)],
      }).success
    ).toBe(false)
    expect(
      graphSchema.safeParse({
        nodes: [trigger, node("http", "h1")],
        edges: [edge("h1", "t1")],
      }).success
    ).toBe(false)
  })

  it("rejects nodes with too many config fields", () => {
    const config: Record<string, string> = {}
    for (let i = 0; i < 33; i++) config[`key${i}`] = "value"
    expect(
      graphSchema.safeParse({ nodes: [node("http", "h1", config)], edges: [] })
        .success
    ).toBe(false)
  })

  it("rejects oversized graphs and accepts a valid one", () => {
    const tooMany = Array.from({ length: 101 }, (_, i) => node("merge", `n${i}`))
    expect(graphSchema.safeParse({ nodes: tooMany, edges: [] }).success).toBe(false)
    expect(
      graphSchema.safeParse({
        nodes: [trigger, node("branch", "b1"), node("http", "h1")],
        edges: [edge("t1", "b1"), edge("b1", "h1", 1)],
      }).success
    ).toBe(true)
  })
})

describe("workflow run engine", () => {
  async function seedVoiceWorkflow(
    workspaceId: string,
    agentId: string,
    phoneNumberId: string
  ) {
    const workflow = await createWorkflow(workspaceId, "Voice flow")
    // appointment → voicecall → branch: true(0)→updatecontact, false(1)→http
    return updateWorkflow(workspaceId, {
      workflowId: workflow.id,
      name: workflow.name,
      nodes: [
        node("appointment", "t1"),
        node("voicecall", "v1", { agentId, phoneNumberId }),
        node("branch", "b1", { cond: 'outcome == "no_answer"' }),
        node("updatecontact", "u1", { field: "Status", value: "reminded" }),
        node("http", "h1", { url: "https://example.test/hook", method: "POST" }),
      ],
      edges: [
        edge("t1", "v1"),
        edge("v1", "b1"),
        edge("b1", "u1", 0),
        edge("b1", "h1", 1),
      ],
    })
  }

  it("runs a voice workflow across ticks, branching on the call outcome", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)
    setVoiceProviderForTests(fakeProvider())
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    const workflow = await seedVoiceWorkflow(workspaceId, agentId, phoneNumberId)
    const started = await startWorkflowRun(workspaceId, workflow.id, contactId)

    // Tick 1 (inline in start): trigger done, call placed and awaited.
    expect(started.run.status).toBe("running")
    expect(stepByNode(started, "t1").status).toBe("completed")
    expect(stepByNode(started, "v1").status).toBe("waiting")
    expect(stepByNode(started, "b1").status).toBe("pending")
    const calls = await database.select().from(aiAgentsCalls)
    expect(calls).toHaveLength(1)
    expect(calls[0].providerCallId).toBe("pc-1")
    expect(calls[0].contactId).toBe(contactId)

    // Tick 2: call ended normally → outcome "completed" → branch false port →
    // http runs, updatecontact path is skipped.
    const finished = await tickWorkflowRun(workspaceId, started.run.id)
    expect(stepByNode(finished, "v1").status).toBe("completed")
    expect(stepByNode(finished, "b1").output).toMatchObject({
      result: false,
      port: 1,
    })
    expect(stepByNode(finished, "h1").status).toBe("completed")
    expect(stepByNode(finished, "h1").output).toMatchObject({ status: 200, ok: true })
    expect(stepByNode(finished, "u1").status).toBe("skipped")
    expect(finished.run.status).toBe("completed")
    expect(finished.run.finished_at).not.toBeNull()
    expect(fetchMock).toHaveBeenCalledTimes(1)

    const listed = await listWorkflows(workspaceId)
    expect(listed.workflows[0].last_run_status).toBe("completed")
  })

  it("takes the true branch when the call was not answered", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)
    setVoiceProviderForTests(
      fakeProvider({ getCall: async () => endedCall("customer-did-not-answer") })
    )

    const workflow = await seedVoiceWorkflow(workspaceId, agentId, phoneNumberId)
    const started = await startWorkflowRun(workspaceId, workflow.id, contactId)
    const finished = await tickWorkflowRun(workspaceId, started.run.id)

    expect(stepByNode(finished, "b1").output).toMatchObject({ result: true, port: 0 })
    expect(stepByNode(finished, "u1").status).toBe("completed")
    expect(stepByNode(finished, "h1").status).toBe("skipped")
    const [contact] = await database
      .select()
      .from(aiAgentsContacts)
      .where(eq(aiAgentsContacts.id, contactId))
    expect((contact.customFields as Record<string, string>).status).toBe("reminded")
  })

  it("fails the step and run on provider errors, skipping downstream nodes", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)
    setVoiceProviderForTests(
      fakeProvider({
        startOutboundCall: async () => {
          throw new ProviderError(500, "Vapi request failed (500)")
        },
      })
    )

    const workflow = await seedVoiceWorkflow(workspaceId, agentId, phoneNumberId)
    const detail = await startWorkflowRun(workspaceId, workflow.id, contactId)

    expect(stepByNode(detail, "v1").status).toBe("failed")
    expect(stepByNode(detail, "b1").status).toBe("skipped")
    expect(stepByNode(detail, "u1").status).toBe("skipped")
    expect(stepByNode(detail, "h1").status).toBe("skipped")
    expect(detail.run.status).toBe("failed")
    const calls = await database.select().from(aiAgentsCalls)
    expect(calls[0].status).toBe("failed")
  })

  it("releases the claim on 429 and retries on the next tick", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)
    let attempts = 0
    setVoiceProviderForTests(
      fakeProvider({
        startOutboundCall: async () => {
          attempts++
          if (attempts === 1) throw new ProviderError(429, "Rate limited")
          return { providerCallId: "pc-1" }
        },
        getCall: async () => liveCall(),
      })
    )

    const workflow = await seedVoiceWorkflow(workspaceId, agentId, phoneNumberId)
    const started = await startWorkflowRun(workspaceId, workflow.id, contactId)
    expect(stepByNode(started, "v1").status).toBe("pending")
    expect(started.run.status).toBe("running")
    expect(await database.select().from(aiAgentsCalls)).toHaveLength(0)

    const retried = await tickWorkflowRun(workspaceId, started.run.id)
    expect(stepByNode(retried, "v1").status).toBe("waiting")
    expect(await database.select().from(aiAgentsCalls)).toHaveLength(1)
  })

  it("writes Notes and Tags updates and treats stub nodes as simulated", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const workflow = await createWorkflow(workspaceId, "CRM flow")
    await updateWorkflow(workspaceId, {
      workflowId: workflow.id,
      name: workflow.name,
      nodes: [
        node("newcontact", "t1"),
        node("writer", "w1"),
        node("sms", "s1"),
        node("updatecontact", "n1", { field: "Notes", value: "Called them" }),
        node("updatecontact", "g1", { field: "Tags", value: "vip" }),
      ],
      edges: [edge("t1", "w1"), edge("w1", "s1"), edge("s1", "n1"), edge("n1", "g1")],
    })

    const detail = await startWorkflowRun(workspaceId, workflow.id, contactId)
    expect(detail.run.status).toBe("completed")
    expect(stepByNode(detail, "w1").output).toMatchObject({ simulated: true })
    expect(stepByNode(detail, "s1").output).toMatchObject({ simulated: true })
    expect(stepByNode(detail, "n1").status).toBe("completed")

    const notes = await database.select().from(aiAgentsContactNotes)
    expect(notes).toHaveLength(1)
    expect(notes[0].body).toBe("Called them")
    const [contact] = await database
      .select()
      .from(aiAgentsContacts)
      .where(eq(aiAgentsContacts.id, contactId))
    expect(contact.tags).toContain("vip")
  })

  it("blocks HTTP requests to private addresses and does not follow redirects", async () => {
    const workspaceId = await seedWorkspace()
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }))
    vi.stubGlobal("fetch", fetchMock)

    // Loopback hostname and link-local (cloud metadata) IP are both refused
    // before any request is made.
    for (const url of [
      "http://localhost:3008/steal",
      "http://169.254.169.254/latest/meta-data",
      "http://127.0.0.1/x",
      "http://[::1]/x",
      "http://[::ffff:7f00:1]/x", // hex-form IPv4-mapped loopback
    ]) {
      const workflow = await createWorkflow(workspaceId, `SSRF ${url}`)
      await updateWorkflow(workspaceId, {
        workflowId: workflow.id,
        name: workflow.name,
        nodes: [node("newcontact", "t1"), node("http", "h1", { url })],
        edges: [edge("t1", "h1")],
      })
      const detail = await startWorkflowRun(workspaceId, workflow.id)
      expect(stepByNode(detail, "h1").status).toBe("failed")
      expect(stepByNode(detail, "h1").error).toBe(
        "URL points to a private address"
      )
    }
    expect(fetchMock).not.toHaveBeenCalled()

    // A redirect is recorded as the outcome, not followed.
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 302 }))
    const redirected = await createWorkflow(workspaceId, "Redirect flow")
    await updateWorkflow(workspaceId, {
      workflowId: redirected.id,
      name: redirected.name,
      nodes: [
        node("newcontact", "t1"),
        node("http", "h1", { url: "https://example.test/hook" }),
      ],
      edges: [edge("t1", "h1")],
    })
    const detail = await startWorkflowRun(workspaceId, redirected.id)
    expect(stepByNode(detail, "h1").status).toBe("failed")
    expect(stepByNode(detail, "h1").error).toBe("HTTP 302")
    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/hook",
      expect.objectContaining({ redirect: "manual" })
    )
  })

  it("stops reading oversized response bodies", async () => {
    const workspaceId = await seedWorkspace()
    const chunk = new TextEncoder().encode("x".repeat(16 * 1024))
    let pulls = 0
    const endlessBody = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulls++
        controller.enqueue(chunk)
      },
    })
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(endlessBody, { status: 200 }))
    )

    const workflow = await createWorkflow(workspaceId, "Big body flow")
    await updateWorkflow(workspaceId, {
      workflowId: workflow.id,
      name: workflow.name,
      nodes: [
        node("newcontact", "t1"),
        node("http", "h1", { url: "https://example.test/huge" }),
      ],
      edges: [edge("t1", "h1")],
    })
    const detail = await startWorkflowRun(workspaceId, workflow.id)
    const step = stepByNode(detail, "h1")
    expect(step.status).toBe("completed")
    expect(String((step.output as Record<string, unknown>).body)).toHaveLength(500)
    // 64KB cap ÷ 16KB chunks — the stream was abandoned, not drained.
    expect(pulls).toBeLessThanOrEqual(6)
  })

  it("enforces start guards", async () => {
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)

    // No trigger node.
    const noTrigger = await createWorkflow(workspaceId, "No trigger")
    await updateWorkflow(workspaceId, {
      workflowId: noTrigger.id,
      name: noTrigger.name,
      nodes: [node("http", "h1", { url: "https://example.test" })],
      edges: [],
    })
    await expect(startWorkflowRun(workspaceId, noTrigger.id)).rejects.toThrow(
      "Workflow has no trigger node"
    )

    // Contact-dependent node without a contact.
    const needsContact = await createWorkflow(workspaceId, "Needs contact")
    await updateWorkflow(workspaceId, {
      workflowId: needsContact.id,
      name: needsContact.name,
      nodes: [node("newcontact", "t1"), node("updatecontact", "u1")],
      edges: [edge("t1", "u1")],
    })
    await expect(startWorkflowRun(workspaceId, needsContact.id)).rejects.toThrow(
      "Select a contact for this run"
    )

    // Voice node with a missing agent reference.
    const badAgent = await createWorkflow(workspaceId, "Bad agent")
    await updateWorkflow(workspaceId, {
      workflowId: badAgent.id,
      name: badAgent.name,
      nodes: [
        node("newcontact", "t1"),
        node("voicecall", "v1", { agentId: "missing", phoneNumberId }),
      ],
      edges: [edge("t1", "v1")],
    })
    await expect(
      startWorkflowRun(workspaceId, badAgent.id, contactId)
    ).rejects.toThrow("Agent not found")

    // Concurrent runs and delete-while-running, then cancel unblocks both.
    setVoiceProviderForTests(fakeProvider({ getCall: async () => liveCall() }))
    const voiceFlow = await createWorkflow(workspaceId, "Voice flow")
    await updateWorkflow(workspaceId, {
      workflowId: voiceFlow.id,
      name: voiceFlow.name,
      nodes: [
        node("newcontact", "t1"),
        node("voicecall", "v1", { agentId, phoneNumberId }),
      ],
      edges: [edge("t1", "v1")],
    })
    const running = await startWorkflowRun(workspaceId, voiceFlow.id, contactId)
    expect(running.run.status).toBe("running")
    await expect(
      startWorkflowRun(workspaceId, voiceFlow.id, contactId)
    ).rejects.toThrow("A run is already in progress")
    await expect(deleteWorkflow(workspaceId, voiceFlow.id)).rejects.toThrow(
      "Cancel the active run before deleting"
    )

    const canceled = await cancelWorkflowRun(workspaceId, running.run.id)
    expect(canceled.run.status).toBe("canceled")
    expect(stepByNode(canceled, "v1").status).toBe("skipped")
    await deleteWorkflow(workspaceId, voiceFlow.id)
  })

  it("requires the voice provider to be configured", async () => {
    delete process.env.AI_AGENTS_VAPI_API_KEY
    const workspaceId = await seedWorkspace()
    const contactId = await seedContact(workspaceId)
    const agentId = await seedAgent(workspaceId)
    const phoneNumberId = await seedPhoneNumber(workspaceId)
    const workflow = await createWorkflow(workspaceId, "Voice flow")
    await updateWorkflow(workspaceId, {
      workflowId: workflow.id,
      name: workflow.name,
      nodes: [
        node("newcontact", "t1"),
        node("voicecall", "v1", { agentId, phoneNumberId }),
      ],
      edges: [edge("t1", "v1")],
    })
    await expect(
      startWorkflowRun(workspaceId, workflow.id, contactId)
    ).rejects.toThrow("Voice provider not configured")
  })
})
