import type { IncomingMessage, ServerResponse } from "node:http"
import type { Plugin } from "vite"

type Next = (error?: unknown) => void

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined
  const value = error as { code?: unknown; cause?: unknown }
  if (typeof value.code === "string") return value.code
  return errorCode(value.cause)
}

/**
 * A reset means one side of this development request has already disappeared.
 * Treat it as a retryable request failure instead of sending it to Vite's HMR
 * overlay. All other errors continue to Vite unchanged.
 */
export function handleRequestNetworkError(
  error: unknown,
  _req: IncomingMessage,
  res: ServerResponse,
  next: Next
): void {
  const code = errorCode(error)
  if (code !== "ECONNRESET" && code !== "EPIPE") {
    next(error)
    return
  }

  if (res.destroyed || res.writableEnded) return

  res.statusCode = 503
  res.end("Connection reset; retry the request.")
}

/** Installs after Nitro and immediately before Vite's overlay middleware. */
export function requestNetworkErrorPlugin(): Plugin {
  return {
    name: "trading-request-network-errors",
    configureServer(server) {
      return () => {
        server.middlewares.use(handleRequestNetworkError)
      }
    },
  }
}
