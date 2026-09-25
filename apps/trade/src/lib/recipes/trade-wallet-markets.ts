import type { AutomationGraph, AutomationNode } from "@/lib/automations/graph"
import { tradeMarketsNode } from "@/lib/recipes/trade-markets"
import {
  parseMarketKey,
  type NetworkId,
  type ProtocolId,
} from "@/lib/protocols/contracts"

type WalletVenue = {
  protocol: string | null
  network: NetworkId | null
}

/**
 * Moves the Markets step to a wallet's venue and drops choices that venue
 * cannot trade. A null answer means the step already agrees with the wallet.
 */
export function marketsStepFollowingWallet(input: {
  graph?: AutomationGraph
  protocol: ProtocolId
  network: NetworkId
  previousWallet: WalletVenue | null
}): { node: AutomationNode; cleared: number } | null {
  const markets = input.graph?.nodes.find(
    (one) => one.kind === tradeMarketsNode.kind
  )
  if (!markets) return null

  const keys = Array.isArray(markets.settings.marketKeys)
    ? markets.settings.marketKeys
    : []
  const savedMarketDisagrees = keys.some((key) => {
    if (typeof key !== "string") return true
    const market = parseMarketKey(key)
    return (
      !market ||
      market.protocol !== input.protocol ||
      market.network !== input.network
    )
  })
  const walletVenueChanged =
    input.previousWallet !== null &&
    (input.previousWallet.protocol !== input.protocol ||
      input.previousWallet.network !== input.network)
  const savedFolderMayDisagree =
    walletVenueChanged && typeof markets.settings.folderId === "string"

  if (
    markets.settings.protocol === input.protocol &&
    !savedFolderMayDisagree &&
    !savedMarketDisagrees
  ) {
    return null
  }

  const cleared =
    typeof markets.settings.folderCount === "number"
      ? markets.settings.folderCount
      : keys.length

  return {
    node: {
      ...markets,
      settings: {
        ...markets.settings,
        protocol: input.protocol,
        folderId: null,
        folderName: null,
        folderCount: null,
        marketKeys: [],
      },
    },
    cleared,
  }
}
