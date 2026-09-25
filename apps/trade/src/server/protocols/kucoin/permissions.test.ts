import { afterEach, expect, it, vi } from "vitest"
import { readKucoinKeyPermission } from "./permissions"
import { kucoinSigned } from "./client"

vi.mock("./client", () => ({
  kucoinSigned: vi.fn(),
  parseKucoinCredential: () => ({
    keyId: "fixture",
    secret: "fixture",
    passphrase: "fixture",
  }),
}))
afterEach(() => vi.resetAllMocks())

it.each([
  [{ permission: "General,Futures,Withdrawal" }, "can-withdraw"],
  [{ permission: "General,Futures" }, "trade-only"],
  [{ permission: "General" }, "unknown"],
  [{ permission: "General,Futures,NewPermission" }, "unknown"],
  [{ permission: "" }, "unknown"],
  [{}, "unknown"],
  [null, "unknown"],
])("reads permission answer %j as %s", async (answer, expected) => {
  vi.mocked(kucoinSigned).mockResolvedValue(answer)
  expect(
    await readKucoinKeyPermission("mainnet", "fixture", () => "fixture")
  ).toBe(expected)
  expect(kucoinSigned).toHaveBeenCalledWith(
    "mainnet",
    expect.any(Object),
    "GET",
    "/api/v1/user/api-key"
  )
})
