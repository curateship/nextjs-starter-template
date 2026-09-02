import { createFileRoute, notFound, redirect } from "@tanstack/react-router"

import { PublicPageFrame } from "@/components/shell/public-page-frame"
import {
  getVisitorPageErrorMessage,
  visitorRouteErrorComponent,
} from "@/components/shell/route-error"
import { WrittenPageBody } from "@/components/pages/written-page-body"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { catchAllOverride } from "@/lib/app-options"
import { loadWrittenPage } from "@/lib/api/content/pages"

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
 *
 * The app is asked before the written pages are. See `pages.catchAll` in
 * `src/lib/app-options.ts`: an app whose pages live in a table of its own gets
 * first refusal on the address, and saying "not mine" leaves everything below
 * running as it always has.
 *
 * Read once here, at the top, exactly as `index.tsx` reads its own option and
 * for the same reason: route files are leaves, so the import circle an app's
 * options file can create cannot reach them.
 */
const appPage = catchAllOverride()

export const Route = createFileRoute("/$")({
  loader: async ({ params }) => {
    const path = `/${params._splat ?? ""}`

    // Nothing is the app saying the address is not its own; anything else it
    // answers with is the page. Its loader may also throw not-found or a
    // redirect, which is how it claims an address *and* refuses it — falling
    // through to the written pages would answer "no such address" instead.
    //
    // `?? null` because a loader that forgets to return gives `undefined`, and
    // the option's type cannot catch it — `unknown | null` is just `unknown`.
    // Without this, that one missing `return` would silently claim every
    // address in the app and draw the app's page with no data in it.
    const appData = (appPage ? await appPage.loader({ path }) : null) ?? null
    if (appData !== null) {
      return { source: "app" as const, data: appData }
    }

    // One read, and it has already decided whether this visitor may see the
    // page — the words only come back when they may. Switched off arrives as
    // "missing", so a hidden page is indistinguishable from one that never
    // existed, here and in a direct call to the endpoint alike.
    const view = await loadWrittenPage(path)

    if (view.status === "missing") throw notFound()
    if (view.status === "signIn") {
      throw redirect({ to: "/login", search: { redirect: path } })
    }

    return { source: "written" as const, page: view.page }
  },
  errorComponent: visitorRouteErrorComponent(getVisitorPageErrorMessage),
  component: CatchAllRoute,
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.source === "app") {
      return appPage?.head?.({ data: loaderData.data }) ?? {}
    }
    return { meta: [{ title: loaderData.page.title }] }
  },
})

function CatchAllRoute() {
  const loaderData = Route.useLoaderData()

  if (loaderData.source === "app") {
    // The page cannot be missing here — data only carries "app" when the app
    // answered — but it is read from a module-level value the router knows
    // nothing about, so it is asked for rather than assumed.
    const AppComponent = appPage?.Component
    return AppComponent ? <AppComponent data={loaderData.data} /> : null
  }

  const page = loaderData.page

  return (
    <PublicPageFrame>
      <Card className="w-full max-w-2xl">
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
