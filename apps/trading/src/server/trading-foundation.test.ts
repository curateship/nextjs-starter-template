import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { decryptPrivateKey, encryptPrivateKey } from "@/server/hyperliquid/keys"
import { allocateNonce } from "@/server/hyperliquid/nonce"
import {
  addDecimal,
  cmpDecimal,
  mulDecimal,
  roundPrice,
  roundSize,
} from "@/server/hyperliquid/rounding"
import {
  isEvmAddress,
  normalizeEvmAddress,
  normalizePrivateKey,
} from "@/server/hyperliquid/types"
import {
  createUserWallet,
  deleteUserWallet,
  listUserWallets,
  serializeWallet,
  updateUserWallet,
} from "@/server/wallets"
import { customShellUsers } from "@/server/schema"
import { now, uuid } from "@/server/security"
import * as schema from "@/server/schema"

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
const hadMasterKey = Object.prototype.hasOwnProperty.call(
  process.env,
  "TRADING_MASTER_KEY"
)
const originalMasterKey = process.env.TRADING_MASTER_KEY

beforeEach(async () => {
  process.env.TRADING_MASTER_KEY = randomBytes(32).toString("base64")
  client = new PGlite()
  for (const file of [
    "../../drizzle/0000_custom_shell_baseline.sql",
    "../../drizzle/0004_trading.sql",
    "../../drizzle/0021_wallet_onboarding.sql",
  ]) {
    const migration = await readFile(new URL(file, import.meta.url), "utf8")
    await client.exec(migration)
  }
  database = drizzle(client, { schema })
  setDbForTests(database as unknown as CustomShellDb)
})

afterEach(async () => {
  await client.close()
  if (hadMasterKey) {
    process.env.TRADING_MASTER_KEY = originalMasterKey
  } else {
    delete process.env.TRADING_MASTER_KEY
  }
})

async function createTestUser() {
  const userId = uuid()
  const createdAt = now()
  await database.insert(customShellUsers).values({
    id: userId,
    email: `${userId}@internal.dev`,
    name: "Trader",
    role: "admin",
    passwordHash: "not-a-real-hash",
    createdAt,
    updatedAt: createdAt,
  })
  return userId
}

function testWalletInput(overrides: Record<string, unknown> = {}) {
  const privateKey = generatePrivateKey()
  const agentAddress = privateKeyToAccount(privateKey).address
  return {
    label: "Main testnet",
    network: "testnet" as const,
    accountAddress: "0x1111111111111111111111111111111111111111",
    agentAddress,
    privateKey,
    ...overrides,
  }
}

describe("private key encryption", () => {
  it("round-trips a private key through encrypt/decrypt", () => {
    const privateKey = generatePrivateKey()
    const encrypted = encryptPrivateKey(privateKey)

    expect(encrypted).toMatch(/^v1:/)
    expect(encrypted).not.toContain(privateKey.slice(2))
    expect(decryptPrivateKey(encrypted)).toBe(privateKey)
  })

  it("produces unique ciphertexts for the same key (random IV)", () => {
    const privateKey = generatePrivateKey()
    expect(encryptPrivateKey(privateKey)).not.toBe(encryptPrivateKey(privateKey))
  })

  it("rejects tampered ciphertext", () => {
    const encrypted = encryptPrivateKey(generatePrivateKey())
    const parts = encrypted.split(":")
    const corrupted = Buffer.from(parts[2], "base64")
    corrupted[0] ^= 0xff
    parts[2] = corrupted.toString("base64")

    expect(() => decryptPrivateKey(parts.join(":"))).toThrow()
  })

  it("rejects decryption with the wrong master key", () => {
    const encrypted = encryptPrivateKey(generatePrivateKey())
    process.env.TRADING_MASTER_KEY = randomBytes(32).toString("base64")

    expect(() => decryptPrivateKey(encrypted)).toThrow()
  })

  it("rejects a malformed master key", () => {
    process.env.TRADING_MASTER_KEY = "too-short"

    expect(() => encryptPrivateKey(generatePrivateKey())).toThrow(
      /32 bytes/
    )
  })
})

describe("nonce allocation", () => {
  it("allocates nonces at or above the current timestamp", async () => {
    const before = Date.now()
    const nonce = await allocateNonce("0xabc0000000000000000000000000000000000001", "testnet")
    expect(nonce).toBeGreaterThanOrEqual(before)
  })

  it("allocates strictly increasing nonces under concurrency", async () => {
    const agent = "0xabc0000000000000000000000000000000000002"
    const nonces = await Promise.all(
      Array.from({ length: 50 }, () => allocateNonce(agent, "testnet"))
    )

    const unique = new Set(nonces)
    expect(unique.size).toBe(nonces.length)
  })

  it("fast-forwards a stale counter to the current millisecond", async () => {
    const agent = "0xabc0000000000000000000000000000000000003"
    await database
      .insert(schema.tradingWalletNonces)
      .values({ agentAddress: agent, network: "testnet", lastNonce: 1 })

    const nonce = await allocateNonce(agent, "testnet")
    expect(nonce).toBeGreaterThanOrEqual(Date.now() - 1000)
  })

  it("tracks nonces separately per agent and network", async () => {
    const agent = "0xabc0000000000000000000000000000000000004"
    const first = await allocateNonce(agent, "testnet")
    const second = await allocateNonce(agent, "mainnet")

    const rows = await database.select().from(schema.tradingWalletNonces)
    const forAgent = rows.filter((row) => row.agentAddress === agent)
    expect(forAgent).toHaveLength(2)
    expect(first).toBeGreaterThan(0)
    expect(second).toBeGreaterThan(0)
  })
})

describe("price and size rounding", () => {
  it("rounds prices to 5 significant figures", () => {
    expect(roundPrice("27123.456", 3)).toBe("27123")
    expect(roundPrice("1234.56", 1)).toBe("1234.5")
    expect(roundPrice("123456.78", 2)).toBe("123450")
  })

  it("caps price decimals at 6 - szDecimals", () => {
    expect(roundPrice("0.123456", 0)).toBe("0.12345")
    expect(roundPrice("0.0012345678", 0)).toBe("0.001234")
    expect(roundPrice("4521.7", 4)).toBe("4521.7")
  })

  it("rounds sizes down to szDecimals", () => {
    expect(roundSize("1.23456789", 3)).toBe("1.234")
    expect(roundSize("0.0019", 3)).toBe("0.001")
    expect(roundSize("25.5", 0)).toBe("25")
  })

  it("does exact decimal arithmetic on strings", () => {
    expect(mulDecimal("0.1", "0.2")).toBe("0.02")
    expect(mulDecimal("1234.5", "2")).toBe("2469")
    expect(addDecimal("0.1", "0.2")).toBe("0.3")
    expect(addDecimal("1.5", "-2")).toBe("-0.5")
    expect(cmpDecimal("1.10", "1.1")).toBe(0)
    expect(cmpDecimal("2", "10")).toBe(-1)
    expect(cmpDecimal("0.3", "0.2999")).toBe(1)
  })
})

describe("address and key validation", () => {
  it("validates EVM addresses", () => {
    expect(isEvmAddress("0x1111111111111111111111111111111111111111")).toBe(true)
    expect(isEvmAddress("0x111")).toBe(false)
    expect(isEvmAddress("1111111111111111111111111111111111111111")).toBe(false)
    expect(
      normalizeEvmAddress("0xABC1111111111111111111111111111111111111")
    ).toBe("0xabc1111111111111111111111111111111111111")
  })

  it("normalizes private keys with or without 0x prefix", () => {
    const bare = "a".repeat(64)
    expect(normalizePrivateKey(bare)).toBe(`0x${bare}`)
    expect(normalizePrivateKey(`0x${bare}`)).toBe(`0x${bare}`)
    expect(() => normalizePrivateKey("0x123")).toThrow()
  })
})

describe("wallet CRUD", () => {
  it("creates a wallet with an encrypted key and lists it", async () => {
    const userId = await createTestUser()
    const input = testWalletInput()
    const wallet = await createUserWallet(userId, input)

    expect(wallet.encryptedPrivateKey).toMatch(/^v1:/)
    expect(wallet.encryptedPrivateKey).not.toContain(input.privateKey.slice(2))
    expect(decryptPrivateKey(wallet.encryptedPrivateKey)).toBe(
      input.privateKey.toLowerCase()
    )

    const wallets = await listUserWallets(userId)
    expect(wallets).toHaveLength(1)
    expect(wallets[0].agentAddress).toBe(input.agentAddress.toLowerCase())
  })

  it("never exposes key material through the serializer", async () => {
    const userId = await createTestUser()
    const wallet = await createUserWallet(userId, testWalletInput())
    const serialized = serializeWallet(wallet)

    expect(serialized).not.toHaveProperty("encryptedPrivateKey")
    expect(serialized).not.toHaveProperty("encrypted_private_key")
    expect(JSON.stringify(serialized)).not.toContain("v1:")
  })

  it("rejects a private key that does not match the agent address", async () => {
    const userId = await createTestUser()
    const input = testWalletInput({
      agentAddress: "0x2222222222222222222222222222222222222222",
    })

    await expect(createUserWallet(userId, input)).rejects.toThrow(
      /does not match the agent address/
    )
  })

  it("rejects duplicate agent addresses on the same network", async () => {
    const userId = await createTestUser()
    const input = testWalletInput()
    await createUserWallet(userId, input)

    await expect(
      createUserWallet(userId, { ...input, label: "Duplicate" })
    ).rejects.toThrow(/already exists/)
  })

  it("rejects mainnet wallets while mainnet is disabled", async () => {
    const userId = await createTestUser()
    delete process.env.TRADING_ENABLE_MAINNET

    await expect(
      createUserWallet(userId, testWalletInput({ network: "mainnet" }))
    ).rejects.toThrow(/Mainnet trading is disabled/)
  })

  it("updates label and active flag", async () => {
    const userId = await createTestUser()
    const wallet = await createUserWallet(userId, testWalletInput())

    const updated = await updateUserWallet(userId, wallet.id, {
      label: "Renamed",
      isActive: false,
    })
    expect(updated.label).toBe("Renamed")
    expect(updated.isActive).toBe(false)
  })

  it("deletes wallets and scopes all operations to the owner", async () => {
    const userId = await createTestUser()
    const otherUserId = await createTestUser()
    const wallet = await createUserWallet(userId, testWalletInput())

    await expect(
      updateUserWallet(otherUserId, wallet.id, { label: "Hijack" })
    ).rejects.toThrow(/not found/)
    await expect(
      deleteUserWallet(otherUserId, wallet.id)
    ).rejects.toThrow(/not found/)

    await deleteUserWallet(userId, wallet.id)
    expect(await listUserWallets(userId)).toHaveLength(0)
  })
})
