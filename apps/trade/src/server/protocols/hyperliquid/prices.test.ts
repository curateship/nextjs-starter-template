import { expect, it, vi } from "vitest"
import { fetchHyperliquidPrices, forgetHyperliquidPrice } from "./prices"

const allMids = vi.hoisted(() => vi.fn())
vi.mock("@/server/protocols/hyperliquid/client", () => ({
  infoClient: () => ({ allMids }),
}))

it("reads a new venue price after a passive-price refusal without expiring other venues", async () => {
  allMids
    .mockResolvedValueOnce({ DOT: "1" })
    .mockResolvedValueOnce({ XYZ: "5" })
    .mockResolvedValueOnce({ DOT: "1.01" })
  expect((await fetchHyperliquidPrices("testnet", ["DOT"])).get("DOT")).toBe(1)
  await fetchHyperliquidPrices("testnet", ["xyz:XYZ"])
  forgetHyperliquidPrice("testnet", "DOT")
  expect((await fetchHyperliquidPrices("testnet", ["DOT"])).get("DOT")).toBe(
    1.01
  )
  await fetchHyperliquidPrices("testnet", ["xyz:XYZ"])
  expect(allMids).toHaveBeenCalledTimes(3)
})
