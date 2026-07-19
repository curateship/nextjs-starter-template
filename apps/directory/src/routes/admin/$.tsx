import { createFileRoute } from "@tanstack/react-router"

import { loadRenderedAdminPage } from "@/lib/page-renderer"

// Every /admin/* page. Only this loader re-runs when you click through the
// sidebar — the shell above it stays mounted.
export const Route = createFileRoute("/admin/$")({
  // Screens read search params server-side (e.g. dashboard ?range=), so search
  // changes must re-run the loader, not just update the URL.
  loaderDeps: ({ search }) => search,
  loader: ({ location }) =>
    loadRenderedAdminPage(location.pathname, location.searchStr),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: AdminPage,
})

function AdminPage() {
  const data = Route.useLoaderData()
  if (!data) return null
  return <>{data.Renderable}</>
}
