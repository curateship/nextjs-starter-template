import { createFileRoute } from "@tanstack/react-router"

import { FeeComparison } from "@/components/free-tools/fee-comparison"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/fee-comparison"

/**
 * `/tools/fee-comparison`, open without an account. The rates are in the
 * app's code and the sums run in the browser; the server is only asked
 * whether an admin switched the page off and whether the visitor is signed
 * in, which decides the sign-up link.
 */
export const Route = createFileRoute("/tools_/fee-comparison")({
  loader: async ({ parentMatchPromise }) => {
    // The root's branding rides along in this route's own data: when the
    // server draws the page, `head` cannot see the root's loader data yet.
    const [root, , user] = await Promise.all([
      parentMatchPromise,
      requirePageVisible(PATH),
      loadCurrentUser(),
    ])
    return {
      signedIn: Boolean(user),
      branding: root.loaderData,
      // One day for both the server's drawing and the browser's, so the
      // too-old warning cannot differ between them.
      today: new Date().toISOString().slice(0, 10),
    }
  },
  head: ({ loaderData }) => freeToolHead(PATH, loaderData?.branding),
  component: FeeComparisonRoute,
  errorComponent: visitorRouteErrorComponent(),
})

function FeeComparisonRoute() {
  const { signedIn, today } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <FeeComparison signedIn={signedIn} today={today} />
    </PublicPageFrame>
  )
}
