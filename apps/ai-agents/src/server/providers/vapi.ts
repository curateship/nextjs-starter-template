import {
  ProviderError,
  type AgentProviderConfig,
  type NormalizedCall,
  type NormalizedCallStatus,
  type ProviderPhoneNumber,
  type VoiceProvider,
} from "@/server/providers/types"

const VAPI_BASE_URL = "https://api.vapi.ai"

export function getVapiApiKey() {
  const key = process.env.AI_AGENTS_VAPI_API_KEY
  if (!key) {
    throw new Error("Voice provider not configured")
  }
  return key
}

// Authenticated request against the Vapi REST API. Non-2xx responses throw
// with the HTTP status and Vapi's own message — surfaced to the UI as-is.
async function vapiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const response = await fetch(`${VAPI_BASE_URL}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${getVapiApiKey()}`,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  })
  if (!response.ok) {
    let detail = response.statusText
    try {
      const body = (await response.json()) as { message?: string | string[] }
      if (body.message) {
        detail = Array.isArray(body.message) ? body.message.join("; ") : body.message
      }
    } catch {
      // Body wasn't JSON — keep the status text.
    }
    throw new ProviderError(
      response.status,
      `Vapi request failed (${response.status}): ${detail}`
    )
  }
  if (response.status === 204) return null
  return response.json()
}

// Maps our canonical agent config onto Vapi's assistant payload.
function buildAssistantPayload(config: AgentProviderConfig) {
  return {
    name: config.name,
    model: {
      provider: config.modelProvider,
      model: config.model,
      messages: [{ role: "system", content: config.systemPrompt }],
    },
    voice: {
      provider: config.voiceProvider,
      voiceId: config.voiceId,
    },
    transcriber: {
      provider: config.transcriberProvider,
      language: config.transcriberLanguage,
    },
    firstMessage: config.firstMessage,
    ...(config.serverUrl ? { server: { url: config.serverUrl } } : {}),
  }
}

const VAPI_STATUS_MAP: Record<string, NormalizedCallStatus> = {
  queued: "queued",
  ringing: "ringing",
  "in-progress": "in_progress",
  forwarding: "in_progress",
  ended: "ended",
}

type VapiCall = {
  id: string
  status?: string
  endedReason?: string
  startedAt?: string
  endedAt?: string
  recordingUrl?: string
  transcript?: string
  summary?: string
  cost?: number
  artifact?: { recordingUrl?: string; transcript?: string }
  analysis?: { summary?: string }
}

// THE single normalizer: both the polling path and the webhook path feed
// Vapi call objects through here so there is exactly one mapping.
export function normalizeVapiCall(raw: VapiCall): NormalizedCall {
  return {
    providerCallId: raw.id,
    status: VAPI_STATUS_MAP[raw.status ?? ""] ?? "queued",
    endedReason: raw.endedReason ?? null,
    startedAt: raw.startedAt ? new Date(raw.startedAt) : null,
    endedAt: raw.endedAt ? new Date(raw.endedAt) : null,
    recordingUrl: raw.artifact?.recordingUrl ?? raw.recordingUrl ?? null,
    transcript: raw.artifact?.transcript ?? raw.transcript ?? null,
    summary: raw.analysis?.summary ?? raw.summary ?? null,
    cost: typeof raw.cost === "number" ? raw.cost : null,
  }
}

// Extracts the call object from a Vapi server-message webhook body, or null
// when the event isn't a call update we track. Keeps envelope knowledge here
// rather than in the route.
export function parseVapiWebhookCall(body: unknown): NormalizedCall | null {
  const message = (body as { message?: { type?: string; call?: VapiCall } })
    ?.message
  if (!message?.call?.id) return null
  if (message.type !== "status-update" && message.type !== "end-of-call-report") {
    return null
  }
  return normalizeVapiCall(message.call)
}

export const vapiProvider: VoiceProvider = {
  async createAssistant(config) {
    const created = (await vapiFetch("/assistant", {
      method: "POST",
      body: JSON.stringify(buildAssistantPayload(config)),
    })) as { id: string }
    return { providerAssistantId: created.id }
  },

  async updateAssistant(providerAssistantId, config) {
    await vapiFetch(`/assistant/${providerAssistantId}`, {
      method: "PATCH",
      body: JSON.stringify(buildAssistantPayload(config)),
    })
  },

  async deleteAssistant(providerAssistantId) {
    await vapiFetch(`/assistant/${providerAssistantId}`, { method: "DELETE" })
  },

  async startOutboundCall({
    providerAssistantId,
    providerPhoneNumberId,
    customerNumber,
    variables,
  }) {
    const call = (await vapiFetch("/call", {
      method: "POST",
      body: JSON.stringify({
        assistantId: providerAssistantId,
        phoneNumberId: providerPhoneNumberId,
        customer: { number: customerNumber },
        ...(variables && Object.keys(variables).length > 0
          ? { assistantOverrides: { variableValues: variables } }
          : {}),
      }),
    })) as { id: string }
    return { providerCallId: call.id }
  },

  async getCall(providerCallId) {
    const call = (await vapiFetch(`/call/${providerCallId}`)) as VapiCall
    return normalizeVapiCall(call)
  },

  async listPhoneNumbers() {
    const numbers = (await vapiFetch("/phone-number")) as Array<{
      id: string
      number?: string
      name?: string
    }>
    return numbers.map(
      (entry): ProviderPhoneNumber => ({
        providerPhoneNumberId: entry.id,
        number: entry.number ?? "",
        name: entry.name ?? null,
      })
    )
  },
}
