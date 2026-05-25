import type { LucideIcon } from "lucide-react"

export const runStatuses = ["draft", "active", "inactive"] as const
export const executionStatuses = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "aborted",
] as const

export type ProviderRunConfigStatus = (typeof runStatuses)[number]
export type ProviderExecutionStatus = (typeof executionStatuses)[number]
export type ProviderModule = {
  key: "google-maps"
  name: string
  href: string
  icon: LucideIcon
}

export type ProviderRunConfigItem = {
  id: string
  name: string
  status: ProviderRunConfigStatus
  input: Record<string, unknown>
  created_at: string
}

export type ProviderExecutionItem = {
  id: string
  status: ProviderExecutionStatus
  message: string | null
  error: string | null
  stats: Record<string, unknown>
  started_at: string | null
  created_at: string
}

export type ProviderResultItem = {
  id: string
  external_id: string | null
  title: string
  data: Record<string, unknown>
  created_at: string
}
