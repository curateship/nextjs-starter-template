import { Keypair } from "@solana/web3.js"
import { describe, expect, it } from "vitest"

import { protocolDescription } from "@/lib/api/trade/protocols"
import { encodeBase58 } from "@/server/protocols/solana/base58"
import {
  makeSolanaWallet,
  packSolanaCredential,
  parseSolanaCredential,
  solanaAddressOf,
  verifySolanaWallet,
} from "@/server/protocols/solana/wallet"

/**
 * The wallet the app signs with, proved by arithmetic.
 *
 * A Solana address is nothing but the public half of its keypair, so a
 * pasted address and secret are checked against each other without asking
 * the chain anything. These tests make real keypairs and check that the
 * derivation, the refusals and the stored form all agree.
 */

// The rule the Add wallet window draws and the wallet store validates
// against, read from the one place it is written rather than copied here.
const ADDRESS_SHAPE = new RegExp(
  protocolDescription("solana").credentialForm!.addressPattern
)

/** One keypair, in the two forms a wallet app exports and the address. */
function sample() {
  const keypair = Keypair.generate()
  return {
    address: keypair.publicKey.toBase58(),
    /** Phantom's form: the 64-byte secret key. */
    secret64: encodeBase58(keypair.secretKey),
    /** The 32-byte seed some apps export instead. */
    seed32: encodeBase58(keypair.secretKey.slice(0, 32)),
  }
}

describe("deriving the address", () => {
  it("finds the address from a 64-byte secret key", () => {
    const { address, secret64 } = sample()
    expect(solanaAddressOf(secret64)).toBe(address)
    expect(address).toMatch(ADDRESS_SHAPE)
  })

  it("finds the same address from the 32-byte seed", () => {
    const { address, seed32 } = sample()
    expect(solanaAddressOf(seed32)).toBe(address)
  })

  it("answers null for anything that is not a key", () => {
    expect(solanaAddressOf("")).toBeNull()
    expect(solanaAddressOf("not a key")).toBeNull()
    // Base58 but the wrong length.
    expect(solanaAddressOf(encodeBase58(new Uint8Array(40)))).toBeNull()
    // Sixty-four bytes whose public half does not belong to the seed: not a
    // key any wallet made, and the library refuses it.
    const mismatched = new Uint8Array(64)
    mismatched.set(Keypair.generate().secretKey.slice(0, 32), 0)
    mismatched.set(Keypair.generate().publicKey.toBytes(), 32)
    expect(solanaAddressOf(encodeBase58(mismatched))).toBeNull()
  })
})

describe("packing the credential", () => {
  it("stores the 64-byte form whichever form was pasted", () => {
    const { secret64, seed32 } = sample()
    expect(packSolanaCredential({ secret: ` ${secret64} ` })).toBe(secret64)
    expect(packSolanaCredential({ secret: seed32 })).toBe(secret64)
    // The dialog sends the paste as `secret`; `agentKey` is read too so the
    // flag and the packer can never disagree.
    expect(packSolanaCredential({ agentKey: secret64 })).toBe(secret64)
  })

  it("reads the stored blob back to the same keypair", () => {
    const { address, secret64 } = sample()
    const keypair = parseSolanaCredential(packSolanaCredential({ secret: secret64 }))
    expect(keypair.publicKey.toBase58()).toBe(address)
    expect(() => parseSolanaCredential("garbage")).toThrow("LIVE_WALLET_KEY")
  })

  it("refuses an empty paste with the shared code", () => {
    expect(() => packSolanaCredential({ secret: "  " })).toThrow(
      "KEY_SECRET_REQUIRED"
    )
  })

  it("refuses a key of the wrong shape in words the window can show", () => {
    // A Solana CLI file is the same key as a list of numbers; it is not
    // accepted, and the sentence says so rather than "does not read right".
    const listOfNumbers = `[${Array.from(Keypair.generate().secretKey).join(",")}]`
    try {
      packSolanaCredential({ secret: listOfNumbers })
      throw new Error("should have refused")
    } catch (error) {
      const message = (error as Error).message
      expect(message.startsWith("KEY_NOT_APPROVED:")).toBe(true)
      expect(message).toContain("square brackets")
      expect(message).toContain("Phantom")
    }
    expect(() => packSolanaCredential({ secret: "0xdeadbeef" })).toThrow(
      /^KEY_NOT_APPROVED:/
    )
  })
})

describe("proving the pair", () => {
  it("accepts a secret that opens the pasted address, with no expiry", async () => {
    const { address, secret64 } = sample()
    await expect(
      verifySolanaWallet("mainnet", ` ${address} `, secret64)
    ).resolves.toEqual({ validUntil: null })
  })

  it("refuses a mismatched pair and says which field to check", async () => {
    const mine = sample()
    const other = sample()
    try {
      await verifySolanaWallet("mainnet", other.address, mine.secret64)
      throw new Error("should have refused")
    } catch (error) {
      const message = (error as Error).message
      expect(message.startsWith("KEY_NOT_APPROVED:")).toBe(true)
      // Both addresses are named, shortened, so the person can see which
      // one they meant; the whole right address is there to paste.
      expect(message).toContain(mine.address.slice(0, 4))
      expect(message).toContain(other.address.slice(0, 4))
      expect(message).toContain(mine.address)
      expect(message).toContain("If the address is the wallet you meant")
      expect(message).toContain("If the key is the one you meant")
      // A refusal never repeats the secret back.
      expect(message).not.toContain(mine.secret64.slice(0, 12))
    }
  })
})

describe("making a wallet", () => {
  it("makes a keypair whose secret opens its own address", () => {
    const made = makeSolanaWallet()
    expect(made.address).toMatch(ADDRESS_SHAPE)
    expect(solanaAddressOf(made.secret)).toBe(made.address)
    // The made secret goes through the same packer as a pasted one.
    expect(packSolanaCredential({ secret: made.secret })).toBe(made.secret)
  })

  it("never makes the same wallet twice", () => {
    expect(makeSolanaWallet().address).not.toBe(makeSolanaWallet().address)
  })
})
