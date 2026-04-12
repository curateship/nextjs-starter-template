import { config } from "@/lib/config"

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
  }
}

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "blocked"
  | "canceled"

export interface RunSummary {
  id: string
  module_key: string
  keyword: string
  area: string
  max_places: number
  status: RunStatus
  error_message: string | null
  cancel_requested_at: string | null
  total_places_found: number
  total_places_saved: number
  created_at: string
  started_at: string | null
  finished_at: string | null
  attempt_count: number
}

export interface PlaceRecord {
  id: string
  external_id: string
  name: string
  primary_category: string | null
  address: string | null
  phone: string | null
  website: string | null
  latitude: number | null
  longitude: number | null
  google_maps_url: string
}

export interface PlaceSnapshotRecord {
  id: string
  rating: number | null
  review_count: number | null
  hours_text: string[] | null
  scraped_at: string
}

export interface RunResultRecord {
  id: string
  position: number
  place: PlaceRecord
  snapshot: PlaceSnapshotRecord
}

export interface RunDetail extends RunSummary {
  scheduled_for: string | null
}

export interface ScheduleRecord {
  id: string
  module_key: string
  keyword: string
  area: string
  max_places: number
  cadence: "daily" | "weekly" | "monthly"
  timezone: string
  active: boolean
  next_run_at: string
  last_run_at: string | null
  created_at: string
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${config.apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  })

  if (!response.ok) {
    let message = `Request failed with status ${response.status}`

    try {
      const body = (await response.json()) as { detail?: string; error?: string }
      message = body.detail || body.error || message
    } catch {
      // Ignore non-JSON error bodies.
    }

    throw new ApiError(message, response.status)
  }

  if (response.status === 204) {
    return undefined as T
  }

  return (await response.json()) as T
}

function getAdminHeaders() {
  if (!config.adminToken) {
    throw new ApiError("VITE_SCRAPER_ADMIN_TOKEN is required for scraper mutations", 401)
  }

  return {
    "x-admin-token": config.adminToken,
  }
}

export function listRuns() {
  return request<{ runs: RunSummary[] }>("/api/v1/runs")
}

export function getRun(runId: string) {
  return request<{ run: RunDetail }>(`/api/v1/runs/${runId}`)
}

export function getRunResults(runId: string) {
  return request<{ results: RunResultRecord[] }>(`/api/v1/runs/${runId}/results`)
}

export function createRun(payload: { keyword: string; area: string; max_places: number }) {
  return request<{ run: RunSummary }>("/api/v1/runs", {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
  })
}

export function cancelRun(runId: string) {
  return request<{ run: RunSummary }>(`/api/v1/runs/${runId}/cancel`, {
    method: "POST",
    headers: getAdminHeaders(),
  })
}

export function listSchedules() {
  return request<{ schedules: ScheduleRecord[] }>("/api/v1/schedules")
}

export function createSchedule(payload: {
  keyword: string
  area: string
  max_places: number
  cadence: "daily" | "weekly" | "monthly"
  timezone: string
}) {
  return request<{ schedule: ScheduleRecord }>("/api/v1/schedules", {
    method: "POST",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
  })
}

export function updateSchedule(
  scheduleId: string,
  payload: Partial<{
    keyword: string
    area: string
    max_places: number
    cadence: "daily" | "weekly" | "monthly"
    timezone: string
    active: boolean
  }>
) {
  return request<{ schedule: ScheduleRecord }>(`/api/v1/schedules/${scheduleId}`, {
    method: "PATCH",
    headers: getAdminHeaders(),
    body: JSON.stringify(payload),
  })
}

export function deleteSchedule(scheduleId: string) {
  return request<void>(`/api/v1/schedules/${scheduleId}`, {
    method: "DELETE",
    headers: getAdminHeaders(),
  })
}
