// Provider-agnostic voice layer. Our database is canonical; these types are
// the only surface the rest of the app sees. Vapi is the first (and so far
// only) implementation — see providers/vapi.ts.

// HTTP failures from any provider. Callers branch on `status` (e.g. 404
// already-deleted, 429 rate-limited) instead of parsing message strings.
export class ProviderError extends Error {
  status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

export type AgentProviderConfig = {
  name: string
  systemPrompt: string
  firstMessage: string
  modelProvider: string // e.g. "openai"
  model: string // e.g. "gpt-4o"
  voiceProvider: string // e.g. "11labs"
  voiceId: string
  transcriberProvider: string // e.g. "deepgram"
  transcriberLanguage: string // e.g. "en"
  // Webhook endpoint for call events; only set when AI_AGENTS_PUBLIC_URL exists.
  serverUrl?: string
}

export type NormalizedCallStatus =
  | "queued"
  | "ringing"
  | "in_progress"
  | "ended"
  | "failed"

export type NormalizedCall = {
  providerCallId: string
  status: NormalizedCallStatus
  endedReason: string | null
  startedAt: Date | null
  endedAt: Date | null
  recordingUrl: string | null
  transcript: string | null
  summary: string | null
  cost: number | null
}

export type ProviderPhoneNumber = {
  providerPhoneNumberId: string
  number: string
  name: string | null
}

export interface VoiceProvider {
  createAssistant(config: AgentProviderConfig): Promise<{ providerAssistantId: string }>
  updateAssistant(providerAssistantId: string, config: AgentProviderConfig): Promise<void>
  deleteAssistant(providerAssistantId: string): Promise<void>
  startOutboundCall(input: {
    providerAssistantId: string
    providerPhoneNumberId: string
    customerNumber: string // E.164
    // Filled into {{variables}} in the assistant's prompt/first message.
    variables?: Record<string, string>
  }): Promise<{ providerCallId: string }>
  getCall(providerCallId: string): Promise<NormalizedCall>
  listPhoneNumbers(): Promise<ProviderPhoneNumber[]>
}
