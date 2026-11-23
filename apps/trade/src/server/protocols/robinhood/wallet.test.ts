import { describe, expect, it } from "vitest"
import { makeEvmWallet } from "@/server/protocols/evm-chain/wallet"
import { packRobinhoodCredential, verifyRobinhoodWallet } from "./wallet"

// Public test scalar, never a funded wallet.
const secret = `0x${"0".repeat(63)}1`
const address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"

describe("Robinhood Chain wallets", () => {
  it("saves a matching address and key, whatever the address's casing", async () => {
    expect(packRobinhoodCredential({ secret: secret.slice(2) })).toBe(secret)
    await expect(
      verifyRobinhoodWallet("mainnet", address.toLowerCase(), secret)
    ).resolves.toEqual({ validUntil: null })
  })
  it("refuses a bad key, a mismatched pair and the practice network in Robinhood's name", async () => {
    expect(() => packRobinhoodCredential({ secret: "0x1234" })).toThrow(
      "KEY_NOT_APPROVED:Enter a valid Robinhood Chain private key"
    )
    await expect(
      verifyRobinhoodWallet("mainnet", `0x${"0".repeat(40)}`, secret)
    ).rejects.toThrow(
      `KEY_NOT_APPROVED:The address and private key do not belong together. This key opens ${address}.`
    )
    await expect(
      verifyRobinhoodWallet("testnet", address, secret)
    ).rejects.toThrow("Robinhood Chain wallets support mainnet only.")
  })
  it("makes a wallet that proves itself", async () => {
    const made = makeEvmWallet()
    await expect(
      verifyRobinhoodWallet(
        "mainnet",
        made.address,
        packRobinhoodCredential(made)
      )
    ).resolves.toEqual({ validUntil: null })
  })
})
