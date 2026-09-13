import type { KeyPermission } from "@/lib/trade/wallets"

/** The documented key lookup does not expose withdrawal permissions. */
export async function readLighterKeyPermission(): Promise<KeyPermission> {
  return "unknown"
}
