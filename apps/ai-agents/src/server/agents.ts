import { and, desc, eq, inArray } from "drizzle-orm"

import { db } from "@/server/db"
import { requireAppOrigin } from "@/server/origin"
import {
  getProviderWebhookUrl,
  getVoiceProvider,
  isVoiceProviderConfigured,
} from "@/server/providers"
import {
  ProviderError,
  type AgentProviderConfig,
} from "@/server/providers/types"
import { aiAgentsAgents, type AiAgentsAgent } from "@/server/schema"
import { now, uuid } from "@/server/security"
import { requireUserWorkspace } from "@/server/workspace-context"

export type AgentItem = {
  id: string
  name: string
  system_prompt: string
  first_message: string
  model_provider: string
  model: string
  voice_provider: string
  voice_id: string
  transcriber_provider: string
  transcriber_language: string
  provider: string
  provider_assistant_id: string | null
  last_synced_at: string | null
  created_at: string
  updated_at: string
}

export type AgentListResponse = {
  agents: AgentItem[]
}

export type UpdateAgentInput = {
  agentId: string
  name: string
  systemPrompt: string
  firstMessage: string
  model: string
  voiceId: string
  transcriberLanguage: string
}

function serializeAgent(row: AiAgentsAgent): AgentItem {
  return {
    id: row.id,
    name: row.name,
    system_prompt: row.systemPrompt,
    first_message: row.firstMessage,
    model_provider: row.modelProvider,
    model: row.model,
    voice_provider: row.voiceProvider,
    voice_id: row.voiceId,
    transcriber_provider: row.transcriberProvider,
    transcriber_language: row.transcriberLanguage,
    provider: row.provider,
    provider_assistant_id: row.providerAssistantId,
    last_synced_at: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

export async function listAgentsForCurrentUser(): Promise<AgentListResponse> {
  const { workspace } = await requireUserWorkspace()
  const rows = await db
    .select()
    .from(aiAgentsAgents)
    .where(eq(aiAgentsAgents.workspaceId, workspace.id))
    .orderBy(desc(aiAgentsAgents.createdAt))
  return { agents: rows.map(serializeAgent) }
}

// Resolves an agent owned by the workspace or throws.
export async function requireWorkspaceAgent(workspaceId: string, agentId: string) {
  const [row] = await db
    .select()
    .from(aiAgentsAgents)
    .where(
      and(eq(aiAgentsAgents.workspaceId, workspaceId), eq(aiAgentsAgents.id, agentId))
    )
    .limit(1)
  if (!row) {
    throw new Error("Agent not found")
  }
  return row
}

export async function getAgentForCurrentUser(agentId: string): Promise<AgentItem> {
  const { workspace } = await requireUserWorkspace()
  return serializeAgent(await requireWorkspaceAgent(workspace.id, agentId))
}

// Creates a minimally-configured agent; the editor screen fills in the rest
// (create-then-navigate flow, same as ai-video projects).
export async function createAgentForCurrentUser(name: string): Promise<AgentItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const createdAt = now()
  const [row] = await db
    .insert(aiAgentsAgents)
    .values({
      id: uuid(),
      workspaceId: workspace.id,
      name,
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
  return serializeAgent(row)
}

function buildProviderConfig(agent: AiAgentsAgent): AgentProviderConfig {
  return {
    name: agent.name,
    systemPrompt: agent.systemPrompt,
    firstMessage: agent.firstMessage,
    modelProvider: agent.modelProvider,
    model: agent.model,
    voiceProvider: agent.voiceProvider,
    voiceId: agent.voiceId,
    transcriberProvider: agent.transcriberProvider,
    transcriberLanguage: agent.transcriberLanguage,
    serverUrl: getProviderWebhookUrl(),
  }
}

// Create-or-update push to the voice provider; returns the assistant id.
// No DB writes — callers persist the sync state themselves.
async function pushAgentToProvider(agent: AiAgentsAgent): Promise<string> {
  const provider = getVoiceProvider()
  const config = buildProviderConfig(agent)
  if (agent.providerAssistantId) {
    await provider.updateAssistant(agent.providerAssistantId, config)
    return agent.providerAssistantId
  }
  return (await provider.createAssistant(config)).providerAssistantId
}

// Pushes the agent to the voice provider (create or update) and records the
// sync. Throws when the provider isn't configured — callers that require a
// synced agent (test calls, campaigns) surface that directly.
export async function syncAgentToProvider(agent: AiAgentsAgent): Promise<AiAgentsAgent> {
  const providerAssistantId = await pushAgentToProvider(agent)
  const [updated] = await db
    .update(aiAgentsAgents)
    .set({ providerAssistantId, lastSyncedAt: now(), updatedAt: now() })
    .where(eq(aiAgentsAgents.id, agent.id))
    .returning()
  return updated
}

// Saves the agent. When the provider is configured the push happens FIRST —
// a provider failure aborts the save so the database never claims a config
// the provider doesn't have. Without credentials the save stays local-only
// ("Not synced" badge) until the key is added.
export async function updateAgentForCurrentUser(
  input: UpdateAgentInput
): Promise<AgentItem> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()
  const existing = await requireWorkspaceAgent(workspace.id, input.agentId)

  const incoming: AiAgentsAgent = {
    ...existing,
    name: input.name,
    systemPrompt: input.systemPrompt,
    firstMessage: input.firstMessage,
    model: input.model,
    voiceId: input.voiceId,
    transcriberLanguage: input.transcriberLanguage,
  }

  let providerAssistantId = existing.providerAssistantId
  let lastSyncedAt = existing.lastSyncedAt
  if (isVoiceProviderConfigured()) {
    providerAssistantId = await pushAgentToProvider(incoming)
    lastSyncedAt = now()
  }

  const [row] = await db
    .update(aiAgentsAgents)
    .set({
      name: input.name,
      systemPrompt: input.systemPrompt,
      firstMessage: input.firstMessage,
      model: input.model,
      voiceId: input.voiceId,
      transcriberLanguage: input.transcriberLanguage,
      providerAssistantId,
      lastSyncedAt,
      updatedAt: now(),
    })
    .where(eq(aiAgentsAgents.id, existing.id))
    .returning()
  return serializeAgent(row)
}

export async function deleteAgentsForCurrentUser(
  agentIds: string[]
): Promise<{ deletedCount: number }> {
  requireAppOrigin()
  const { workspace } = await requireUserWorkspace()

  // Clean up provider-side assistants first. A 404 means it's already gone
  // (fine); any other provider error aborts so nothing half-deletes.
  if (isVoiceProviderConfigured()) {
    const provider = getVoiceProvider()
    const rows = await db
      .select()
      .from(aiAgentsAgents)
      .where(
        and(
          eq(aiAgentsAgents.workspaceId, workspace.id),
          inArray(aiAgentsAgents.id, agentIds)
        )
      )
    for (const row of rows) {
      if (!row.providerAssistantId) continue
      try {
        await provider.deleteAssistant(row.providerAssistantId)
      } catch (error) {
        if (error instanceof ProviderError && error.status === 404) continue
        throw error
      }
    }
  }

  const deleted = await db
    .delete(aiAgentsAgents)
    .where(
      and(
        eq(aiAgentsAgents.workspaceId, workspace.id),
        inArray(aiAgentsAgents.id, agentIds)
      )
    )
    .returning({ id: aiAgentsAgents.id })
  return { deletedCount: deleted.length }
}
