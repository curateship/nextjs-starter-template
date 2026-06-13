// Shared display helpers for call status and duration.

export const CALL_STATUS_LABELS: Record<string, string> = {
  queued: "Queued",
  ringing: "Ringing",
  in_progress: "In progress",
  ended: "Completed",
  failed: "Failed",
}

export function callStatusBadgeVariant(status: string) {
  if (status === "failed") return "destructive" as const
  if (status === "ended") return "secondary" as const
  return "outline" as const
}

export function formatCallDuration(seconds: number | null) {
  if (seconds == null) return null
  const minutes = Math.floor(seconds / 60)
  const rest = seconds % 60
  return `${minutes}:${String(rest).padStart(2, "0")}`
}
