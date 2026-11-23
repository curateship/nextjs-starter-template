import { getAiKey } from "@/server/ai/keys"
import { GENERATION_MODELS, generationStyle } from "@/lib/pomodoro/generation"

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

const VIDEO = GENERATION_MODELS.background
const SOUND = GENERATION_MODELS.soundscape

/** Veo renders in the background, so the request returns a job to poll. */
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

/**
 * The member's words, behind a frame that keeps the result usable as scenery:
 * nothing moving the camera, no text to read, nobody talking at you while you
 * are trying to concentrate. A style pill's words sit inside the frame, after
 * those rules, so a style adds a look and never lifts a rule (task 06, part 6).
 */
export function backgroundPrompt(prompt: string, style: string | null = null) {
  const look = generationStyle(style)
  return [
    "Ambient focus background, locked camera, seamless visual motion, no text, no people speaking.",
    look?.words,
    prompt,
  ]
    .filter(Boolean)
    .join(" ")
}

/** A picture to start the film from (task 06, part 3), as Veo takes it. */
export type StartingPicture = { bytes: Uint8Array; mimeType: string }

export async function generateBackgroundVideo(
  prompt: string,
  {
    style = null,
    picture = null,
    signal,
  }: {
    style?: string | null
    picture?: StartingPicture | null
    signal?: AbortSignal
  } = {}
): Promise<GeneratedFile> {
  const apiKey = await requireKey("gemini")

  const started = await fetch(
    `${GEMINI_BASE}/models/${VIDEO.model}:predictLongRunning`,
    {
      method: "POST",
      headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
      body: JSON.stringify({
        instances: [
          {
            prompt: backgroundPrompt(prompt, style),
            // Veo 3.1 Lite takes a first frame to animate. Its
            // predictLongRunning call refuses `inlineData` ("isn't supported
            // by this model") and takes these two fields instead, tried
            // against the live API on 10 Oct 2026.
            ...(picture
              ? {
                  image: {
                    bytesBase64Encoded: Buffer.from(picture.bytes).toString("base64"),
                    mimeType: picture.mimeType,
                  },
                }
              : {}),
          },
        ],
        parameters: {
          aspectRatio: "16:9",
          durationSeconds: VIDEO.seconds,
          resolution: "720p",
          // Veo refuses "allow_adult" from words alone ("allow_adult for
          // personGeneration is currently not supported") and "dont_allow"
          // too, which failed every background until 10 Oct 2026. Words take
          // "allow_all"; a starting picture takes "allow_adult".
          personGeneration: picture ? "allow_adult" : "allow_all",
        },
      }),
      signal,
    }
  )
  if (!started.ok) {
    // The member reads a plain sentence, so the provider's own reason goes to
    // the worker's log, where a refusal like a used-up quota can be found.
    console.error("veo refused the request", started.status, await providerReason(started))
    throw new Error("PROVIDER_REQUEST_FAILED")
  }

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
    const download = await downloadVideo(uri, apiKey, signal)
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
        duration_seconds: SOUND.seconds,
        prompt_influence: 0.3,
        loop: true,
        model_id: SOUND.model,
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
 * Fetches the finished video. Google answers the file's address by sending
 * the download on to its own storage (its guide downloads with `curl -L`), so
 * one hop is followed, and only to a Google host, without the key: the
 * address came out of a provider's reply, and following wherever it points
 * is how a reply turns into a request to somewhere else entirely.
 */
async function downloadVideo(uri: string, apiKey: string, signal?: AbortSignal) {
  const first = await fetch(uri, {
    headers: { "x-goog-api-key": apiKey },
    redirect: "manual",
    signal,
  })
  if (first.ok) return first
  const next = first.status >= 300 && first.status < 400 ? first.headers.get("location") : null
  if (!next || !isGoogleHost(next, uri)) {
    console.error("veo download refused", first.status)
    throw new Error("PROVIDER_REQUEST_FAILED")
  }
  const second = await fetch(new URL(next, uri), { redirect: "error", signal })
  if (!second.ok) {
    console.error("veo download refused", second.status)
    throw new Error("PROVIDER_REQUEST_FAILED")
  }
  return second
}

/** An https address on one of Google's own hosts. */
function isGoogleHost(address: string, base: string) {
  try {
    const url = new URL(address, base)
    return (
      url.protocol === "https:" &&
      (url.hostname === "googleapis.com" ||
        url.hostname.endsWith(".googleapis.com") ||
        url.hostname.endsWith(".googleusercontent.com"))
    )
  } catch {
    return false
  }
}

/** The provider's own error sentence, for the log only. */
async function providerReason(response: Response) {
  try {
    const body = asObject(await response.json())
    const error = asObject(body.error)
    return typeof error.message === "string" ? error.message.slice(0, 200) : ""
  } catch {
    return ""
  }
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
