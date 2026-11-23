import { createFileRoute, notFound } from "@tanstack/react-router"

import {
  WhatIfCalculator,
  getWhatIfErrorMessage,
} from "@/components/free-tools/what-if"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { readWhatIf } from "@/lib/api/trade/what-if"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/what-if"
const SYMBOL = /^[A-Za-z0-9]{1,20}$/

type WhatIfSearch = { coin?: string; stock?: string }

function readSymbol(value: unknown): string | undefined {
  return typeof value === "string" && SYMBOL.test(value) ? value : undefined
}

/**
 * `/tools/what-if`, open without an account. It opens on Bitcoin; `?coin=SOL`
 * or `?stock=NVDA` opens another market. A market the page does not offer is
 * "not found".
 */
export const Route = createFileRoute("/tools_/what-if")({
  validateSearch: (search: Record<string, unknown>): WhatIfSearch => ({
    coin: readSymbol(search.coin),
    stock: readSymbol(search.stock),
  }),
  loaderDeps: ({ search }) => ({ coin: search.coin, stock: search.stock }),
  loader: async ({ deps, parentMatchPromise }) => {
    const asked = deps.stock
      ? { kind: "stock" as const, symbol: deps.stock }
      : deps.coin
        ? { kind: "coin" as const, symbol: deps.coin }
        : null
    // The root's branding rides along in this route's own data: when the
    // server draws the page, `head` cannot see the root's loader data yet.
    const [root, , user, page] = await Promise.all([
      parentMatchPromise,
      requirePageVisible(PATH),
      loadCurrentUser(),
      readWhatIf(asked),
    ])
    if (!page.series) throw notFound()
    return {
      signedIn: Boolean(user),
      list: page.list,
      series: page.series,
      branding: root.loaderData,
    }
  },
  head: ({ loaderData }) => freeToolHead(PATH, loaderData?.branding),
  component: WhatIfRoute,
  errorComponent: visitorRouteErrorComponent(getWhatIfErrorMessage),
})

function WhatIfRoute() {
  const { signedIn, list, series } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <WhatIfCalculator list={list} series={series} signedIn={signedIn} />
    </PublicPageFrame>
  )
}
