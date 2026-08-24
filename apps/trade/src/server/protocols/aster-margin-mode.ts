import { and, eq } from "drizzle-orm"

import type {
  AsterMarginMode,
  AsterMarginModeSetting,
} from "@/lib/trade/aster-margin-mode"
import type { OrderAuth } from "@/lib/protocols/contracts"
import {
  changeAsterAccountMarginMode,
  readAsterAccountMarginMode,
} from "@/server/protocols/aster/orders"
import { assertRealMoneyAllowed } from "@/server/protocols/real-money"
import { db } from "@/server/db"
import { credentialFor } from "@/server/trade/wallet-auth"
import { tradeWallets } from "@/server/trade/schema"

type ConnectedAsterWallet = typeof tradeWallets.$inferSelect

function orderAuth(row: ConnectedAsterWallet): OrderAuth {
  const agentKey = credentialFor(row)
  if (!row.address || !agentKey) throw new Error("LIVE_WALLET_KEY")
  return {
    accountAddress: row.address,
    agentKey,
    allocateNonce: async () => Date.now(),
  }
}

async function ownedAsterWallet(
  userId: string,
  walletId: string
): Promise<ConnectedAsterWallet> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId)))
    .limit(1)
  const row = rows[0]
  if (
    !row ||
    row.kind !== "live" ||
    row.protocol !== "aster" ||
    row.network !== "mainnet"
  ) {
    throw new Error("LIVE_WALLET_NOT_FOUND")
  }
  return row
}

export async function loadAsterMarginModeSettings(
  userId: string
): Promise<AsterMarginModeSetting[]> {
  const rows = await db
    .select()
    .from(tradeWallets)
    .where(
      and(
        eq(tradeWallets.userId, userId),
        eq(tradeWallets.kind, "live"),
        eq(tradeWallets.status, "active"),
        eq(tradeWallets.protocol, "aster"),
        eq(tradeWallets.network, "mainnet")
      )
    )

  return Promise.all(
    rows.map(async (row) => {
      const mode = await readAsterAccountMarginMode(
        row.network,
        orderAuth(row),
        true
      )
      if (mode !== row.asterMarginMode) {
        await db
          .update(tradeWallets)
          .set({ asterMarginMode: mode, updatedAt: new Date() })
          .where(
            and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, row.id))
          )
      }
      return { walletId: row.id, label: row.label, mode }
    })
  )
}

/**
 * The last Aster mode the app confirmed, for first paint.
 *
 * Reading the exchange can take long enough to hold the whole Settings page
 * open. The saved value draws the row immediately, then
 * `loadAsterMarginModeSettings` checks Aster in the background and corrects it
 * if the account changed somewhere else.
 */
export async function loadRememberedAsterMarginModeSettings(
  userId: string
): Promise<AsterMarginModeSetting[]> {
  const rows = await db
    .select({
      walletId: tradeWallets.id,
      label: tradeWallets.label,
      mode: tradeWallets.asterMarginMode,
    })
    .from(tradeWallets)
    .where(
      and(
        eq(tradeWallets.userId, userId),
        eq(tradeWallets.kind, "live"),
        eq(tradeWallets.status, "active"),
        eq(tradeWallets.protocol, "aster"),
        eq(tradeWallets.network, "mainnet")
      )
    )

  return rows
}

export async function saveAsterMarginModeSetting(
  userId: string,
  walletId: string,
  mode: AsterMarginMode
): Promise<AsterMarginModeSetting> {
  const row = await ownedAsterWallet(userId, walletId)
  if (row.status !== "active") throw new Error("WALLET_INACTIVE")
  await assertRealMoneyAllowed(row.network)
  const auth = orderAuth(row)
  await changeAsterAccountMarginMode(row.network, auth, mode, true)
  const verified = await readAsterAccountMarginMode(row.network, auth, true)
  if (verified !== mode) throw new Error("LIVE_MARGIN_MODE")
  await db
    .update(tradeWallets)
    .set({ asterMarginMode: mode, updatedAt: new Date() })
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId)))
  return { walletId, label: row.label, mode }
}
