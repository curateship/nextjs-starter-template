import { createFileRoute } from "@tanstack/react-router"

import {
  PriceConverter,
  getConverterErrorMessage,
} from "@/components/free-tools/price-converter"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { readConverterPrices } from "@/lib/api/trade/price-converter"
import { DEFAULT_COIN } from "@/lib/free-tools/price-converter"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/convert"

/**
 * `/tools/convert`, open without an account. It opens on Bitcoin; picking
 * another coin moves to that coin's own page, `/tools/convert/<coin>-usd`.
 */
export const Route = createFileRoute("/tools_/convert")({
  loader: async ({ parentMatchPromise }) => {
    // The root's branding rides along in this route's own data: when the
    // server draws the page, `head` cannot see the root's loader data yet.
    const [root, , user, prices] = await Promise.all([
      parentMatchPromise,
      requirePageVisible(PATH),
      loadCurrentUser(),
      readConverterPrices(),
    ])
    return { signedIn: Boolean(user), prices, branding: root.loaderData }
  },
  head: ({ loaderData }) => freeToolHead(PATH, loaderData?.branding),
  component: ConverterRoute,
  errorComponent: visitorRouteErrorComponent(getConverterErrorMessage),
})

function ConverterRoute() {
  const { signedIn, prices } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <PriceConverter
        prices={prices}
        symbol={DEFAULT_COIN}
        signedIn={signedIn}
      />
    </PublicPageFrame>
  )
}
