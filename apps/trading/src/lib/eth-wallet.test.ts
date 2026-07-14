import { afterEach, describe, expect, it, vi } from "vitest"

import { createInjectedWalletSigner } from "@/lib/eth-wallet"

const ORIGINAL = "0xa000000000000000000000000000000000000001" as const
const CHANGED = "0xb000000000000000000000000000000000000002"

afterEach(() => vi.unstubAllGlobals())

describe("injected wallet signer", () => {
  it("stops before signing when the browser wallet account changes", async () => {
    let account = ORIGINAL
    const request = vi.fn(async ({ method }: { method: string }) => {
      if (method === "eth_accounts") return [account]
      if (method === "eth_chainId") return "0x1"
      return `0x${"1".repeat(130)}`
    })
    vi.stubGlobal("window", { ethereum: { request } })
    const signer = createInjectedWalletSigner(ORIGINAL)

    await expect(signer.getAddresses()).resolves.toEqual([ORIGINAL])
    account = CHANGED as typeof ORIGINAL
    await expect(
      signer.signTypedData({
        domain: {
          name: "HyperliquidSignTransaction",
          version: "1",
          chainId: 1,
          verifyingContract: "0x0000000000000000000000000000000000000000",
        },
        types: {},
        primaryType: "HyperliquidTransaction:Withdraw",
        message: {},
      })
    ).rejects.toThrow("The connected wallet account changed")
    expect(request).not.toHaveBeenCalledWith(
      expect.objectContaining({ method: "eth_signTypedData_v4" })
    )
  })
})
