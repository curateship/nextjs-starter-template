import * as React from "react"
import { rootRouteId } from "@tanstack/react-router"

import { resolveAppName, useAppName } from "@/lib/branding"
import { parseMarketKey } from "@/lib/protocols/contracts"

type TitleMatch = {
  routeId: string
  loaderData?: unknown
  search?: unknown
}

const EXCHANGE_NAMES: Record<string, string> = {
  aster: "Aster",
  hyperliquid: "Hyperliquid",
  kucoin: "KuCoin",
  phemex: "Phemex",
}

function appNameFromMatches(matches: readonly TitleMatch[]) {
  const rootData = matches.find((match) => match.routeId === rootRouteId)
    ?.loaderData as { appName?: string | null } | undefined
  return resolveAppName(rootData?.appName)
}

export function tradePageTitle(matches: readonly TitleMatch[], page: string) {
  return `${page} · ${appNameFromMatches(matches)}`
}

export function marketPageTitle(
  matches: readonly TitleMatch[],
  marketKey: string | undefined,
  fallbackExchange: string
) {
  const market = marketKey ? parseMarketKey(marketKey) : null
  const exchange = market
    ? (EXCHANGE_NAMES[market.protocol] ?? fallbackExchange)
    : fallbackExchange
  const page = market ? `${market.marketId} · ${exchange}` : exchange
  return tradePageTitle(matches, page)
}

export function marketTitleFromMatches(
  matches: readonly TitleMatch[],
  searchKey: "coin" | "market" | "run",
  fallback: string
) {
  const search = matches.at(-1)?.search as Record<string, unknown> | undefined
  const marketKey = search?.[searchKey]
  return marketPageTitle(
    matches,
    typeof marketKey === "string" ? marketKey : undefined,
    fallback
  )
}

export function useTradePageTitle(page: string) {
  const appName = useAppName()
  React.useEffect(() => {
    const title = `${page} · ${appName}`
    const applyTitle = () => {
      if (document.title !== title) document.title = title
    }
    applyTitle()
    const observer = new MutationObserver(applyTitle)
    observer.observe(document.head, {
      childList: true,
      subtree: true,
      characterData: true,
    })
    return () => observer.disconnect()
  }, [appName, page])
}

export function useMarketPageTitle(
  marketKey: string | null | undefined,
  fallback: string
) {
  const market = marketKey ? parseMarketKey(marketKey) : null
  const exchange = market
    ? (EXCHANGE_NAMES[market.protocol] ?? fallback)
    : fallback
  useTradePageTitle(market ? `${market.marketId} · ${exchange}` : exchange)
}
