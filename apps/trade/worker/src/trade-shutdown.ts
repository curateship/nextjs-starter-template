/** The longest a container replacement waits for trading work to finish. */
export const TRADE_PASS_SHUTDOWN_WAIT_MS = 5_000

type PassWaitOutcome = "finished" | "timed-out"

/** Waits for every pass the engine still owns, but never holds shutdown open forever. */
export async function waitForTradePasses(
  passes: readonly Promise<unknown>[],
  wallets: number,
  waitMs = TRADE_PASS_SHUTDOWN_WAIT_MS,
  report: (message: string) => void = (message) => console.error(message)
): Promise<PassWaitOutcome> {
  if (passes.length === 0) return "finished"

  let timer: ReturnType<typeof setTimeout> | null = null
  const finished = Promise.allSettled(passes).then(
    (): PassWaitOutcome => "finished"
  )
  const timedOut = new Promise<PassWaitOutcome>((resolve) => {
    timer = setTimeout(() => resolve("timed-out"), waitMs)
  })
  const outcome = await Promise.race([finished, timedOut])
  if (timer) clearTimeout(timer)

  if (outcome === "timed-out") {
    const noun = wallets === 1 ? "wallet" : "wallets"
    report(
      `trade worker: shutdown waited ${waitMs}ms for ${wallets} ${noun}; exiting before every pass finished`
    )
  }
  return outcome
}
