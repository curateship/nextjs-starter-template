import { and, asc, desc, eq, inArray, sql } from "drizzle-orm"

import { applyNormalizedCall } from "@/server/calls"
import { buildContactVariables } from "@/server/contacts"
import { syncAgentToProvider } from "@/server/agents"
import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import { getVoiceProvider, isVoiceProviderConfigured } from "@/server/providers"
import { ProviderError } from "@/server/providers/types"
import {
  aiAgentsAgents,
  aiAgentsCalls,
  aiAgentsCampaignRecipients,
  aiAgentsCampaigns,
  aiAgentsContactListMembers,
  aiAgentsContactLists,
  aiAgentsContacts,
  aiAgentsPhoneNumbers,
  type AiAgentsAgent,
  type AiAgentsCampaign,
  type AiAgentsPhoneNumber,
} from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type CampaignStats = {
  pending: number
  calling: number
  completed: number
  failed: number
  skipped: number
  total: number
}

export type CampaignItem = {
  id: string
  name: string
  status: string
  agent_id: string
  agent_name: string | null
  contact_list_id: string
  list_name: string | null
  phone_number: string | null
  stats: CampaignStats
  launched_at: string | null
  completed_at: string | null
  created_at: string
}

export type CampaignRecipientItem = {
  id: string
  contact_id: string
  contact_name: string
  phone: string
  status: string
  error: string | null
  call_id: string | null
}

export type CampaignDetailResponse = {
  campaign: CampaignItem
  recipients: CampaignRecipientItem[]
}

export type CampaignListResponse = {
  campaigns: CampaignItem[]
}

function getMaxConcurrentCalls() {
  const parsed = Number.parseInt(
    process.env.AI_AGENTS_MAX_CONCURRENT_CALLS || "5",
    10
  )
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 5
}

function emptyStats(): CampaignStats {
  return { pending: 0, calling: 0, completed: 0, failed: 0, skipped: 0, total: 0 }
}

// Live counts via one GROUP BY — no counter columns to drift, no row fetch.
async function getCampaignStatsByIds(
  campaignIds: string[]
): Promise<Map<string, CampaignStats>> {
  const statsById = new Map(campaignIds.map((id) => [id, emptyStats()]))
  if (campaignIds.length === 0) return statsById
  const rows = await db
    .select({
      campaignId: aiAgentsCampaignRecipients.campaignId,
      status: aiAgentsCampaignRecipients.status,
      count: sql<number>`count(*)::int`,
    })
    .from(aiAgentsCampaignRecipients)
    .where(inArray(aiAgentsCampaignRecipients.campaignId, campaignIds))
    .groupBy(
      aiAgentsCampaignRecipients.campaignId,
      aiAgentsCampaignRecipients.status
    )
  for (const row of rows) {
    const stats = statsById.get(row.campaignId)
    if (!stats) continue
    stats[row.status as keyof Omit<CampaignStats, "total">] = row.count
    stats.total += row.count
  }
  return statsById
}

async function getCampaignStats(campaignId: string): Promise<CampaignStats> {
  const statsById = await getCampaignStatsByIds([campaignId])
  return statsById.get(campaignId) as CampaignStats
}

type CampaignRowWithNames = {
  campaign: AiAgentsCampaign
  agentName: string | null
  listName: string | null
  phoneNumber: string | null
}

function campaignQuery() {
  return db
    .select({
      campaign: aiAgentsCampaigns,
      agentName: aiAgentsAgents.name,
      listName: aiAgentsContactLists.name,
      phoneNumber: aiAgentsPhoneNumbers.number,
    })
    .from(aiAgentsCampaigns)
    .leftJoin(aiAgentsAgents, eq(aiAgentsAgents.id, aiAgentsCampaigns.agentId))
    .leftJoin(
      aiAgentsContactLists,
      eq(aiAgentsContactLists.id, aiAgentsCampaigns.contactListId)
    )
    .leftJoin(
      aiAgentsPhoneNumbers,
      eq(aiAgentsPhoneNumbers.id, aiAgentsCampaigns.phoneNumberId)
    )
}

function serializeCampaign(
  row: CampaignRowWithNames,
  stats: CampaignStats
): CampaignItem {
  const { campaign } = row
  return {
    id: campaign.id,
    name: campaign.name,
    status: campaign.status,
    agent_id: campaign.agentId,
    agent_name: row.agentName,
    contact_list_id: campaign.contactListId,
    list_name: row.listName,
    phone_number: row.phoneNumber,
    stats,
    launched_at: campaign.launchedAt ? campaign.launchedAt.toISOString() : null,
    completed_at: campaign.completedAt ? campaign.completedAt.toISOString() : null,
    created_at: campaign.createdAt.toISOString(),
  }
}

async function requireWorkspaceCampaign(workspaceId: string, campaignId: string) {
  const [row] = await campaignQuery()
    .where(
      and(
        eq(aiAgentsCampaigns.workspaceId, workspaceId),
        eq(aiAgentsCampaigns.id, campaignId)
      )
    )
    .limit(1)
  if (!row) {
    throw new Error("Campaign not found")
  }
  return row
}

async function listRecipients(campaignId: string): Promise<CampaignRecipientItem[]> {
  const rows = await db
    .select({
      recipient: aiAgentsCampaignRecipients,
      firstName: aiAgentsContacts.firstName,
      lastName: aiAgentsContacts.lastName,
      phone: aiAgentsContacts.phone,
    })
    .from(aiAgentsCampaignRecipients)
    .innerJoin(
      aiAgentsContacts,
      eq(aiAgentsContacts.id, aiAgentsCampaignRecipients.contactId)
    )
    .where(eq(aiAgentsCampaignRecipients.campaignId, campaignId))
    .orderBy(asc(aiAgentsCampaignRecipients.createdAt))
  return rows.map((row) => ({
    id: row.recipient.id,
    contact_id: row.recipient.contactId,
    contact_name: [row.firstName, row.lastName].filter(Boolean).join(" "),
    phone: row.phone,
    status: row.recipient.status,
    error: row.recipient.error,
    call_id: row.recipient.callId,
  }))
}

export async function listCampaignsForCurrentUser(): Promise<CampaignListResponse> {
  const { workspace } = await requireUserWorkspace()
  const rows = await campaignQuery()
    .where(eq(aiAgentsCampaigns.workspaceId, workspace.id))
    .orderBy(desc(aiAgentsCampaigns.createdAt))
  const statsById = await getCampaignStatsByIds(rows.map((row) => row.campaign.id))
  return {
    campaigns: rows.map((row) =>
      serializeCampaign(row, statsById.get(row.campaign.id) as CampaignStats)
    ),
  }
}

export async function getCampaignDetailForCurrentUser(
  campaignId: string
): Promise<CampaignDetailResponse> {
  const { workspace } = await requireUserWorkspace()
  const row = await requireWorkspaceCampaign(workspace.id, campaignId)
  return {
    campaign: serializeCampaign(row, await getCampaignStats(campaignId)),
    recipients: await listRecipients(campaignId),
  }
}

export async function createCampaignForCurrentUser(input: {
  name: string
  agentId: string
  contactListId: string
  phoneNumberId: string
}): Promise<CampaignItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()

  // All three references must belong to this workspace.
  const [agent] = await db
    .select({ id: aiAgentsAgents.id })
    .from(aiAgentsAgents)
    .where(
      and(
        eq(aiAgentsAgents.workspaceId, workspace.id),
        eq(aiAgentsAgents.id, input.agentId)
      )
    )
    .limit(1)
  if (!agent) throw new Error("Agent not found")
  const [list] = await db
    .select({ id: aiAgentsContactLists.id })
    .from(aiAgentsContactLists)
    .where(
      and(
        eq(aiAgentsContactLists.workspaceId, workspace.id),
        eq(aiAgentsContactLists.id, input.contactListId)
      )
    )
    .limit(1)
  if (!list) throw new Error("List not found")
  const [phoneNumber] = await db
    .select({ id: aiAgentsPhoneNumbers.id })
    .from(aiAgentsPhoneNumbers)
    .where(
      and(
        eq(aiAgentsPhoneNumbers.workspaceId, workspace.id),
        eq(aiAgentsPhoneNumbers.id, input.phoneNumberId)
      )
    )
    .limit(1)
  if (!phoneNumber) throw new Error("Phone number not found")

  const createdAt = now()
  const [campaign] = await db
    .insert(aiAgentsCampaigns)
    .values({
      id: uuid(),
      workspaceId: workspace.id,
      name: input.name,
      agentId: input.agentId,
      contactListId: input.contactListId,
      phoneNumberId: input.phoneNumberId,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  const [row] = await campaignQuery().where(eq(aiAgentsCampaigns.id, campaign.id))
  return serializeCampaign(row, emptyStats())
}

// Launch: snapshot the list's members as recipients (DNC contacts land as
// skipped), sync the agent, and set the campaign running. The detail page's
// tick poll does the actual dialing.
export async function launchCampaignForCurrentUser(
  campaignId: string
): Promise<CampaignDetailResponse> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const row = await requireWorkspaceCampaign(workspace.id, campaignId)
  if (row.campaign.status !== "draft") {
    throw new Error("Campaign already launched")
  }
  if (!isVoiceProviderConfigured()) {
    throw new Error("Voice provider not configured")
  }

  const members = await db
    .select({ contact: aiAgentsContacts })
    .from(aiAgentsContactListMembers)
    .innerJoin(
      aiAgentsContacts,
      eq(aiAgentsContacts.id, aiAgentsContactListMembers.contactId)
    )
    .where(eq(aiAgentsContactListMembers.listId, row.campaign.contactListId))
  if (members.length === 0) {
    throw new Error("The contact list is empty")
  }

  // Push the agent to the provider before anything is queued.
  const [agent] = await db
    .select()
    .from(aiAgentsAgents)
    .where(eq(aiAgentsAgents.id, row.campaign.agentId))
    .limit(1)
  await syncAgentToProvider(agent)

  const timestamp = now()
  await db
    .insert(aiAgentsCampaignRecipients)
    .values(
      members.map(({ contact }) => ({
        id: uuid(),
        workspaceId: workspace.id,
        campaignId,
        contactId: contact.id,
        status: contact.doNotCall ? "skipped" : "pending",
        error: contact.doNotCall ? "Do not call" : null,
        createdAt: timestamp,
        updatedAt: timestamp,
      }))
    )
    .onConflictDoNothing()

  await db
    .update(aiAgentsCampaigns)
    .set({ status: "running", launchedAt: timestamp, updatedAt: timestamp })
    .where(eq(aiAgentsCampaigns.id, campaignId))

  return getCampaignDetailForCurrentUser(campaignId)
}

export async function setCampaignPausedForCurrentUser(
  campaignId: string,
  paused: boolean
): Promise<CampaignDetailResponse> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const row = await requireWorkspaceCampaign(workspace.id, campaignId)
  const allowed = paused ? ["running"] : ["paused"]
  if (!allowed.includes(row.campaign.status)) {
    throw new Error(paused ? "Campaign is not running" : "Campaign is not paused")
  }
  await db
    .update(aiAgentsCampaigns)
    .set({ status: paused ? "paused" : "running", updatedAt: now() })
    .where(eq(aiAgentsCampaigns.id, campaignId))
  return getCampaignDetailForCurrentUser(campaignId)
}

// Running campaigns must be paused first; calls keep their history (the FK
// nulls campaign_id), recipients cascade away.
export async function deleteCampaignForCurrentUser(campaignId: string): Promise<void> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const row = await requireWorkspaceCampaign(workspace.id, campaignId)
  if (row.campaign.status === "running") {
    throw new Error("Pause the campaign before deleting it")
  }
  await db.delete(aiAgentsCampaigns).where(eq(aiAgentsCampaigns.id, campaignId))
}

// One dialer beat, driven by the campaign detail page every 3 seconds:
// 1) refresh in-flight calls from the provider, 2) start new calls up to the
// concurrency cap (only while running), 3) finish the campaign when no
// pending/calling recipients remain. Returns fresh detail for rendering, so
// polling and dialing are a single round trip.
export async function tickCampaignForCurrentUser(
  campaignId: string
): Promise<CampaignDetailResponse> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const row = await requireWorkspaceCampaign(workspace.id, campaignId)
  const status = row.campaign.status

  if (status === "running" || status === "paused") {
    const provider = getVoiceProvider()

    // 1) Poll calls that can still change state.
    const callingRecipients = await db
      .select({
        recipient: aiAgentsCampaignRecipients,
        call: aiAgentsCalls,
      })
      .from(aiAgentsCampaignRecipients)
      .innerJoin(
        aiAgentsCalls,
        eq(aiAgentsCalls.id, aiAgentsCampaignRecipients.callId)
      )
      .where(
        and(
          eq(aiAgentsCampaignRecipients.campaignId, campaignId),
          eq(aiAgentsCampaignRecipients.status, "calling")
        )
      )
    await Promise.all(
      callingRecipients.map(async ({ call }) => {
        if (
          !call.providerCallId ||
          call.status === "ended" ||
          call.status === "failed"
        ) {
          return
        }
        applyNormalizedCall(call.id, await provider.getCall(call.providerCallId))
      })
    )

    // 2) Start new calls while running and below the concurrency cap.
    if (status === "running") {
      const stats = await getCampaignStats(campaignId)
      const slots = getMaxConcurrentCalls() - stats.calling
      if (slots > 0 && stats.pending > 0) {
        const candidates = await db
          .select()
          .from(aiAgentsCampaignRecipients)
          .where(
            and(
              eq(aiAgentsCampaignRecipients.campaignId, campaignId),
              eq(aiAgentsCampaignRecipients.status, "pending")
            )
          )
          .orderBy(asc(aiAgentsCampaignRecipients.createdAt))
          .limit(slots)
        // The agent and caller number are campaign constants — fetch once.
        const [agent] = await db
          .select()
          .from(aiAgentsAgents)
          .where(eq(aiAgentsAgents.id, row.campaign.agentId))
          .limit(1)
        const [phoneNumber] = await db
          .select()
          .from(aiAgentsPhoneNumbers)
          .where(eq(aiAgentsPhoneNumbers.id, row.campaign.phoneNumberId))
          .limit(1)
        for (const recipient of candidates) {
          const proceed = await startRecipientCall(
            workspace.id,
            row,
            recipient.id,
            agent,
            phoneNumber
          )
          if (!proceed) break // Rate-limited — wait for the next tick.
        }
      }
    }

    // 3) Complete when nothing is pending or in flight.
    const stats = await getCampaignStats(campaignId)
    if (
      status === "running" &&
      stats.pending === 0 &&
      stats.calling === 0
    ) {
      await db
        .update(aiAgentsCampaigns)
        .set({ status: "completed", completedAt: now(), updatedAt: now() })
        .where(eq(aiAgentsCampaigns.id, campaignId))
    }
  }

  return getCampaignDetailForCurrentUser(campaignId)
}

// Claims one recipient (the pending→calling UPDATE is the re-entrancy guard)
// and places its call. Returns false when the provider rate-limits, so the
// tick stops starting calls until the next beat.
async function startRecipientCall(
  workspaceId: string,
  row: CampaignRowWithNames,
  recipientId: string,
  agent: AiAgentsAgent,
  phoneNumber: AiAgentsPhoneNumber
): Promise<boolean> {
  const timestamp = now()
  const [claimed] = await db
    .update(aiAgentsCampaignRecipients)
    .set({ status: "calling", updatedAt: timestamp })
    .where(
      and(
        eq(aiAgentsCampaignRecipients.id, recipientId),
        eq(aiAgentsCampaignRecipients.status, "pending")
      )
    )
    .returning()
  if (!claimed) return true // Another tick claimed it — move on.

  const [contact] = await db
    .select()
    .from(aiAgentsContacts)
    .where(eq(aiAgentsContacts.id, claimed.contactId))
    .limit(1)

  const [callRow] = await db
    .insert(aiAgentsCalls)
    .values({
      id: uuid(),
      workspaceId,
      direction: "outbound",
      status: "queued",
      contactId: contact.id,
      campaignId: row.campaign.id,
      agentId: agent.id,
      phoneNumberId: phoneNumber.id,
      customerNumber: contact.phone,
      createdAt: timestamp,
      updatedAt: timestamp,
    })
    .returning()
  await db
    .update(aiAgentsCampaignRecipients)
    .set({ callId: callRow.id, updatedAt: timestamp })
    .where(eq(aiAgentsCampaignRecipients.id, claimed.id))

  try {
    const { providerCallId } = await getVoiceProvider().startOutboundCall({
      providerAssistantId: agent.providerAssistantId as string,
      providerPhoneNumberId: phoneNumber.providerPhoneNumberId,
      customerNumber: contact.phone,
      variables: buildContactVariables(contact),
    })
    await db
      .update(aiAgentsCalls)
      .set({ providerCallId, updatedAt: now() })
      .where(eq(aiAgentsCalls.id, callRow.id))
    return true
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (error instanceof ProviderError && error.status === 429) {
      // Rate limited: undo the claim so the next tick retries this contact.
      await db.delete(aiAgentsCalls).where(eq(aiAgentsCalls.id, callRow.id))
      await db
        .update(aiAgentsCampaignRecipients)
        .set({ status: "pending", callId: null, updatedAt: now() })
        .where(eq(aiAgentsCampaignRecipients.id, claimed.id))
      return false
    }
    // Real failure: the row tells the story, the campaign moves on.
    await db
      .update(aiAgentsCalls)
      .set({ status: "failed", endedReason: message.slice(0, 100), updatedAt: now() })
      .where(eq(aiAgentsCalls.id, callRow.id))
    await db
      .update(aiAgentsCampaignRecipients)
      .set({ status: "failed", error: message, updatedAt: now() })
      .where(eq(aiAgentsCampaignRecipients.id, claimed.id))
    return true
  }
}
