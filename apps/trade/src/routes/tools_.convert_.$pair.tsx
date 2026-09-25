import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  PriceConverter,
  getConverterErrorMessage,
} from "@/components/free-tools/price-converter"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { readConverterPrices } from "@/lib/api/trade/price-converter"
import {
  CONVERTER_EXCHANGE,
  coinForSlug,
} from "@/lib/free-tools/price-converter"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/convert"

/**
 * One coin's converter page, such as `/tools/convert/btc-usd`, open without an
 * account. It follows the Price converter's switch on the Pages dashboard.
 *
 * Every coin Hyperliquid lists has a page, so an address a search engine
 * already knows keeps working when the coin goes quiet. Only a coin that
 * traded enough is in the sitemap; the rest ask search engines not to list
 * them. A coin Hyperliquid does not list is a plain "not found".
 */
export const Route = createFileRoute("/tools_/convert_/$pair")({
  loader: async ({ params, parentMatchPromise }) => {
    const [root, , user, prices] = await Promise.all([
      parentMatchPromise,
      requirePageVisible(PATH),
      loadCurrentUser(),
      readConverterPrices(),
    ])
    const coin = coinForSlug(prices.coins, params.pair)
    if (!coin) throw notFound()
    return {
      signedIn: Boolean(user),
      prices,
      symbol: coin.symbol,
      listed: coin.ownPage,
      branding: root.loaderData,
    }
  },
  head: ({ loaderData }) =>
    freeToolHead(
      PATH,
      loaderData?.branding,
      loaderData
        ? {
            name: `${loaderData.symbol} to USD converter`,
            summary: `Convert ${loaderData.symbol} to US dollars and dollars to ${loaderData.symbol} at the live ${CONVERTER_EXCHANGE} price.`,
            listed: loaderData.listed,
          }
        : undefined
    ),
  component: CoinConverterRoute,
  errorComponent: visitorRouteErrorComponent(getConverterErrorMessage),
})

function CoinConverterRoute() {
  const { signedIn, prices, symbol } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <PriceConverter prices={prices} symbol={symbol} signedIn={signedIn} />
    </PublicPageFrame>
  )
}
