import type { IncomingMessage, ServerResponse } from "node:http"
import { describe, expect, it, vi } from "vitest"

import { handleRequestNetworkError } from "./vite-request-error-handler"

function response(overrides: Partial<ServerResponse> = {}): ServerResponse {
  return {
    destroyed: false,
    headersSent: false,
    writableEnded: false,
    end: vi.fn(),
    ...overrides,
  } as unknown as ServerResponse
}

describe("handleRequestNetworkError", () => {
  it("turns a request ECONNRESET into a retryable response", () => {
    const res = response()
    const next = vi.fn()

    handleRequestNetworkError(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      {} as IncomingMessage,
      res,
      next
    )

    expect(res.statusCode).toBe(503)
    expect(res.end).toHaveBeenCalledWith("Connection reset; retry the request.")
    expect(next).not.toHaveBeenCalled()
  })

  it("does not write after the browser has disconnected", () => {
    const res = response({ destroyed: true })
    const next = vi.fn()

    handleRequestNetworkError(
      Object.assign(new Error("read ECONNRESET"), { code: "ECONNRESET" }),
      {} as IncomingMessage,
      res,
      next
    )

    expect(res.end).not.toHaveBeenCalled()
    expect(next).not.toHaveBeenCalled()
  })

  it("passes genuine server errors to Vite's overlay", () => {
    const error = new Error("database invariant failed")
    const res = response()
    const next = vi.fn()

    handleRequestNetworkError(error, {} as IncomingMessage, res, next)

    expect(next).toHaveBeenCalledWith(error)
    expect(res.end).not.toHaveBeenCalled()
  })
})
