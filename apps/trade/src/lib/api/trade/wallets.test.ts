import { describe, expect, it } from "vitest"

import { getWalletErrorMessage } from "@/lib/api/trade/wallets"

describe("wallet error messages", () => {
  it("does not call a matching Aster address the main private key", () => {
    const message = getWalletErrorMessage(
      new Error("ASTER_KEY_MATCHES_ACCOUNT")
    )

    expect(message).toContain("generated API wallet address")
    expect(message).not.toContain("MAIN key")
  })
})
