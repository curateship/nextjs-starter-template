import { createFileRoute } from "@tanstack/react-router"

import { CompoundGrowthCalculator } from "@/components/free-tools/compound-growth-calculator"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { freeToolHead } from "@/lib/free-tools/tool-head"

const PATH = "/tools/compound-growth"

/**
 * `/tools/compound-growth`, open without an account. The calculator runs in
 * the browser; the server is only asked whether an admin switched the page
 * off and whether the visitor is signed in, which decides the sign-up link.
 */
export const Route = createFileRoute("/tools_/compound-growth")({
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
  component: CompoundGrowthRoute,
  errorComponent: visitorRouteErrorComponent(),
})

function CompoundGrowthRoute() {
  const { signedIn } = Route.useLoaderData()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <CompoundGrowthCalculator signedIn={signedIn} />
    </PublicPageFrame>
  )
}
