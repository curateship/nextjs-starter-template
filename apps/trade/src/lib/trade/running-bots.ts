export const RUNNING_BOTS_READ_ERROR = "The running bots could not be read."

/** One bot that is switched on, as the exchange dashboard lists it. */
export type RunningBot = {
  runId: string
  name: string
  strategy: "DCA ladder" | "Signals"
  marketCount: number
}
