import { expect, it, vi } from "vitest"
import { readHyperliquidKeyPermission } from "./permissions"
import { readPhemexKeyPermission } from "../phemex/permissions"
import { readLighterKeyPermission } from "../lighter/permissions"

vi.mock("./signing", () => ({ agentAddress: () => "0xagent" }))

it("classifies agents locally on both networks and detects legacy master keys", async () => {
  const fetch = vi.spyOn(globalThis, "fetch")
  for (const network of ["mainnet", "testnet"] as const) {
    expect(
      await readHyperliquidKeyPermission(network, "0xaccount", () => "fixture")
    ).toBe("trade-only")
    expect(
      await readHyperliquidKeyPermission(network, "0xagent", () => "fixture")
    ).toBe("can-withdraw")
    expect(
      await readHyperliquidKeyPermission(network, "0xaccount", () => null)
    ).toBe("unknown")
  }
  expect(await readPhemexKeyPermission()).toBe("unknown")
  expect(await readLighterKeyPermission()).toBe("unknown")
  expect(fetch).not.toHaveBeenCalled()
  fetch.mockRestore()
})
