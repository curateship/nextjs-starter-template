import { lookup } from "node:dns/promises"
import { isIP } from "node:net"

import type { VideoGenerationSettings } from "@/server/ai-video/workflows"

export type ProviderCreateInput = {
  prompt: string
  model: string
  settings: VideoGenerationSettings
  referenceUrls: string[]
}

export type ProviderCreateResult = {
  providerTaskId: string
  status: "queued" | "generating" | "succeeded" | "failed"
  resultUrl?: string
  error?: string
}

export type ProviderStatusResult = ProviderCreateResult

export type ProviderDownloadResult = {
  data: Uint8Array
  contentType: string
}

export type VideoProvider = {
  key: string
  defaultModel: string
  createGeneration: (input: ProviderCreateInput) => Promise<ProviderCreateResult>
  getGenerationStatus: (providerTaskId: string) => Promise<ProviderStatusResult>
  downloadResult: (resultUrl: string) => Promise<ProviderDownloadResult>
}

const MAX_RESULT_DOWNLOAD_BYTES = 500 * 1024 * 1024
const MAX_RESULT_REDIRECTS = 3

export function getVideoProvider(providerKey: string): VideoProvider {
  if (providerKey === "seedance") {
    return seedanceProvider
  }
  if (providerKey === "veo") {
    return veoProvider
  }
  throw new Error("Video provider not found.")
}

export const seedanceProvider: VideoProvider = {
  key: "seedance",
  defaultModel: process.env.AI_VIDEO_SEEDANCE_MODEL || "seedance",
  async createGeneration(input) {
    const response = await seedanceFetch("/contents/generations/tasks", {
      method: "POST",
      body: JSON.stringify({
        model: input.model,
        content: [
          { type: "text", text: input.prompt },
          ...input.referenceUrls.map((url) => ({
            type: "image_url",
            image_url: { url },
          })),
        ],
        parameters: {
          ratio: input.settings.aspectRatio,
          duration: input.settings.durationSeconds,
          resolution: input.settings.resolution,
          audio: input.settings.nativeAudio,
        },
      }),
    })

    return normalizeSeedanceTask(await response.json())
  },
  async getGenerationStatus(providerTaskId) {
    const response = await seedanceFetch(
      `/contents/generations/tasks/${encodeURIComponent(providerTaskId)}`,
      { method: "GET" }
    )
    return normalizeSeedanceTask(await response.json(), providerTaskId)
  },
  async downloadResult(resultUrl) {
    const response = await fetchSafeVideoResult(new URL(resultUrl))
    if (!response.ok) {
      throw new Error("Provider result download failed.")
    }

    const contentType = response.headers.get("content-type") || ""
    if (!contentType.toLowerCase().startsWith("video/")) {
      throw new Error("Provider result is not a video.")
    }

    const contentLength = Number(response.headers.get("content-length") || 0)
    if (contentLength > MAX_RESULT_DOWNLOAD_BYTES) {
      throw new Error("Generated video is too large.")
    }

    const data = new Uint8Array(await response.arrayBuffer())
    if (data.byteLength > MAX_RESULT_DOWNLOAD_BYTES) {
      throw new Error("Generated video is too large.")
    }

    return {
      data,
      contentType,
    }
  },
}

export const veoProvider: VideoProvider = {
  key: "veo",
  defaultModel: process.env.AI_VIDEO_VEO_MODEL || "veo",
  async createGeneration() {
    throw new Error("Veo adapter is not implemented yet.")
  },
  async getGenerationStatus() {
    throw new Error("Veo adapter is not implemented yet.")
  },
  async downloadResult() {
    throw new Error("Veo adapter is not implemented yet.")
  },
}

async function seedanceFetch(path: string, init: RequestInit) {
  const apiKey = process.env.AI_VIDEO_SEEDANCE_API_KEY
  const model = process.env.AI_VIDEO_SEEDANCE_MODEL
  if (!apiKey || !model) {
    throw new Error("AI_VIDEO_SEEDANCE_API_KEY and AI_VIDEO_SEEDANCE_MODEL are required.")
  }

  const baseUrl =
    process.env.AI_VIDEO_SEEDANCE_BASE_URL ||
    "https://ark.ap-southeast.bytepluses.com/api/v3"
  const response = await fetch(`${baseUrl.replace(/\/+$/, "")}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
  })

  if (!response.ok) {
    throw new Error("Seedance request failed.")
  }

  return response
}

function normalizeSeedanceTask(
  body: unknown,
  fallbackTaskId?: string
): ProviderStatusResult {
  const record = body as Record<string, unknown>
  const data = (record.data || record.task || record.result || record) as Record<
    string,
    unknown
  >
  const providerTaskId =
    stringValue(data.id) ||
    stringValue(data.task_id) ||
    stringValue(record.id) ||
    fallbackTaskId

  if (!providerTaskId) {
    throw new Error("Seedance response did not include a task id.")
  }

  const rawStatus =
    stringValue(data.status) ||
    stringValue(data.state) ||
    stringValue(record.status) ||
    "queued"
  const status = normalizeProviderStatus(rawStatus)
  const resultUrl =
    stringValue(data.video_url) ||
    stringValue(data.url) ||
    stringValue((data.output as Record<string, unknown> | undefined)?.url) ||
    stringValue((data.content as Record<string, unknown> | undefined)?.video_url)
  const error =
    stringValue(data.error) ||
    stringValue(data.message) ||
    stringValue(record.error)

  return {
    providerTaskId,
    status,
    resultUrl,
    error,
  }
}

function normalizeProviderStatus(value: string): ProviderStatusResult["status"] {
  const status = value.toLowerCase()
  if (["success", "succeeded", "completed", "done"].includes(status)) {
    return "succeeded"
  }
  if (["failed", "error", "cancelled", "canceled"].includes(status)) {
    return "failed"
  }
  if (["running", "processing", "generating"].includes(status)) {
    return "generating"
  }
  return "queued"
}

function stringValue(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : undefined
}

async function fetchSafeVideoResult(url: URL) {
  let nextUrl = url
  for (let redirects = 0; redirects <= MAX_RESULT_REDIRECTS; redirects += 1) {
    await assertSafeProviderResultUrl(nextUrl)
    const response = await fetch(nextUrl.toString(), { redirect: "manual" })

    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return response
    }

    const location = response.headers.get("location")
    if (!location) {
      throw new Error("Provider result redirect is missing a location.")
    }
    nextUrl = new URL(location, nextUrl)
  }

  throw new Error("Provider result redirected too many times.")
}

async function assertSafeProviderResultUrl(url: URL) {
  if (url.protocol !== "https:" || url.username || url.password) {
    throw new Error("Invalid provider result URL.")
  }
  if (url.port && url.port !== "443") {
    throw new Error("Invalid provider result URL.")
  }

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase()
  if (!hostname || hostname === "localhost" || hostname.endsWith(".localhost")) {
    throw new Error("Invalid provider result URL.")
  }

  const parsedIp = isIP(hostname)
  const addresses = parsedIp
    ? [{ address: hostname }]
    : await lookup(hostname, { all: true, verbatim: true })

  if (!addresses.length || addresses.some(({ address }) => isPrivateAddress(address))) {
    throw new Error("Invalid provider result URL.")
  }
}

function isPrivateAddress(address: string) {
  const normalized = address.toLowerCase()
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1]
  if (mappedIpv4) return isPrivateIpv4(mappedIpv4)
  if (isIP(normalized) === 4) return isPrivateIpv4(normalized)

  return (
    normalized === "::" ||
    normalized === "::1" ||
    normalized.startsWith("fc") ||
    normalized.startsWith("fd") ||
    normalized.startsWith("fe80:") ||
    normalized.startsWith("ff")
  )
}

function isPrivateIpv4(address: string) {
  const parts = address.split(".").map((part) => Number(part))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) {
    return true
  }

  const [a, b] = parts
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  )
}
