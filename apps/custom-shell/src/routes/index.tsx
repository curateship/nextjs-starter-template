import { createFileRoute } from "@tanstack/react-router"

import { pricingLandingPage } from "@/components/marketing/pricing-landing-page"
import { landingPageOverride } from "@/lib/app-options"

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
 */
const page = landingPageOverride() ?? pricingLandingPage

export const Route = createFileRoute("/")({
  loader: () => page.loader?.() ?? null,
  // `head` is handed what the loader returned, so a page whose title depends on
  // what it just fetched does not have to fetch it a second time. A head that
  // takes no argument — every one written before this did — is unaffected.
  head: ({ loaderData }) => page.head?.({ loaderData }) ?? {},
  component: LandingRoute,
})

function LandingRoute() {
  const data = Route.useLoaderData()
  const Page = page.Component
  return <Page data={data} />
}
