import { afterEach, expect, it, vi } from "vitest"
import { ROBINHOOD_CHAIN_ID, robinhoodRpcUrl } from "./client"

afterEach(() => vi.unstubAllEnvs())

it("uses Robinhood's public node unless .env names another", () => {
  expect(ROBINHOOD_CHAIN_ID).toBe(4663)
  vi.stubEnv("TRADE_ROBINHOOD_RPC", "")
  expect(robinhoodRpcUrl()).toBe("https://rpc.mainnet.chain.robinhood.com")
  vi.stubEnv("TRADE_ROBINHOOD_RPC", " https://node.example/rpc ")
  expect(robinhoodRpcUrl()).toBe("https://node.example/rpc")
})
