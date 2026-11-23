import { useDeferredValue } from "react"
import { createFileRoute } from "@tanstack/react-router"

import { loadRenderedPage } from "@/lib/page-renderer"

export const Route = createFileRoute("/$")({
  // Screens read search params server-side (e.g. archive ?page=), so search
  // changes must re-run the loader, not just update the URL.
  loaderDeps: ({ search }) => search,
  loader: ({ location }) => loadRenderedPage(location.pathname, location.searchStr),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: RenderedPage,
})

function RenderedPage() {
  const data = Route.useLoaderData()
  // Each page is server-rendered, and the next page's content suspends while
  // its chunks/stream load. Rendering it directly makes React unmount the
  // current page and show nothing until the new one is ready — a blank white
  // flash on a slow (deployed) server that reads as a reload. useDeferredValue
  // makes the swap non-urgent, so React keeps the current page on screen during
  // that suspense and only swaps once the new page is fully ready. The route
  // component instance is reused across navigations, so the deferred value
  // correctly lags to the previous page.
  const shown = useDeferredValue(data)
  if (!shown) return null
  return <>{shown.Renderable}</>
}
