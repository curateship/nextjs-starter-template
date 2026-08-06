import { createFileRoute, notFound, redirect } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { loadWrittenPage } from "@/lib/api/pages"

/**
 * Every address the app has no route for lands here, and this is where a page
 * an admin wrote gets served.
 *
 * It is deliberately the last word rather than a route per written page: the
 * addresses live in a table an admin edits while the app is running, and the
 * router's list is fixed when the app is built. Nothing an admin types can
 * shadow a real page, because a real route always wins over this one.
 *
 * An address nobody wrote throws not-found from here, so the not-found page
 * still answers for genuine dead links exactly as it did before this route
 * existed.
 */
export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const path = `/${params._splat ?? ""}`

    // One read, and it has already decided whether this visitor may see the
    // page — the words only come back when they may. Switched off arrives as
    // "missing", so a hidden page is indistinguishable from one that never
    // existed, here and in a direct call to the endpoint alike.
    const view = await loadWrittenPage(path)

    if (view.status === "missing") throw notFound()
    if (view.status === "signIn") {
      throw redirect({ to: "/login", search: { redirect: path } })
    }

    return view.page
  },
  component: WrittenPageRoute,
  head: ({ loaderData }) =>
    loaderData ? { meta: [{ title: loaderData.title }] } : {},
})

function WrittenPageRoute() {
  const page = Route.useLoaderData()

  return (
    <PublicPageFrame>
      <Card className="mx-auto w-full max-w-2xl">
        <CardHeader>
          <CardTitle>{page.title}</CardTitle>
        </CardHeader>
        <CardContent>
          <WrittenPageBody body={page.body} />
        </CardContent>
      </Card>
    </PublicPageFrame>
  )
}
