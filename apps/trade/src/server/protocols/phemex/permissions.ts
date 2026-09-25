import type { KeyPermission } from "@/lib/trade/wallets"

/** The documented key lookup does not expose withdrawal permissions. */
export async function readPhemexKeyPermission(): Promise<KeyPermission> {
  return "unknown"
}
