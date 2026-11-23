import { createFileRoute } from "@tanstack/react-router"

import { loadRenderedAdminPage } from "@/lib/page-renderer"

// /admin itself has no page — src/screens/admin/page.tsx redirects to the
// configured home route — but it still needs a match so the shell can render it.
export const Route = createFileRoute("/admin/")({
  loaderDeps: ({ search }) => search,
  loader: ({ location }) =>
    loadRenderedAdminPage(location.pathname, location.searchStr),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: AdminIndexPage,
})

function AdminIndexPage() {
  const data = Route.useLoaderData()
  if (!data) return null
  return <>{data.Renderable}</>
}
