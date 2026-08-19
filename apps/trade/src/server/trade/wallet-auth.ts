import { and, eq } from "drizzle-orm"

import { decryptSecret } from "@/server/auth/encryption"
import { db } from "@/server/db"
import { tradeWallets } from "@/server/trade/schema"

/**
 * The one home of "ciphertext in the row → plaintext in a hand".
 *
 * A live wallet's credential is stored only as `encryptSecret` ciphertext in
 * `trade_wallets.agent_key_encrypted`. Everything that needs the plaintext —
 * signing an order, reading an API-key exchange's account — goes through
 * here, so the decrypt is one grep away and the rules around it stay in one
 * place: decrypted per call, never cached, never journalled, never sent to
 * the browser.
 *
 * What the plaintext IS belongs to the wallet's protocol alone: a hex
 * trading key on Hyperliquid, a JSON blob of secret (and passphrase, where
 * the venue wants one) on an API-key exchange. Nothing here looks inside it.
 */
export function credentialFor(row: {
  agentKeyEncrypted: string | null
}): string | null {
  if (!row.agentKeyEncrypted) return null
  return decryptSecret(row.agentKeyEncrypted)
}

/**
 * The same thing for code that only holds the browser-safe wallet shape
 * (`TradeWallet` says `hasKey: true`, never the ciphertext): one scoped read
 * for the ciphertext now, the decrypt deferred until a connector actually
 * asks. Callers that already hold the row use `credentialFor` directly.
 */
export async function walletCredential(
  userId: string,
  walletId: string
): Promise<() => string | null> {
  const rows = await db
    .select({ agentKeyEncrypted: tradeWallets.agentKeyEncrypted })
    .from(tradeWallets)
    .where(and(eq(tradeWallets.userId, userId), eq(tradeWallets.id, walletId)))
    .limit(1)
  const cipher = rows[0]?.agentKeyEncrypted ?? null
  return () => (cipher ? decryptSecret(cipher) : null)
}
