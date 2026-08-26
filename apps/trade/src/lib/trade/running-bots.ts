export const RUNNING_BOTS_READ_ERROR = "The running bots could not be read."

/** One bot that is switched on, as the exchange dashboard lists it. */
export type RunningBot = {
  runId: string
  automationId: string
  name: string
  strategy: "DCA ladder" | "Signals"
  marketCount: number
  workingCount: number
  holdingCount: number
  netUsd: number
  tradesClosed: number
  walletLabel: string
  real: boolean
  startedAt: number
  paused: boolean
  stopping: boolean
}
