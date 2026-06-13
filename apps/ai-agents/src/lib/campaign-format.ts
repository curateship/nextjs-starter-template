// Shared display helpers for campaign status.

export const CAMPAIGN_STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  running: "Running",
  paused: "Paused",
  completed: "Completed",
}

export function campaignStatusBadgeVariant(status: string) {
  if (status === "running") return "default" as const
  if (status === "completed") return "secondary" as const
  return "outline" as const
}
