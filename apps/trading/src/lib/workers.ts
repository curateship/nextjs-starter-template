export const WORKER_KINDS = [
  "bot",
  "whale-scanner",
  "market-scanner",
  "backtest",
] as const

export type WorkerKind = (typeof WORKER_KINDS)[number]

export type WorkerControl = {
  kind: WorkerKind
  enabled: boolean
  paused: boolean
  updatedAt: string
}

export type WorkerState = "running" | "idle" | "paused" | "off" | "offline"

export type WorkerStatus = WorkerControl & {
  label: string
  description: string
  state: WorkerState
  online: boolean
  active: boolean
  activeProcesses: number
  role: "leader" | "standby" | null
  startedAt: string | null
  lastHeartbeatAt: string | null
  lastSuccessfulWorkAt: string | null
  currentActivity: string
  latestError: string | null
  userPaused: boolean | null
  metrics: Array<{ label: string; value: string }>
}

export type WorkersDashboardData = {
  checkedAt: string
  canControl: boolean
  workers: WorkerStatus[]
  overview: {
    online: number
    active: number
    pausedOrOff: number
    needsAttention: number
  }
}

export function safeWorkerError(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, "[redacted]")
    .replace(
      /\b(password|token|secret|api[_ -]?key|private[_ -]?key|key)\s*[:=]\s*[^\s,;]+/gi,
      "$1=[redacted]"
    )
    .replace(/\bbearer\s+[^\s,;]+/gi, "Bearer [redacted]")
    .replace(/\b(?:0x)?[0-9a-f]{64}\b/gi, "[redacted key]")
    .replace(/0x[0-9a-f]{40}/gi, "[redacted address]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}(?::\d{1,5})?\b/g, "[redacted host]")
    .replace(
      /\b(?:localhost|[a-z0-9-]+(?:\.[a-z0-9-]+)+):\d{2,5}\b/gi,
      "[redacted host]"
    )
    .slice(0, 200)
}
