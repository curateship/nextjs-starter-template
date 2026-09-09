import { describe, expect, it } from "vitest"
import {
  bnbAddressOf,
  makeBnbWallet,
  packBnbCredential,
  verifyBnbWallet,
} from "./wallet"

// Public test scalar, never a funded wallet.
const secret = `0x${"0".repeat(63)}1`
const address = "0x7E5F4552091A69125d5DfCb7b8C2659029395Bdf"

describe("BNB Chain wallets", () => {
  it("derives the known address and normalizes exported keys", () => {
    expect(bnbAddressOf(secret)).toBe(address)
    expect(packBnbCredential({ secret: ` ${secret.slice(2)} ` })).toBe(secret)
    expect(packBnbCredential({ agentKey: secret })).toBe(secret)
  })
  it.each(["bad", "0x1234", `0x${"0".repeat(64)}`, `0x${"f".repeat(64)}`])(
    "refuses an invalid private key without echoing it",
    (key) => {
      expect(bnbAddressOf(key)).toBeNull()
      expect(() => packBnbCredential({ secret: key })).toThrow(
        /^KEY_NOT_APPROVED:/
      )
    }
  )
  it("refuses missing keys", () => {
    expect(() => packBnbCredential({})).toThrow("KEY_SECRET_REQUIRED")
  })
  it("matches address casing and refuses mismatches and practice networks", async () => {
    await expect(
      verifyBnbWallet("mainnet", address.toLowerCase(), secret)
    ).resolves.toEqual({ validUntil: null })
    await expect(
      verifyBnbWallet("mainnet", `0x${"0".repeat(40)}`, secret)
    ).rejects.toThrow(`This key opens ${address}`)
    await expect(verifyBnbWallet("testnet", address, secret)).rejects.toThrow(
      "mainnet only"
    )
    await expect(verifyBnbWallet("mainnet", address, "bad")).rejects.toThrow(
      "LIVE_WALLET_KEY"
    )
  })
  it("makes distinct wallets whose keys prove their addresses", async () => {
    const first = makeBnbWallet()
    const second = makeBnbWallet()
    expect(first.address).not.toBe(second.address)
    expect(first.address).toMatch(/^0x[0-9a-fA-F]{40}$/)
    await expect(
      verifyBnbWallet("mainnet", first.address, packBnbCredential(first))
    ).resolves.toEqual({ validUntil: null })
  })
})
