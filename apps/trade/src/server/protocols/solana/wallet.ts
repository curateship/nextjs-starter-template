import { Keypair } from "@solana/web3.js"

import type { NetworkId } from "@/lib/protocols/contracts"
import { decodeBase58, encodeBase58 } from "@/server/protocols/solana/base58"

/**
 * The wallet the app signs with on Solana.
 *
 * **This key holds the coins.** Hyperliquid and Aster let a throwaway key
 * act for an account, so the app never holds the key that can move money
 * out. Solana has no such idea: whoever holds the secret key owns the
 * wallet. So the rule Tyler is told in the Add wallet window is the whole
 * safety model — keep in this wallet only what you mean to trade.
 *
 * Because the secret alone determines the address, a pasted pair is proved
 * by arithmetic rather than by asking the chain: derive the address from
 * the secret and compare. No node is needed, nothing is sent, and a wrong
 * pair is refused with a sentence saying which half to check.
 */

const SECRET_SHAPE =
  "A Solana secret key is the base58 string a wallet app such as Phantom exports — about 88 characters of letters and numbers, no spaces or brackets. A list of numbers in square brackets is the same key written another way and is not accepted here."

/**
 * A keypair from whatever was pasted, or null.
 *
 * Wallet apps export the secret in two lengths: 64 bytes (the seed and the
 * public key together, which is what Phantom and Solflare hand out) or the
 * 32-byte seed alone. Both are accepted; anything else is not a key.
 */
function keypairFromSecret(pasted: string): Keypair | null {
  const bytes = decodeBase58(pasted)
  if (bytes === null) return null
  try {
    if (bytes.length === 64) return Keypair.fromSecretKey(bytes)
    if (bytes.length === 32) return Keypair.fromSeed(bytes)
  } catch {
    // A 64-byte paste whose public half does not match its seed is not a
    // key anyone's wallet made; the library refuses it and so does this.
    return null
  }
  return null
}

/** "7xKX…Ab3q": enough of an address to tell two apart, never the whole. */
function short(address: string): string {
  return `${address.slice(0, 4)}…${address.slice(-4)}`
}

/**
 * The credential blob: the secret key as base58 in its 64-byte form, however
 * it was pasted. Opaque outside this folder, as `OrderAuth.agentKey` requires.
 *
 * The pasted key arrives as `secret` because `secretIsAgentKey` is false —
 * the same lesson Lighter's packer learnt the hard way — and `agentKey` is
 * read too so the two can never disagree.
 */
export function packSolanaCredential(input: {
  address?: string
  agentKey?: string
  secret?: string
}): string {
  const pasted = (input.secret ?? input.agentKey ?? "").trim()
  if (!pasted) throw new Error("KEY_SECRET_REQUIRED")
  const keypair = keypairFromSecret(pasted)
  if (keypair === null) throw new Error(`KEY_NOT_APPROVED:${SECRET_SHAPE}`)
  return encodeBase58(keypair.secretKey)
}

/**
 * Reads back what `packSolanaCredential` stored. A blob that no longer reads
 * is a stored credential problem, refused with the code the trading paths
 * already know.
 */
export function parseSolanaCredential(blob: string): Keypair {
  const keypair = keypairFromSecret(blob.trim())
  if (keypair === null) throw new Error("LIVE_WALLET_KEY")
  return keypair
}

/** The public address a secret key opens, or null when it is not a key. */
export function solanaAddressOf(secret: string): string | null {
  return keypairFromSecret(secret.trim())?.publicKey.toBase58() ?? null
}

/**
 * Proves a pasted pair before anything is stored: the address the secret
 * opens must be the address in the first field. Nothing is asked of the
 * chain, so this cannot be rationed and answers at once.
 *
 * Answers no expiry: a Solana key does not run out.
 */
export async function verifySolanaWallet(
  _network: NetworkId,
  accountAddress: string,
  blob: string
): Promise<{ validUntil: null }> {
  const derived = parseSolanaCredential(blob).publicKey.toBase58()
  const wanted = accountAddress.trim()
  if (derived !== wanted) {
    // Only `KEY_NOT_APPROVED:` carries its sentence through to the window.
    // The sentence names the address the key really opens — public, and
    // the one fact that tells the person which field is wrong.
    throw new Error(
      `KEY_NOT_APPROVED:The address and the secret key do not belong together. The key you pasted opens ${short(derived)}, not ${short(wanted)}. If the address is the wallet you meant, paste that wallet's own secret key. If the key is the one you meant, change the address to ${derived}.`
    )
  }
  return { validUntil: null }
}

/**
 * A fresh wallet, made here on the server. The secret goes straight into
 * the store's encrypt step through `pack`; only the address ever reaches
 * the browser.
 */
export function makeSolanaWallet(): { address: string; secret: string } {
  const keypair = Keypair.generate()
  return {
    address: keypair.publicKey.toBase58(),
    secret: encodeBase58(keypair.secretKey),
  }
}
