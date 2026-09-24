import { describe, expect, it } from "vitest"
import { evmAddressOf, evmWallet, makeEvmWallet } from "./wallet"

// Public test scalar, never a funded wallet.
const secret = `0x${"0".repeat(63)}1`
const address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"
const wallet = evmWallet("Test Chain")

describe("the shared chain wallet", () => {
  it("names the chain it was made for in every refusal", async () => {
    expect(() => wallet.pack({ secret: "bad" })).toThrow(
      "KEY_NOT_APPROVED:Enter a valid Test Chain private key"
    )
    await expect(wallet.verify("testnet", address, secret)).rejects.toThrow(
      "KEY_NOT_APPROVED:Test Chain wallets support mainnet only."
    )
  })
  it("names the address the key really opens when the pair does not match", async () => {
    await expect(
      wallet.verify("mainnet", `0x${"0".repeat(40)}`, secret)
    ).rejects.toThrow(`This key opens ${address}.`)
    await expect(wallet.verify("mainnet", address, secret)).resolves.toEqual({
      validUntil: null,
    })
  })
  it("makes a wallet whose key opens its own address", () => {
    const made = makeEvmWallet()
    expect(evmAddressOf(wallet.pack(made))).toBe(made.address)
  })
})
