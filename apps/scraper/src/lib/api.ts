import { config } from "@/lib/config"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "canceled"

export type ScraperModuleRecord = {
  key: string
  name: string
  description: string
  enabled: boolean
  capabilities: Record<string, unknown>
}

export type ScraperRun = {
  id: string
  module_key: string
  input: Record<string, unknown>
  status: RunStatus
  error_message: string | null
  scheduled_for: string | null
  total_raw_items: number
  total_results: number
  attempt_count: number
  created_at: string
  started_at: string | null
  finished_at: string | null
}

export type ScraperResult = {
  id: string
  run_id: string
  raw_item_id: string | null
  module_key: string
  module_record_table: string
  module_record_id: string
  external_id: string | null
  source_url: string | null
  title: string | null
  summary: string | null
  sortable_text: string | null
  metrics: Record<string, unknown>
  details: Record<string, unknown>
  created_at: string
}

type ApiErrorBody = {
  detail?: unknown
  error?: unknown
  message?: unknown
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${config.apiBaseUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        ...(init?.headers ?? {}),
      },
    })
  } catch (error) {
    throw new ApiError(`Scraper API is not reachable at ${config.apiBaseUrl}`, 0)
  }

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`
    try {
      message = getErrorMessage(await response.json(), message)
    } catch {
      // Keep the status fallback for non-JSON errors.
    }
    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function adminHeaders() {
  if (!config.adminToken) {
    throw new ApiError("VITE_SCRAPER_ADMIN_TOKEN is required for scraper mutations", 401)
  }

  return {
    "x-admin-token": config.adminToken,
  }
}

export function listModules() {
  return request<{ modules: ScraperModuleRecord[] }>("/api/v1/modules")
}

export function listRuns(moduleKey?: string) {
  const query = moduleKey ? `?module_key=${encodeURIComponent(moduleKey)}` : ""
  return request<{ runs: ScraperRun[] }>(`/api/v1/runs${query}`)
}

export function createRun(payload: { module_key: string; input: Record<string, unknown> }) {
  return request<{ run: ScraperRun }>("/api/v1/runs", {
    method: "POST",
    headers: adminHeaders(),
    body: JSON.stringify(payload),
  })
}

export function getRun(runId: string) {
  return request<{ run: ScraperRun }>(`/api/v1/runs/${runId}`)
}

export function getRunResults(runId: string) {
  return request<{ results: ScraperResult[] }>(`/api/v1/runs/${runId}/results`)
}

function getErrorMessage(body: unknown, fallback: string) {
  if (!body || typeof body !== "object") {
    return fallback
  }

  const errorBody = body as ApiErrorBody
  return formatErrorValue(errorBody.detail ?? errorBody.error ?? errorBody.message, fallback)
}

function formatErrorValue(value: unknown, fallback: string): string {
  if (!value) {
    return fallback
  }

  if (typeof value === "string") {
    return cleanErrorMessage(value)
  }

  if (Array.isArray(value)) {
    const messages = value
      .map((item) => formatErrorValue(item, ""))
      .filter(Boolean)

    return messages.join("; ") || fallback
  }

  if (typeof value === "object") {
    const record = value as Record<string, unknown>
    const message = record.msg ?? record.message ?? record.detail

    if (message) {
      const location = Array.isArray(record.loc)
        ? record.loc.filter((part) => part !== "body").join(".")
        : ""
      const text = formatErrorValue(message, fallback)
      return location ? `${location}: ${text}` : text
    }

    try {
      return JSON.stringify(value)
    } catch {
      return fallback
    }
  }

  return String(value)
}

function cleanErrorMessage(message: string) {
  return message.replace(/^Value error,\s*/i, "")
}
