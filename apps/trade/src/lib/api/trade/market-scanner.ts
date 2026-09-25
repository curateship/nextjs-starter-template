import { createServerFn } from "@tanstack/react-start"
import { z } from "zod"
import { userGet, userPost } from "@/server/guards"
import {
  scannerSettingsSchema,
  type ScannerSettings,
} from "@/lib/trade/market-scanner"
import {
  loadScannerSettings,
  saveScannerSettings,
} from "@/server/trade/market-scanner"
import { loadRawMarketCatalog } from "@/server/protocols/market-catalog"
import { listProtocols } from "@/server/protocols/registry"
import { loadMinimumMarketVolume } from "@/server/trade/prefs"
import { filterMarketsByVolume } from "@/lib/trade/market-volume"
import { KNOWN_PROTOCOLS } from "@/lib/protocols/contracts"
import { getMarketsErrorMessage } from "@/lib/api/trade/markets"

const loadSettingsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .handler(async ({ context }) => ({
    settings: await loadScannerSettings(context.user.id),
    venues: listProtocols()
      .filter((p) => p.capabilities.markets && p.networks.includes("mainnet"))
      .map((p) => ({ protocol: p.id, label: p.label })),
  }))
const saveSettingsFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(scannerSettingsSchema)
  .handler(({ context, data }) => saveScannerSettings(context.user.id, data))
const loadCatalogsFn = createServerFn({ method: "GET" })
  .middleware([userGet])
  .inputValidator(
    z.array(z.enum(KNOWN_PROTOCOLS)).min(1).max(KNOWN_PROTOCOLS.length)
  )
  .handler(async ({ context, data }) => {
    const minimum = await loadMinimumMarketVolume(context.user.id)
    return Promise.all(
      [...new Set(data)].map(async (protocol) => {
        try {
          const raw = await loadRawMarketCatalog(protocol, "mainnet")
          const { hiddenByVolumeRows: _hidden, ...catalog } =
            filterMarketsByVolume(raw, minimum)
          return { protocol, catalog, error: null }
        } catch (error) {
          return {
            protocol,
            catalog: null,
            error: getMarketsErrorMessage(error),
          }
        }
      })
    )
  })
export function loadMarketScannerSettings() {
  return loadSettingsFn()
}
export function saveMarketScannerSettings(settings: ScannerSettings) {
  return saveSettingsFn({ data: settings })
}
export function loadScannerCatalogs(exchanges: ScannerSettings["exchanges"]) {
  return loadCatalogsFn({ data: exchanges })
}
