import { and, asc, eq } from "drizzle-orm"
import { privateKeyToAccount } from "viem/accounts"

import { db, type CustomShellDb } from "@/server/db"
import { CURRENT_KEY_VERSION, encryptPrivateKey } from "@/server/hyperliquid/keys"
import { assertNetworkEnabled } from "@/server/hyperliquid/transport"
import {
  normalizeEvmAddress,
  normalizePrivateKey,
  type TradingNetwork,
} from "@/server/hyperliquid/types"
import { tradingWallets, type TradingWallet } from "@/server/schema"
import { now, uuid } from "@/server/util"

export type CreateWalletInput = {
  label: string
  network: TradingNetwork
  accountAddress: string
  agentAddress: string
  vaultAddress?: string | null
  privateKey: string
}

export type UpdateWalletInput = {
  label?: string
  isActive?: boolean
}

export async function listUserWallets(
  userId: string,
  database: CustomShellDb = db
) {
  return database
    .select()
    .from(tradingWallets)
    .where(eq(tradingWallets.userId, userId))
    .orderBy(asc(tradingWallets.createdAt))
}

export async function createUserWallet(
  userId: string,
  input: CreateWalletInput,
  database: CustomShellDb = db
) {
  const label = input.label.trim()
  if (!label) {
    throw new Error("Wallet label is required")
  }

  assertNetworkEnabled(input.network)

  const accountAddress = normalizeEvmAddress(input.accountAddress)
  const agentAddress = normalizeEvmAddress(input.agentAddress)
  const vaultAddress = input.vaultAddress?.trim()
    ? normalizeEvmAddress(input.vaultAddress.trim())
    : null
  const privateKey = normalizePrivateKey(input.privateKey.trim())

  const derivedAddress = privateKeyToAccount(privateKey).address.toLowerCase()
  if (derivedAddress !== agentAddress) {
    throw new Error(
      "Private key does not match the agent address. Double-check the API wallet you exported from Hyperliquid."
    )
  }

  const createdAt = now()
  const [wallet] = await database
    .insert(tradingWallets)
    .values({
      id: uuid(),
      userId,
      label: label.slice(0, 255),
      network: input.network,
      accountAddress,
      agentAddress,
      vaultAddress,
      encryptedPrivateKey: encryptPrivateKey(privateKey),
      keyVersion: CURRENT_KEY_VERSION,
      isActive: true,
      status: "active",
      createdVia: "imported",
      createdAt,
      updatedAt: createdAt,
    })
    .returning()
    .catch((error: unknown) => {
      if (isUniqueViolation(error)) {
        throw new Error(
          "A wallet with this agent address already exists on this network."
        )
      }
      throw error
    })

  if (!wallet) {
    throw new Error("Wallet was not created")
  }
  return wallet
}

export async function updateUserWallet(
  userId: string,
  walletId: string,
  input: UpdateWalletInput,
  database: CustomShellDb = db
) {
  const changes: Partial<typeof tradingWallets.$inferInsert> = {
    updatedAt: now(),
  }
  if (input.label !== undefined) {
    const label = input.label.trim()
    if (!label) {
      throw new Error("Wallet label is required")
    }
    changes.label = label.slice(0, 255)
  }
  if (input.isActive !== undefined) {
    if (input.isActive) {
      const existing = await findUserWallet(userId, walletId, database)
      if (existing?.status === "pending") {
        throw new Error(
          "This wallet is still awaiting approval on Hyperliquid. Finish the Connect Wallet flow first."
        )
      }
    }
    changes.isActive = input.isActive
  }

  const [wallet] = await database
    .update(tradingWallets)
    .set(changes)
    .where(
      and(eq(tradingWallets.id, walletId), eq(tradingWallets.userId, userId))
    )
    .returning()

  if (!wallet) {
    throw new Error("Wallet not found")
  }
  return wallet
}

export async function deleteUserWallet(
  userId: string,
  walletId: string,
  database: CustomShellDb = db
) {
  const [deleted] = await database
    .delete(tradingWallets)
    .where(
      and(eq(tradingWallets.id, walletId), eq(tradingWallets.userId, userId))
    )
    .returning({ id: tradingWallets.id })
    .catch((error: unknown) => {
      if (isForeignKeyViolation(error)) {
        throw new Error(
          "This wallet is used by one or more bots. Delete those bots first."
        )
      }
      throw error
    })

  if (!deleted) {
    throw new Error("Wallet not found")
  }
  return { walletId: deleted.id }
}

export async function findUserWallet(
  userId: string,
  walletId: string,
  database: CustomShellDb = db
): Promise<TradingWallet | null> {
  const [wallet] = await database
    .select()
    .from(tradingWallets)
    .where(
      and(eq(tradingWallets.id, walletId), eq(tradingWallets.userId, userId))
    )
    .limit(1)
  return wallet ?? null
}

/**
 * The only wallet shape allowed to cross the server boundary. The encrypted
 * private key must never be serialized — this allowlist is the enforcement
 * point, mirroring serializeWorkspace.
 */
export function serializeWallet(row: TradingWallet) {
  return {
    id: row.id,
    label: row.label,
    network: row.network as TradingNetwork,
    account_address: row.accountAddress,
    agent_address: row.agentAddress,
    vault_address: row.vaultAddress,
    is_active: row.isActive,
    status: row.status as "pending" | "active",
    created_via: row.createdVia as "imported" | "generated",
    agent_name: row.agentName,
    approval_valid_until: row.approvalValidUntil?.toISOString() ?? null,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString(),
  }
}

/**
 * serializeWallet plus the live perps equity of each wallet's account on the
 * exchange (null when the lookup fails). Lookups run in parallel.
 */
export async function serializeWalletsWithEquity(rows: TradingWallet[]) {
  const { getInfoClient } = await import("@/server/hyperliquid/info")
  return Promise.all(
    rows.map(async (row) => {
      const address = (row.vaultAddress ?? row.accountAddress) as `0x${string}`
      const equity = await getInfoClient(row.network as TradingNetwork)
        .clearinghouseState({ user: address })
        .then((state) => Number(state.marginSummary.accountValue))
        .catch(() => null)
      return { ...serializeWallet(row), equity }
    })
  )
}

function isUniqueViolation(error: unknown) {
  return isPgErrorWithCode(error, "23505")
}

function isForeignKeyViolation(error: unknown) {
  return isPgErrorWithCode(error, "23503")
}

function isPgErrorWithCode(error: unknown, code: string): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current; depth += 1) {
    if (
      typeof current === "object" &&
      "code" in current &&
      (current as { code?: string }).code === code
    ) {
      return true
    }
    current =
      typeof current === "object"
        ? (current as { cause?: unknown }).cause
        : undefined
  }
  return false
}
