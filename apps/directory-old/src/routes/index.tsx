import { createFileRoute } from "@tanstack/react-router"

import { loadRenderedPage } from "@/lib/page-renderer"

export const Route = createFileRoute("/")({
  // The home screen reads search params server-side (?page= pagination), so
  // search changes must re-run the loader, not just update the URL.
  loaderDeps: ({ search }) => search,
  loader: ({ location }) => loadRenderedPage("/", location.searchStr),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: RenderedPage,
})

function RenderedPage() {
  const data = Route.useLoaderData()
  if (!data) return null
  const { Renderable } = data
  return <>{Renderable}</>
}
