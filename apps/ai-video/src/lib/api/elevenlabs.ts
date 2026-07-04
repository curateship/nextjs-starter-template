import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import type { ElevenLabsVoice, VoiceoverResult } from "@/server/elevenlabs"

export type { ElevenLabsVoice, VoiceoverResult }

// TTS models the Voice dialog offers. All support the word-level timestamps the
// karaoke captions need. Edit this list to add/remove models (e.g. eleven_v3).
export const VOICE_MODEL_IDS = [
  "eleven_multilingual_v2",
  "eleven_turbo_v2_5",
  "eleven_flash_v2_5",
] as const
export type VoiceModelId = (typeof VOICE_MODEL_IDS)[number]

function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : ""
}

export function getVoiceLoadErrorMessage(error: unknown) {
  const message = getErrorMessage(error)
  if (
    message === "ElevenLabs is not configured" ||
    message === "Secret encryption is not configured" ||
    message === "Stored secret could not be decrypted" ||
    message === "Stored secret is not encrypted" ||
    message.startsWith("Voice list failed")
  ) {
    return mapVoiceConfigError(message)
  }
  return "Could not load ElevenLabs voices."
}

export function getVoiceGenerationErrorMessage(error: unknown) {
  const message = getErrorMessage(error)
  // Surface stable, client-safe messages verbatim: the "not configured" hint
  // and provider HTTP failures (which carry a status + reason suffix).
  if (
    message === "API usage limit reached. Try again next month." ||
    message === "ElevenLabs is not configured" ||
    message === "Secret encryption is not configured" ||
    message === "Stored secret could not be decrypted" ||
    message === "Stored secret is not encrypted" ||
    message.startsWith("Voiceover generation failed")
  ) {
    return mapVoiceConfigError(message)
  }
  return "Could not generate the voiceover."
}

function mapVoiceConfigError(message: string) {
  if (message === "Secret encryption is not configured") {
    return "AI provider key storage is not configured."
  }
  if (message === "Stored secret could not be decrypted") {
    return "Saved ElevenLabs API key could not be decrypted."
  }
  if (message === "Stored secret is not encrypted") {
    return "Saved ElevenLabs API key must be re-saved."
  }
  return message
}

const listVoicesFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ voices: ElevenLabsVoice[] }> => {
    const { listVoicesForCurrentUser } = await import("@/server/elevenlabs")
    return listVoicesForCurrentUser()
  }
)

const generateVoiceoverFn = createServerFn({ method: "POST" })
  .inputValidator(
    z.object({
      voiceId: z.string().min(1).max(64),
      text: z.string().min(1).max(5000),
      modelId: z.enum(VOICE_MODEL_IDS),
    })
  )
  .handler(async ({ data }): Promise<VoiceoverResult> => {
    const { generateVoiceoverForCurrentUser } = await import(
      "@/server/elevenlabs"
    )
    return generateVoiceoverForCurrentUser(data.voiceId, data.text, data.modelId)
  })

export function listElevenLabsVoices() {
  return listVoicesFn()
}

export function generateVoiceover(input: {
  voiceId: string
  text: string
  modelId: VoiceModelId
}) {
  return generateVoiceoverFn({ data: input })
}
