import type { LucideIcon } from "lucide-react"

export const runStatuses = ["draft", "active", "inactive"] as const
export const executionStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "aborted",
] as const

export type ScraperRunStatus = (typeof runStatuses)[number]
export type ScraperExecutionStatus = (typeof executionStatuses)[number]
export type ScraperModule = {
  key: "google-maps"
  name: string
  href: string
  icon: LucideIcon
}

export type ScraperRunItem = {
  id: string
  name: string
  status: ScraperRunStatus
  input: Record<string, unknown>
  created_at: string
}

export type ScraperExecutionItem = {
  id: string
  status: ScraperExecutionStatus
  message: string | null
  error: string | null
  stats: Record<string, unknown>
  started_at: string | null
  created_at: string
}

export type ScraperResultItem = {
  id: string
  external_id: string | null
  title: string
  data: Record<string, unknown>
}
