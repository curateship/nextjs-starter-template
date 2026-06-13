import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  idArraySchema,
  idSchema,
  makeSafeErrorMessage,
  nameSchema,
} from "@/lib/api/shared"

import type { AgentItem, AgentListResponse } from "@/server/agents"

export type { AgentItem, AgentListResponse }

const agentIdSchema = z.object({
  agentId: idSchema,
})

const createAgentSchema = z.object({
  name: nameSchema,
})

const updateAgentSchema = z.object({
  agentId: idSchema,
  name: nameSchema,
  systemPrompt: z.string().max(50_000),
  firstMessage: z.string().max(2_000),
  model: z.string().min(1).max(100),
  voiceId: z.string().max(255),
  transcriberLanguage: z.string().min(1).max(10),
})

export const getAgentErrorMessage = makeSafeErrorMessage(
  "Agent request failed.",
  new Set(["Agent not found", "Voice provider not configured"])
)

const listAgentsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<AgentListResponse> => {
    const { listAgentsForCurrentUser } = await import("@/server/agents")
    return listAgentsForCurrentUser()
  }
)

const getAgentFn = createServerFn({ method: "GET" })
  .inputValidator(agentIdSchema)
  .handler(async ({ data }): Promise<AgentItem> => {
    const { getAgentForCurrentUser } = await import("@/server/agents")
    return getAgentForCurrentUser(data.agentId)
  })

const createAgentFn = createServerFn({ method: "POST" })
  .inputValidator(createAgentSchema)
  .handler(async ({ data }): Promise<AgentItem> => {
    const { createAgentForCurrentUser } = await import("@/server/agents")
    return createAgentForCurrentUser(data.name)
  })

const updateAgentFn = createServerFn({ method: "POST" })
  .inputValidator(updateAgentSchema)
  .handler(async ({ data }): Promise<AgentItem> => {
    const { updateAgentForCurrentUser } = await import("@/server/agents")
    return updateAgentForCurrentUser(data)
  })

const bulkDeleteAgentsFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({ agentIds: idArraySchema })
  )
  .handler(async ({ data }): Promise<{ deletedCount: number }> => {
    const { deleteAgentsForCurrentUser } = await import("@/server/agents")
    return deleteAgentsForCurrentUser(data.agentIds)
  })

export function listAgents() {
  return listAgentsFn()
}

export function getAgent(agentId: string) {
  return getAgentFn({ data: { agentId } })
}

export function createAgent(name: string) {
  return createAgentFn({ data: { name } })
}

export function updateAgent(input: z.infer<typeof updateAgentSchema>) {
  return updateAgentFn({ data: input })
}

export function bulkDeleteAgents(agentIds: string[]) {
  return bulkDeleteAgentsFn({ data: { agentIds } })
}
