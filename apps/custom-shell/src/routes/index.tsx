import { createFileRoute } from "@tanstack/react-router"

import { pricingLandingPage } from "@/components/marketing/pricing-landing-page"
import {
  getVisitorPageErrorMessage,
  visitorRouteErrorComponent,
} from "@/components/shell/route-error"
import { catchAllOverride, landingPageOverride } from "@/lib/app-options"

/**
 * `/` is the one public page an app cannot route around, so it is the one the
 * shell hands over whole — loader, `<head>` and component together, chosen from
 * the app's options. The shell's own front page is the fallback and is a normal
 * module now (`@/components/marketing/pricing-landing-page`).
 *
 * Picked once, when this module loads, so the server and the browser make the
 * same choice and there is nothing for hydration to disagree about. Reading an
 * option at the top level is only safe because route files are leaves — nothing
 * imports them back, so the import circle an app's options file can create
 * cannot reach here.
 *
 * The app's catch-all is asked before either of them, with `/` as the address.
 * That is the one way an app can answer the front page *per request*: this
 * choice is made when the app boots, and an app serving many domains does not
 * know which one it is answering until somebody asks. Saying "not mine" leaves
 * everything below exactly as it was.
 */
const page = landingPageOverride() ?? pricingLandingPage
const appPage = catchAllOverride()

export const Route = createFileRoute("/")({
  loader: async () => {
    const appData = appPage ? ((await appPage.loader({ path: "/" })) ?? null) : null
    if (appData !== null) {
      return { source: "app" as const, data: appData }
    }

    return { source: "landing" as const, data: (await page.loader?.()) ?? null }
  },
  errorComponent: visitorRouteErrorComponent(getVisitorPageErrorMessage),
  // `head` is handed what the loader returned, so a page whose title depends on
  // what it just fetched does not have to fetch it a second time. A head that
  // takes no argument — every one written before this did — is unaffected.
  head: ({ loaderData }) => {
    if (!loaderData) return {}
    if (loaderData.source === "app") {
      return appPage?.head?.({ data: loaderData.data }) ?? {}
    }
    return page.head?.({ loaderData: loaderData.data }) ?? {}
  },
  component: LandingRoute,
})

function LandingRoute() {
  const loaderData = Route.useLoaderData()

  if (loaderData.source === "app") {
    const AppComponent = appPage?.Component
    return AppComponent ? <AppComponent data={loaderData.data} /> : null
  }

  const Page = page.Component
  return <Page data={loaderData.data} />
}
