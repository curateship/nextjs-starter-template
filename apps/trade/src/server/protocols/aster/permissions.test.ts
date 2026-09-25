import { afterEach, expect, it, vi } from "vitest"
import { readAsterKeyPermission } from "./permissions"
import { asterSigned } from "./client"

vi.mock("./client", () => ({
  asterSigned: vi.fn(),
  parseAsterCredential: () => ({ signer: "0xAbC" }),
}))
afterEach(() => vi.resetAllMocks())

it.each([
  [
    [{ agentAddress: "0xabc", canWithdraw: true, canPerpTrade: true }],
    "can-withdraw",
  ],
  [
    [{ agentAddress: "0xABC", canWithdraw: false, canPerpTrade: true }],
    "trade-only",
  ],
  [
    [{ agentAddress: "0xother", canWithdraw: false, canPerpTrade: true }],
    "unknown",
  ],
  [
    [{ agentAddress: "0xabc", canWithdraw: "false", canPerpTrade: true }],
    "unknown",
  ],
  [[{ agentAddress: "0xabc", canPerpTrade: true }], "unknown"],
  [[], "unknown"],
])("reads the matching agent from %j as %s", async (answer, expected) => {
  vi.mocked(asterSigned).mockResolvedValue(answer)
  expect(
    await readAsterKeyPermission("mainnet", "account", () => "fixture")
  ).toBe(expected)
  expect(asterSigned).toHaveBeenCalledWith(
    "mainnet",
    "account",
    expect.any(Object),
    "GET",
    "/fapi/v3/agent",
    30
  )
})
