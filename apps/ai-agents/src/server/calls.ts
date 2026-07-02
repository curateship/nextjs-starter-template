import { and, desc, eq, isNotNull, notInArray } from "drizzle-orm"

import { buildContactVariables, normalizePhone } from "@/server/contacts"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { getVoiceProvider, isVoiceProviderConfigured } from "@/server/providers"
import type { NormalizedCall } from "@/server/providers/types"
import { requireWorkspaceAgent, syncAgentToProvider } from "@/server/agents"
import { requireWorkspacePhoneNumber } from "@/server/provider-settings"
import {
  aiAgentsAgents,
  aiAgentsCalls,
  aiAgentsCampaignRecipients,
  aiAgentsCampaigns,
  aiAgentsContacts,
  type AiAgentsCall,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type CallItem = {
  id: string
  direction: string
  status: string
  ended_reason: string | null
  customer_number: string
  contact_id: string | null
  contact_name: string | null
  agent_name: string | null
  campaign_id: string | null
  campaign_name: string | null
  started_at: string | null
  duration_seconds: number | null
  recording_url: string | null
  transcript: string | null
  summary: string | null
  cost: number | null
  created_at: string
}

export type CallListResponse = {
  calls: CallItem[]
  // True while any call can still change state — drives the dashboard poll.
  has_active: boolean
}

const FINAL_STATUSES = new Set(["ended", "failed"])

type CallRowWithNames = {
  call: AiAgentsCall
  contactFirstName: string | null
  contactLastName: string | null
  agentName: string | null
  campaignName: string | null
}

function serializeCall(row: CallRowWithNames): CallItem {
  const { call } = row
  return {
    id: call.id,
    direction: call.direction,
    status: call.status,
    ended_reason: call.endedReason,
    customer_number: call.customerNumber,
    contact_id: call.contactId,
    contact_name: row.contactFirstName
      ? [row.contactFirstName, row.contactLastName].filter(Boolean).join(" ")
      : null,
    agent_name: row.agentName,
    campaign_id: call.campaignId,
    campaign_name: row.campaignName,
    started_at: call.startedAt ? call.startedAt.toISOString() : null,
    duration_seconds: call.durationSeconds,
    recording_url: call.recordingUrl,
    transcript: call.transcript,
    summary: call.summary,
    cost: call.cost ? Number.parseFloat(call.cost) : null,
    created_at: call.createdAt.toISOString(),
  }
}

function callQuery() {
  return db
    .select({
      call: aiAgentsCalls,
      contactFirstName: aiAgentsContacts.firstName,
      contactLastName: aiAgentsContacts.lastName,
      agentName: aiAgentsAgents.name,
      campaignName: aiAgentsCampaigns.name,
    })
    .from(aiAgentsCalls)
    .leftJoin(aiAgentsContacts, eq(aiAgentsContacts.id, aiAgentsCalls.contactId))
    .leftJoin(aiAgentsAgents, eq(aiAgentsAgents.id, aiAgentsCalls.agentId))
    .leftJoin(aiAgentsCampaigns, eq(aiAgentsCampaigns.id, aiAgentsCalls.campaignId))
}

const CALL_LIST_LIMIT = 200

export async function listCallsForCurrentUser(): Promise<CallListResponse> {
  const { workspace } = await requireUserWorkspace()
  const rows = await callQuery()
    .where(eq(aiAgentsCalls.workspaceId, workspace.id))
    .orderBy(desc(aiAgentsCalls.createdAt))
    .limit(CALL_LIST_LIMIT)
  return {
    // Transcripts can be large and the table never shows them — the detail
    // modal fetches the full record itself.
    calls: rows.map((row) => ({ ...serializeCall(row), transcript: null })),
    has_active: rows.some((row) => !FINAL_STATUSES.has(row.call.status)),
  }
}

// Dashboard poll: pull fresh state for live calls from the provider (capped
// so a pile of stuck rows can't hammer the API), then return the list.
export async function pollCallsForCurrentUser(): Promise<CallListResponse> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  if (isVoiceProviderConfigured()) {
    const toRefresh = await db
      .select({ id: aiAgentsCalls.id, providerCallId: aiAgentsCalls.providerCallId })
      .from(aiAgentsCalls)
      .where(
        and(
          eq(aiAgentsCalls.workspaceId, workspace.id),
          notInArray(aiAgentsCalls.status, [...FINAL_STATUSES]),
          isNotNull(aiAgentsCalls.providerCallId)
        )
      )
      .orderBy(desc(aiAgentsCalls.createdAt))
      .limit(10)
    const provider = getVoiceProvider()
    await Promise.all(
      toRefresh.map(async (row) =>
        applyNormalizedCall(row.id, await provider.getCall(row.providerCallId as string))
      )
    )
  }
  return listCallsForCurrentUser()
}

// THE single write path for provider call state: polling and the webhook
// both land here, so there is exactly one state-transition codepath. When a
// call reaches a final state, its campaign recipient (if any) follows.
export async function applyNormalizedCall(
  callId: string,
  normalized: NormalizedCall
): Promise<void> {
  const durationSeconds =
    normalized.startedAt && normalized.endedAt
      ? Math.round(
          (normalized.endedAt.getTime() - normalized.startedAt.getTime()) / 1000
        )
      : null
  await db
    .update(aiAgentsCalls)
    .set({
      status: normalized.status,
      endedReason: normalized.endedReason,
      startedAt: normalized.startedAt,
      endedAt: normalized.endedAt,
      durationSeconds,
      recordingUrl: normalized.recordingUrl,
      transcript: normalized.transcript,
      summary: normalized.summary,
      cost: normalized.cost != null ? normalized.cost.toFixed(4) : null,
      updatedAt: now(),
    })
    .where(eq(aiAgentsCalls.id, callId))

  if (FINAL_STATUSES.has(normalized.status)) {
    await db
      .update(aiAgentsCampaignRecipients)
      .set({
        status: normalized.status === "ended" ? "completed" : "failed",
        error: normalized.status === "failed" ? normalized.endedReason : null,
        updatedAt: now(),
      })
      .where(eq(aiAgentsCampaignRecipients.callId, callId))
  }
}

// Looks a call up by the provider's id — how webhook payloads identify calls.
export async function findCallByProviderCallId(providerCallId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsCalls)
    .where(eq(aiAgentsCalls.providerCallId, providerCallId))
    .limit(1)
  return row ?? null
}

// Starts a one-off test call from the agent editor. Syncs the agent first if
// needed; links the call to a contact when the number matches one.
export async function startTestCallForCurrentUser(input: {
  agentId: string
  phoneNumberId: string
  customerNumber: string
}): Promise<CallItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  if (!isVoiceProviderConfigured()) {
    throw new Error("Voice provider not configured")
  }

  const agent = await requireWorkspaceAgent(workspace.id, input.agentId)
  const phoneNumber = await requireWorkspacePhoneNumber(
    workspace.id,
    input.phoneNumberId
  )

  const customerNumber = normalizePhone(input.customerNumber)
  const syncedAgent = await syncAgentToProvider(agent)

  // Link to a contact if we already know this number.
  const [contact] = await db
    .select()
    .from(aiAgentsContacts)
    .where(
      and(
        eq(aiAgentsContacts.workspaceId, workspace.id),
        eq(aiAgentsContacts.phone, customerNumber)
      )
    )
    .limit(1)

  const createdAt = now()
  const [callRow] = await db
    .insert(aiAgentsCalls)
    .values({
      id: uuid(),
      workspaceId: workspace.id,
      direction: "outbound",
      status: "queued",
      contactId: contact?.id ?? null,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      customerNumber,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()

  try {
    const { providerCallId } = await getVoiceProvider().startOutboundCall({
      providerAssistantId: syncedAgent.providerAssistantId as string,
      providerPhoneNumberId: phoneNumber.providerPhoneNumberId,
      customerNumber,
      variables: contact ? buildContactVariables(contact) : undefined,
    })
    await db
      .update(aiAgentsCalls)
      .set({ providerCallId, updatedAt: now() })
      .where(eq(aiAgentsCalls.id, callRow.id))
  } catch (error) {
    // Mark the call failed so the row tells the story, then surface the error.
    await db
      .update(aiAgentsCalls)
      .set({
        status: "failed",
        endedReason: error instanceof Error ? error.message.slice(0, 100) : "error",
        updatedAt: now(),
      })
      .where(eq(aiAgentsCalls.id, callRow.id))
    throw error
  }

  return getCallForCurrentUser(callRow.id)
}

// Polls the provider for fresh state when the call is still live, then
// returns the row. The dashboard and test-call dialog call this every 3s.
export async function refreshCallForCurrentUser(callId: string): Promise<CallItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const [row] = await db
    .select()
    .from(aiAgentsCalls)
    .where(
      and(eq(aiAgentsCalls.workspaceId, workspace.id), eq(aiAgentsCalls.id, callId))
    )
    .limit(1)
  if (!row) {
    throw new Error("Call not found")
  }
  if (!FINAL_STATUSES.has(row.status) && row.providerCallId) {
    const normalized = await getVoiceProvider().getCall(row.providerCallId)
    await applyNormalizedCall(row.id, normalized)
  }
  return getCallForCurrentUser(callId)
}

export async function getCallForCurrentUser(callId: string): Promise<CallItem> {
  const { workspace } = await requireUserWorkspace()
  const [row] = await callQuery()
    .where(
      and(eq(aiAgentsCalls.workspaceId, workspace.id), eq(aiAgentsCalls.id, callId))
    )
    .limit(1)
  if (!row) {
    throw new Error("Call not found")
  }
  return serializeCall(row)
}
