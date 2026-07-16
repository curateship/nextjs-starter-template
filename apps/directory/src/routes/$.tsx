import { createFileRoute } from "@tanstack/react-router"

import { loadRenderedPage } from "@/lib/page-renderer"

export const Route = createFileRoute("/$")({
  loader: ({ location }) => loadRenderedPage(location.pathname, location.searchStr),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: RenderedPage,
})

function RenderedPage() {
  const data = Route.useLoaderData()
  if (!data) return null
  const { Renderable } = data
  return <>{Renderable}</>
}
