/**
 * Benign transient socket errors. A remote peer (Binance's keep-alive pool, the
 * Postgres server, a Hyperliquid socket) dropping an *idle* connection surfaces
 * as one of these on a raw socket, asynchronously — not tied to any awaited
 * promise — so it lands as an uncaughtException/unhandledRejection and would
 * otherwise crash the process (and pop Vite's dev overlay). These are safe to
 * ignore: the next request just opens a fresh connection.
 */
const BENIGN_NETWORK_CODES = new Set(["ECONNRESET", "EPIPE", "ETIMEDOUT"])

/** Reads an error's `code`, following undici's nested `cause` (fetch failed → cause). */
function networkCodeOf(error: unknown, depth = 0): string | undefined {
  if (depth > 4 || !error || typeof error !== "object") return undefined
  const e = error as { code?: unknown; cause?: unknown }
  if (typeof e.code === "string") return e.code
  return networkCodeOf(e.cause, depth + 1)
}

function isBenignNetworkError(error: unknown): boolean {
  const code = networkCodeOf(error)
  return code !== undefined && BENIGN_NETWORK_CODES.has(code)
}

let installed = false

/**
 * Installs once, server-side: swallows benign transient socket resets so a
 * dropped keep-alive connection can't crash the long-running backtest queue (or
 * any request). Every other uncaught error is re-thrown so real bugs still
 * surface loudly.
 */
export function installNetworkErrorGuard(): void {
  if (installed) return
  installed = true

  process.on("uncaughtException", (error) => {
    if (isBenignNetworkError(error)) {
      console.warn(
        "[net-guard] ignored transient socket error:",
        error instanceof Error ? error.message : String(error)
      )
      return
    }
    // Not a benign network blip — restore default fatal behavior.
    throw error
  })

  process.on("unhandledRejection", (reason) => {
    if (isBenignNetworkError(reason)) {
      console.warn(
        "[net-guard] ignored transient socket rejection:",
        reason instanceof Error ? reason.message : String(reason)
      )
      return
    }
    throw reason
  })
}
