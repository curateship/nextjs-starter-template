const GEMINI_BASE = "https://generativelanguage.googleapis.com/v1beta"

export async function generateBackground(prompt: string, signal?: AbortSignal) {
  const apiKey = required("GEMINI_API_KEY")
  const model = process.env.POMODER_GEMINI_VIDEO_MODEL || "veo-3.1-lite-generate-preview"
  const response = await fetch(`${GEMINI_BASE}/models/${model}:predictLongRunning`, {
    method: "POST",
    headers: { "x-goog-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({ instances: [{ prompt: `Ambient focus background, locked camera, seamless visual motion, no text, no people speaking. ${prompt}` }], parameters: { aspectRatio: "16:9", durationSeconds: 8, resolution: "720p", personGeneration: "allow_adult" } }),
    signal,
  })
  if (!response.ok) throw new Error("GEMINI_REQUEST_FAILED")
  const operation = validateObject(await response.json())
  if (typeof operation.name !== "string") throw new Error("GEMINI_INVALID_RESPONSE")

  const deadline = Date.now() + 6 * 60_000
  while (Date.now() < deadline) {
    await delay(10_000, signal)
    const poll = await fetch(`${GEMINI_BASE}/${operation.name}`, { headers: { "x-goog-api-key": apiKey }, signal })
    if (!poll.ok) throw new Error("GEMINI_POLL_FAILED")
    const status = validateObject(await poll.json())
    if (status.error) throw new Error("GEMINI_GENERATION_FAILED")
    if (status.done) {
      const uri = findVideoUri(status.response)
      if (!uri) throw new Error("GEMINI_INVALID_RESPONSE")
      const download = await fetch(uri, { headers: { "x-goog-api-key": apiKey }, redirect: "error", signal })
      if (!download.ok) throw new Error("GEMINI_DOWNLOAD_FAILED")
      return new Uint8Array(await download.arrayBuffer())
    }
  }
  throw new Error("GEMINI_TIMEOUT")
}

export async function generateSoundscape(prompt: string, signal?: AbortSignal) {
  const response = await fetch("https://api.elevenlabs.io/v1/sound-generation", {
    method: "POST",
    headers: { "xi-api-key": required("ELEVENLABS_API_KEY"), "Content-Type": "application/json", Accept: "audio/mpeg" },
    body: JSON.stringify({ text: prompt, duration_seconds: 30, prompt_influence: 0.3, loop: true, model_id: "eleven_text_to_sound_v2" }),
    signal,
  })
  if (!response.ok) throw new Error("ELEVENLABS_REQUEST_FAILED")
  return new Uint8Array(await response.arrayBuffer())
}

function required(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name}_NOT_CONFIGURED`); return value }
function validateObject(value: unknown): Record<string, unknown> { if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("PROVIDER_INVALID_RESPONSE"); return value as Record<string, unknown> }
function findVideoUri(value: unknown): string | null {
  if (!value || typeof value !== "object") return null
  if ("uri" in value && typeof value.uri === "string" && value.uri.startsWith("https://generativelanguage.googleapis.com/")) return value.uri
  for (const child of Object.values(value)) { if (Array.isArray(child)) { for (const item of child) { const result = findVideoUri(item); if (result) return result } } else { const result = findVideoUri(child); if (result) return result } }
  return null
}
function delay(ms: number, signal?: AbortSignal) { return new Promise<void>((resolve, reject) => { const timer = setTimeout(resolve, ms); signal?.addEventListener("abort", () => { clearTimeout(timer); reject(new Error("ABORTED")) }, { once: true }) }) }
