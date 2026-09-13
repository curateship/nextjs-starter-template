import type { NetworkId } from "@/lib/protocols/contracts"
import type { KeyPermission } from "@/lib/trade/wallets"
import { agentAddress } from "./signing"

/** Approved agents cannot withdraw. Detect a legacy account key locally too. */
export async function readHyperliquidKeyPermission(
  _network: NetworkId,
  address: string,
  credential: () => string | null
): Promise<KeyPermission> {
  const key = credential()
  if (!key) return "unknown"
  return agentAddress(key) === address.toLowerCase()
    ? "can-withdraw"
    : "trade-only"
}
