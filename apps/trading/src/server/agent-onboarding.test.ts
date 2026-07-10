import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"

import { PGlite } from "@electric-sql/pglite"
import { drizzle } from "drizzle-orm/pglite"
import { eq } from "drizzle-orm"
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { setDbForTests, type CustomShellDb } from "@/server/db"
import { decryptPrivateKey } from "@/server/hyperliquid/keys"
import {
  beginAgentOnboarding,
  beginAgentRenewal,
  completeAgentOnboarding,
  verifyAgentApproval,
} from "@/server/agent-onboarding"
import { serializeWallet, updateUserWallet } from "@/server/wallets"
import { customShellUsers, tradingAuditLog, tradingWallets } from "@/server/schema"
import { now, uuid } from "@/server/util"
import * as schema from "@/server/schema"

const { exchangeRequestMock, extraAgentsMock } = vi.hoisted(() => ({
  exchangeRequestMock: vi.fn(),
  extraAgentsMock: vi.fn(),
}))

vi.mock("@/server/hyperliquid/transport", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@/server/hyperliquid/transport")>()
  return {
    ...actual,
    createHttpTransport: () => ({ request: exchangeRequestMock }),
  }
})

vi.mock("@/server/hyperliquid/info", () => ({
  getInfoClient: () => ({ extraAgents: extraAgentsMock }),
}))

let client: PGlite
let database: ReturnType<typeof drizzle<typeof schema>>
const hadMasterKey = Object.prototype.hasOwnProperty.call(
  process.env,
  "TRADING_MASTER_KEY"
)
const originalMasterKey = process.env.TRADING_MASTER_KEY

beforeEach(async () => {
  process.env.TRADING_MASTER_KEY = randomBytes(32).toString("base64")
  exchangeRequestMock.mockReset()
  extraAgentsMock.mockReset()
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

async function createUser() {
  const id = uuid()
  await database.insert(customShellUsers).values({
    id,
    email: `${id}@internal.dev`,
    name: "Trader",
    role: "admin",
    passwordHash: "not-a-real-hash",
    createdAt: now(),
    updatedAt: now(),
  })
  return id
}

function makeMaster() {
  const privateKey = generatePrivateKey()
  return { privateKey, account: privateKeyToAccount(privateKey) }
}

const db = () => database as unknown as CustomShellDb

describe("beginAgentOnboarding", () => {
  it("creates an inert pending row whose key derives to the agent address", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.status).toBe("pending")
    expect(row.isActive).toBe(false)
    expect(row.createdVia).toBe("generated")
    expect(row.accountAddress).toBe(master.account.address.toLowerCase())
    expect(row.pendingAction?.signatureChainId).toBe("0x1")

    const derived = privateKeyToAccount(
      decryptPrivateKey(row.encryptedPrivateKey) as `0x${string}`
    ).address.toLowerCase()
    expect(derived).toBe(begun.agentAddress)

    expect(begun.typedData.domain.chainId).toBe(1)
    expect(begun.typedData.message.hyperliquidChain).toBe("Testnet")
    expect(begun.typedData.message.agentAddress).toBe(begun.agentAddress)
    expect(begun.typedData.message.agentName.length).toBeLessThanOrEqual(16)
  })

  it("sweeps stale pending rows on the next begin", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const stale = await beginAgentOnboarding(
      userId,
      {
        label: "Old",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )
    await database
      .update(tradingWallets)
      .set({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000) })
      .where(eq(tradingWallets.id, stale.walletId))

    await beginAgentOnboarding(
      userId,
      {
        label: "New",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const rows = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.userId, userId))
    expect(rows).toHaveLength(1)
    expect(rows[0].label).toBe("New")
  })
})

describe("completeAgentOnboarding", () => {
  it("activates the wallet after a valid master signature", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const signature = await master.account.signTypedData(begun.typedData)
    exchangeRequestMock.mockResolvedValue({
      status: "ok",
      response: { type: "default" },
    })
    const validUntil = Date.now() + 180 * 24 * 60 * 60 * 1000
    extraAgentsMock.mockResolvedValue([
      {
        address: begun.agentAddress,
        name: begun.typedData.message.agentName,
        validUntil,
      },
    ])

    const result = await completeAgentOnboarding(
      userId,
      { walletId: begun.walletId, signature },
      db()
    )

    expect(result.approvalValidUntil).toBe(new Date(validUntil).toISOString())

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.status).toBe("active")
    expect(row.isActive).toBe(true)
    expect(row.pendingAction).toBeNull()

    // The relayed action is exactly what begin staged — nothing substituted.
    const [, body] = exchangeRequestMock.mock.calls[0]
    expect(body.action.type).toBe("approveAgent")
    expect(body.action.agentAddress).toBe(begun.agentAddress)
    expect(body.action.hyperliquidChain).toBe("Testnet")
    expect(body.signature.v === 27 || body.signature.v === 28).toBe(true)

    const audits = await database
      .select()
      .from(tradingAuditLog)
      .where(eq(tradingAuditLog.walletId, begun.walletId))
    expect(audits).toHaveLength(1)
    expect(audits[0].actionType).toBe("agent.approve")
    expect(audits[0].status).toBe("ok")
  })

  it("rejects a signature from the wrong account and stays pending", async () => {
    const userId = await createUser()
    const master = makeMaster()
    const stranger = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const signature = await stranger.account.signTypedData(begun.typedData)
    await expect(
      completeAgentOnboarding(
        userId,
        { walletId: begun.walletId, signature },
        db()
      )
    ).rejects.toThrow(/does not match/)
    expect(exchangeRequestMock).not.toHaveBeenCalled()

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.status).toBe("pending")
    expect(row.isActive).toBe(false)
  })

  it("keeps the row pending when Hyperliquid rejects the approval", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const signature = await master.account.signTypedData(begun.typedData)
    exchangeRequestMock.mockResolvedValue({
      status: "err",
      response: "Extra agent already used.",
    })

    await expect(
      completeAgentOnboarding(
        userId,
        { walletId: begun.walletId, signature },
        db()
      )
    ).rejects.toThrow(/Extra agent already used/)

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.status).toBe("pending")
  })
})

describe("beginAgentRenewal", () => {
  it("stages a fresh approval for the same agent address", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    const renewed = await beginAgentRenewal(
      userId,
      begun.walletId,
      "0xa4b1",
      db()
    )
    expect(renewed.agentAddress).toBe(begun.agentAddress)
    expect(renewed.typedData.domain.chainId).toBe(0xa4b1)
    expect(renewed.typedData.message.nonce).toBeGreaterThanOrEqual(
      begun.typedData.message.nonce
    )
  })
})

describe("verifyAgentApproval", () => {
  it("deactivates a wallet whose approval was revoked", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )
    const signature = await master.account.signTypedData(begun.typedData)
    exchangeRequestMock.mockResolvedValue({ status: "ok", response: {} })
    extraAgentsMock.mockResolvedValue([
      { address: begun.agentAddress, name: "x", validUntil: null },
    ])
    await completeAgentOnboarding(
      userId,
      { walletId: begun.walletId, signature },
      db()
    )

    extraAgentsMock.mockResolvedValue([])
    const result = await verifyAgentApproval(userId, begun.walletId, db())
    expect(result.approved).toBe(false)

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.isActive).toBe(false)
  })

  it("does not deactivate when the extraAgents query fails", async () => {
    const userId = await createUser()
    const master = makeMaster()

    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )
    const signature = await master.account.signTypedData(begun.typedData)
    exchangeRequestMock.mockResolvedValue({ status: "ok", response: {} })
    extraAgentsMock.mockResolvedValue([
      { address: begun.agentAddress, name: "x", validUntil: null },
    ])
    await completeAgentOnboarding(
      userId,
      { walletId: begun.walletId, signature },
      db()
    )

    extraAgentsMock.mockRejectedValue(new Error("network down"))
    const result = await verifyAgentApproval(userId, begun.walletId, db())
    expect(result.approved).toBe(true)

    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))
    expect(row.isActive).toBe(true)
  })
})

describe("wallet safety rails", () => {
  it("serializeWallet never leaks the key or the pending action", async () => {
    const userId = await createUser()
    const master = makeMaster()
    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )
    const [row] = await database
      .select()
      .from(tradingWallets)
      .where(eq(tradingWallets.id, begun.walletId))

    const serialized = serializeWallet(row)
    const json = JSON.stringify(serialized)
    expect(json).not.toContain("encrypted")
    expect(json).not.toContain(row.encryptedPrivateKey)
    expect(Object.keys(serialized)).not.toContain("pending_action")
    expect(serialized.status).toBe("pending")
    expect(serialized.created_via).toBe("generated")
  })

  it("refuses to hand-activate a pending wallet", async () => {
    const userId = await createUser()
    const master = makeMaster()
    const begun = await beginAgentOnboarding(
      userId,
      {
        label: "Main",
        network: "testnet",
        masterAddress: master.account.address,
        chainId: "0x1",
      },
      db()
    )

    await expect(
      updateUserWallet(userId, begun.walletId, { isActive: true }, db())
    ).rejects.toThrow(/awaiting approval/)
  })
})
