import { createFileRoute, redirect } from "@tanstack/react-router"

import { readMarketSearch } from "@/lib/trade/trade-network"

/**
 * The old address of the KuCoin dashboard, kept as a redirect.
 *
 * The protocol screens moved out from under `/admin` so that a member can
 * open one at all. Saved links, the browser's memory, and notices already
 * written into `trade_notice_links` with the old address all still land on
 * the right coin, because the search params ride along.
 */
export const Route = createFileRoute("/_authenticated/admin/kucoin")({
  validateSearch: readMarketSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/protocols/kucoin", search, replace: true })
  },
})
