import type {
  MarketCatalog,
  NetworkId,
  ProtocolId,
} from "@/lib/protocols/contracts"
import { getProtocol } from "@/server/protocols/registry"

const MARKET_CATALOG_TTL_MS = 60_000

type CachedCatalog = {
  expiresAt: number
  answer: Promise<MarketCatalog>
}

const catalogs = new Map<string, CachedCatalog>()

/**
 * One short-lived raw market list per exchange and network.
 *
 * The exchange answer is identical for every account, while the daily-volume
 * cutoff is not. Keeping the raw answer here lets every caller apply its own
 * cutoff after the shared read. The promise itself is cached so simultaneous
 * dashboard opens also share one in-flight exchange request. A refusal is
 * removed immediately; an exchange coming back must be asked again rather
 * than hidden behind a remembered failure.
 */
export function loadRawMarketCatalog(
  protocolId: ProtocolId,
  network: NetworkId
): Promise<MarketCatalog> {
  const key = `${protocolId}:${network}`
  const now = Date.now()
  const remembered = catalogs.get(key)
  if (remembered && remembered.expiresAt > now) return remembered.answer

  const protocol = getProtocol(protocolId)
  const answer = protocol.markets.fetch(network).catch((error: unknown) => {
    if (catalogs.get(key)?.answer === answer) catalogs.delete(key)
    throw error
  })
  catalogs.set(key, { expiresAt: now + MARKET_CATALOG_TTL_MS, answer })
  return answer
}
