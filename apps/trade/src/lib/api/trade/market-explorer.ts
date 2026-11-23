import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"

import {
  KNOWN_PROTOCOLS,
  type MarketCatalog,
  type ProtocolId,
} from "@/lib/protocols/contracts"
import { explorerPrefsSchema } from "@/lib/trade/market-explorer"
import { filterMarketsByVolume } from "@/lib/trade/market-volume"
import { userGet, userPost } from "@/server/guards"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { listProtocols } from "@/server/protocols/registry"
import {
  loadExplorerPrefs,
  saveExplorerPrefs,
} from "@/server/trade/market-explorer"
import { getMarketsErrorMessage } from "@/lib/api/trade/markets"

export type ExplorerVenue = {
  protocol: ProtocolId
  protocolLabel: string
  catalog: MarketCatalog | null
  hidden: number
  orders: boolean
  message: string | null
}

const loadMarketExplorerFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(z.object({ protocol: z.enum(KNOWN_PROTOCOLS).optional() }))
  .handler(async ({ context, data }) => {
    const { prefs, minimumVolume } = await loadExplorerPrefs(context.user.id)
    const protocols = listProtocols().filter(
      (protocol) =>
        protocol.capabilities.markets && protocol.networks.includes("mainnet")
    )
    return {
      prefs,
      availableVenues: protocols.map((protocol) => ({
        protocol: protocol.id,
        protocolLabel: protocol.label,
      })),
      venues: protocols
        .filter((protocol) =>
          data.protocol
            ? protocol.id === data.protocol
            : prefs.current.exchanges.includes(protocol.id)
        )
        .map((protocol) => ({
          protocol: protocol.id,
          protocolLabel: protocol.label,
          answer: loadRawMarketCatalog(protocol.id, "mainnet")
            .then((raw): ExplorerVenue => {
              const { hiddenByVolumeRows, ...catalog } = filterMarketsByVolume(
                raw,
                minimumVolume
              )
              return {
                protocol: protocol.id,
                protocolLabel: protocol.label,
                catalog,
                hidden: hiddenByVolumeRows.length,
                orders: protocol.capabilities.orders,
                message: null,
              }
            })
            .catch((error: unknown): ExplorerVenue => ({
              protocol: protocol.id,
              protocolLabel: protocol.label,
              catalog: null,
              hidden: 0,
              orders: protocol.capabilities.orders,
              message: getMarketsErrorMessage(error),
            })),
        })),
    }
  })

const saveMarketExplorerFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(explorerPrefsSchema)
  .handler(async ({ context, data }) => {
    await saveExplorerPrefs(context.user.id, data)
    return { saved: true }
  })

export function loadMarketExplorer(protocol?: ProtocolId) {
  return loadMarketExplorerFn({ data: { protocol } })
}
export type ExplorerOpening = Awaited<ReturnType<typeof loadMarketExplorer>>
export function saveMarketExplorer(prefs: z.infer<typeof explorerPrefsSchema>) {
  return saveMarketExplorerFn({ data: prefs })
}
