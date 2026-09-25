import { createFileRoute } from "@tanstack/react-router"

import { ToolsPage } from "@/components/free-tools/tools-page"
import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { visitorRouteErrorComponent } from "@/components/shell/route-error"
import { loadCurrentUser } from "@/lib/api/auth/auth"
import { requirePageVisible } from "@/lib/api/content/pages"
import { FREE_TOOLS, shippedFreeTools } from "@/lib/free-tools/registry"

/**
 * `/tools`: every shipped free tool, open without an account. The list is
 * app code, so the only questions for the server are whether an admin
 * switched the page off and whether the visitor is signed in, which decides
 * if the page ends with a sign-up link.
 *
 * `?preview=1` lists every tool, shipped or not, so the layout can be looked
 * at before the first tool exists. It works in the dev server only: the
 * production build replaces `import.meta.env.DEV` with false and drops it.
 *
 * A tool route must not sit under this one as `tools.<name>.tsx`: this page
 * has no outlet, so a nested child would never draw.
 */
export const Route = createFileRoute("/tools")({
  validateSearch: (search: Record<string, unknown>): { preview?: true } =>
    import.meta.env.DEV && (search.preview === 1 || search.preview === "1")
      ? { preview: true }
      : {},
  loader: async () => {
    const [, user] = await Promise.all([
      requirePageVisible("/tools"),
      loadCurrentUser(),
    ])
    return { signedIn: Boolean(user) }
  },
  component: ToolsRoute,
  errorComponent: visitorRouteErrorComponent(),
})

function ToolsRoute() {
  const { signedIn } = Route.useLoaderData()
  const { preview } = Route.useSearch()
  return (
    <PublicPageFrame className="place-items-start justify-items-center [&>*]:w-full [&>*]:min-w-0">
      <ToolsPage
        tools={preview ? FREE_TOOLS : shippedFreeTools()}
        signedIn={signedIn}
      />
    </PublicPageFrame>
  )
}
