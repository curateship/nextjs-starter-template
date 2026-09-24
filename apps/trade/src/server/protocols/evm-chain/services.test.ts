import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { evmServices } from "./services"

const config = {
  quotes: {
    label: "Quotes",
    base: "https://quotes.example",
    cap: 2,
    windowMs: 1_000,
    reserve: 1,
  },
}
beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("gives every chain its own allowance for the same service", () => {
  const first = evmServices(config, "FIRST_SERVICE")
  const second = evmServices(config, "SECOND_SERVICE")
  first.reserve("quotes")
  expect(() => first.reserve("quotes")).toThrow(
    "EXCHANGE_BUSY:Quotes spent 1 of 1 requests in 1 seconds."
  )
  first.reserve("quotes", "order")
  expect(() => second.reserve("quotes")).not.toThrow()
  expect(first.counts()).toEqual({ quotes: 2 })
  expect(second.counts()).toEqual({ quotes: 1 })
})

it("names the chain's own code on a refused answer or a path to another host", async () => {
  const services = evmServices(config, "TEST_SERVICE")
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue(new Response(null, { status: 503 }))
  )
  await expect(services.get("quotes", "/one")).rejects.toThrow(
    "TEST_SERVICE_REFUSED:Quotes:503"
  )
  await expect(
    services.get("quotes", "https://elsewhere.example/one")
  ).rejects.toThrow("TEST_SERVICE_PATH")
})
