import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import { idSchema, makeSafeErrorMessage } from "@/lib/api/shared"

import type { CallItem, CallListResponse } from "@/server/calls"

export type { CallItem, CallListResponse }

const callIdSchema = z.object({ callId: idSchema })

export const getCallErrorMessage = makeSafeErrorMessage(
  "Call request failed.",
  new Set([
    "Call not found",
    "Agent not found",
    "Phone number not found",
    "Invalid phone number",
    "Voice provider not configured",
  ])
)

const listCallsFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<CallListResponse> => {
    const { listCallsForCurrentUser } = await import("@/server/calls")
    return listCallsForCurrentUser()
  }
)

const getCallFn = createServerFn({ method: "GET" })
  .inputValidator(callIdSchema)
  .handler(async ({ data }): Promise<CallItem> => {
    const { getCallForCurrentUser } = await import("@/server/calls")
    return getCallForCurrentUser(data.callId)
  })

const refreshCallFn = createServerFn({ method: "POST" })
  .inputValidator(callIdSchema)
  .handler(async ({ data }): Promise<CallItem> => {
    const { refreshCallForCurrentUser } = await import("@/server/calls")
    return refreshCallForCurrentUser(data.callId)
  })

const startTestCallFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      agentId: idSchema,
      phoneNumberId: idSchema,
      customerNumber: z.string().min(1).max(32),
    })
  )
  .handler(async ({ data }): Promise<CallItem> => {
    const { startTestCallForCurrentUser } = await import("@/server/calls")
    return startTestCallForCurrentUser(data)
  })

const pollCallsFn = createServerFn({ method: "POST" }).handler(
  async (): Promise<CallListResponse> => {
    const { pollCallsForCurrentUser } = await import("@/server/calls")
    return pollCallsForCurrentUser()
  }
)

export function listCalls() {
  return listCallsFn()
}

export function pollCalls() {
  return pollCallsFn()
}

export function getCall(callId: string) {
  return getCallFn({ data: { callId } })
}

export function refreshCall(callId: string) {
  return refreshCallFn({ data: { callId } })
}

export function startTestCall(input: {
  agentId: string
  phoneNumberId: string
  customerNumber: string
}) {
  return startTestCallFn({ data: input })
}
