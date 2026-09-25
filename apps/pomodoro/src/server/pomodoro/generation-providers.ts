import { getAiKey } from "@/server/ai/keys"

/**
 * The two providers that make the files, ported from the old app
 * (`apps/pomoder/src/server/providers.ts`). Keys come from the shell's AI
 * settings rather than this app's own environment, so an operator fills them in
 * once under Settings → AI and every app feature that needs them can see them.
 *
 * Both functions are the only place in the app that talks to an outside
 * service. Neither returns a provider's own error text to the caller: those
 * name models and quotas, which tells a member nothing and an attacker
 * something.
 */

const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

/** Veo renders in the background, so the request returns a job to poll. */
const VIDEO_MODEL = "veo-3.1-lite-generate-preview"
const VIDEO_POLL_MS = 10_000
const VIDEO_DEADLINE_MS = 6 * 60_000

/** Thrown before a credit is taken, so nobody pays for a missing key. */
export class ProviderKeyMissingError extends Error {}

export type GeneratedFile = { bytes: Uint8Array; kind: "audio" | "video" }

/** Whether each provider can be called at all, for the panel to say so. */
export async function generationKeysConfigured() {
  const [gemini, elevenlabs] = await Promise.all([
    getAiKey("gemini"),
    getAiKey("elevenlabs"),
  ])
  return { background: Boolean(gemini), soundscape: Boolean(elevenlabs) }
}

export async function generateBackgroundVideo(
  prompt: string,
  signal?: AbortSignal
): Promise<GeneratedFile> {
  const apiKey = await requireKey("gemini")

  const started = await fetch(
    `${GEMINI_BASE}/models/${VIDEO_MODEL}:predictLongRunning`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            // The member's words, behind a frame that keeps the result usable
            // as scenery: nothing moving the camera, no text to read, nobody
            // talking at you while you are trying to concentrate.
            prompt: `Ambient focus background, locked camera, seamless visual motion, no text, no people speaking. ${prompt}`,
          },
        ],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: 8,
          resolution: "720p",
          personGeneration: "allow_adult",
        },
      }),
      signal,
    }
  )
  if (!started.ok) throw new Error("PROVIDER_REQUEST_FAILED")

  const operation = asObject(await started.json())
  if (typeof operation.name !== "string") {
    throw new Error("PROVIDER_INVALID_RESPONSE")
  }

  const deadline = Date.now() + VIDEO_DEADLINE_MS
  while (Date.now() < deadline) {
    await delay(VIDEO_POLL_MS, signal)
    const poll = await fetch(`${GEMINI_BASE}/${operation.name}`, {
      headers: { "x-goog-api-key": apiKey },
      signal,
    })
    if (!poll.ok) throw new Error("PROVIDER_REQUEST_FAILED")

    const status = asObject(await poll.json())
    if (status.error) throw new Error("PROVIDER_GENERATION_FAILED")
    if (!status.done) continue

    const uri = findVideoUri(status.response)
    if (!uri) throw new Error("PROVIDER_INVALID_RESPONSE")
    // `redirect: "error"` on purpose: the address came out of a provider's
    // reply, and following wherever it points next is how a reply turns into a
    // request to somewhere else entirely.
    const download = await fetch(uri, {
      headers: { "x-goog-api-key": apiKey },
      redirect: "error",
      signal,
    })
    if (!download.ok) throw new Error("PROVIDER_REQUEST_FAILED")
    return {
      bytes: new Uint8Array(await download.arrayBuffer()),
      kind: "video",
    }
  }

  throw new Error("PROVIDER_TIMEOUT")
}

export async function generateSoundscapeAudio(
  prompt: string,
  signal?: AbortSignal
): Promise<GeneratedFile> {
  const response = await fetch(
    "https://api.elevenlabs.io/v1/sound-generation",
    {
      method: "POST",
      headers: {
        "xi-api-key": await requireKey("elevenlabs"),
        "Content-Type": "application/json",
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text: prompt,
        duration_seconds: 30,
        prompt_influence: 0.3,
        loop: true,
        model_id: "eleven_text_to_sound_v2",
      }),
      signal,
    }
  )
  if (!response.ok) throw new Error("PROVIDER_REQUEST_FAILED")
  return { bytes: new Uint8Array(await response.arrayBuffer()), kind: "audio" }
}

async function requireKey(provider: "gemini" | "elevenlabs") {
  const key = await getAiKey(provider)
  if (!key) throw new ProviderKeyMissingError("PROVIDER_KEY_MISSING")
  return key
}

function asObject(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("PROVIDER_INVALID_RESPONSE")
  }
  return value as Record<string, unknown>
}

/**
 * The finished video's address, wherever in the reply it turns up.
 *
 * Only an address on the provider's own host counts. The shape of the reply has
 * changed between Veo versions, so this walks it rather than reaching for a
 * fixed path, and the host check is what stops a changed shape turning into a
 * download from somewhere else.
 */
function findVideoUri(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if (
    "uri" in value &&
    typeof value.uri === "string" &&
    value.uri.startsWith("https://generativelanguage.googleapis.com/")
  ) {
    return value.uri
  }
  for (const child of Object.values(value)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = findVideoUri(item)
        if (found) return found
      }
      continue
    }
    const found = findVideoUri(child)
    if (found) return found
  }
  return null
}

function delay(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal?.addEventListener(
      "abort",
      () => {
        clearTimeout(timer)
        reject(new Error("ABORTED"))
      },
      { once: true }
    )
  })
}
