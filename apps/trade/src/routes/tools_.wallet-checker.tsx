import { createFileRoute } from "@tanstack/react-router"

import { WalletChecker } from "@/components/free-tools/wallet-checker"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/wallet-checker"

/**
 * `/tools/wallet-checker`, open without an account.
 *
 * The page arrives empty on purpose: a wallet is only checked once a visitor
 * pastes one and presses Check. Loading it never reaches Hyperliquid, so a
 * search engine crawling the page costs the exchange nothing.
 */
export const Route = createFileRoute("/tools_/wallet-checker")({
  loader: async ({ parentMatchPromise }) => {
    // The root's branding rides along in this route's own data: when the
    // server draws the page, `head` cannot see the root's loader data yet.
    const [root, , user] = await Promise.all([
      parentMatchPromise,
      requirePageVisible(PATH),
      loadCurrentUser(),
    ])
    return { signedIn: Boolean(user), branding: root.loaderData }
  },
  head: ({ loaderData }) => freeToolHead(PATH, loaderData?.branding),
  component: WalletCheckerRoute,
  errorComponent: visitorRouteErrorComponent(),
})

function WalletCheckerRoute() {
  const { signedIn } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <WalletChecker signedIn={signedIn} />
    </PublicPageFrame>
  )
}
