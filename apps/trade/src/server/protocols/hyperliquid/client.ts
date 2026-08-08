import { InfoClient, HttpTransport } from "@nktkas/hyperliquid"

import type { NetworkId } from "@/lib/protocols/contracts"

/**
 * One read-only client per network, shared by every fetch in this folder and
 * reused across requests like any other app-wide handle. The SDK's transport
 * keeps no session state worth resetting.
 */
const clients = new Map<NetworkId, InfoClient>()

export function infoClient(network: NetworkId): InfoClient {
  let existing = clients.get(network)
  if (!existing) {
    existing = new InfoClient({
      transport: new HttpTransport({ isTestnet: network === "testnet" }),
    })
    clients.set(network, existing)
  }
  return existing
}
