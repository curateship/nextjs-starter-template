export type EngineOutageRow = {
  startedAt: string
  endedAt: string | null
  durationMs: number
}

export type EngineUptime = {
  outages: EngineOutageRow[]
  totalDowntimeMs: number
  checkedAt: string
}
