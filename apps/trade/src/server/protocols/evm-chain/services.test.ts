import { afterEach, beforeEach, expect, it, vi } from "vitest"

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
  vi.resetModules()
  vi.useFakeTimers()
  vi.setSystemTime(100_000)
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

it("shares one allowance per host between chains", async () => {
  const { evmServices } = await import("./services")
  const first = evmServices(config, "FIRST_SERVICE")
  const second = evmServices(config, "SECOND_SERVICE")
  first.reserve("quotes")
  expect(() => second.reserve("quotes")).toThrow(
    "EXCHANGE_BUSY:Quotes spent 1 of 1 requests in 1 seconds."
  )
  second.reserve("quotes", "order")
  expect(first.counts()).toEqual({ quotes: 2 })
  expect(second.counts()).toEqual({ quotes: 2 })
  vi.advanceTimersByTime(1_000)
  expect(() => first.reserve("quotes")).not.toThrow()
})

it("names the chain's own code on a refused answer or a path to another host", async () => {
  const { evmServices } = await import("./services")
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
