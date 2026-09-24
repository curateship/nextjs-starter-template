import { generatePrivateKey, privateKeyToAccount } from "viem/accounts"

import type { NetworkId } from "@/lib/protocols/contracts"

function privateKey(pasted: string): `0x${string}` | null {
  const value = pasted.trim().replace(/^0x/i, "")
  if (!/^[0-9a-fA-F]{64}$/.test(value)) return null
  const key = `0x${value.toLowerCase()}` as const
  try {
    privateKeyToAccount(key)
    return key
  } catch {
    return null
  }
}

export function evmAddressOf(secret: string): string | null {
  const key = privateKey(secret)
  return key ? privateKeyToAccount(key).address : null
}

export function makeEvmWallet(): { address: string; secret: string } {
  const secret = generatePrivateKey()
  return { address: privateKeyToAccount(secret).address, secret }
}

/**
 * One Ethereum-shaped chain's wallet: the key that holds the coins, checked
 * by arithmetic against the address it opens. No network request is made.
 * `chain` is the printed name the refusals use, such as the one on the Add
 * wallet window.
 */
export function evmWallet(chain: string) {
  function pack(input: {
    address?: string
    agentKey?: string
    secret?: string
  }): string {
    const pasted = (input.secret ?? input.agentKey ?? "").trim()
    if (!pasted) throw new Error("KEY_SECRET_REQUIRED")
    const key = privateKey(pasted)
    if (!key)
      throw new Error(
        `KEY_NOT_APPROVED:Enter a valid ${chain} private key: 64 hexadecimal characters, optionally starting with 0x.`
      )
    return key
  }

  async function verify(
    network: NetworkId,
    accountAddress: string,
    blob: string
  ): Promise<{ validUntil: null }> {
    if (network !== "mainnet")
      throw new Error(`KEY_NOT_APPROVED:${chain} wallets support mainnet only.`)
    const derived = evmAddressOf(blob)
    if (!derived) throw new Error("LIVE_WALLET_KEY")
    if (derived.toLowerCase() !== accountAddress.trim().toLowerCase()) {
      throw new Error(
        `KEY_NOT_APPROVED:The address and private key do not belong together. This key opens ${derived}. Check the wallet address or paste that wallet's own private key.`
      )
    }
    return { validUntil: null }
  }

  return { pack, verify }
}
