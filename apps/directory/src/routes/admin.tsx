import { createFileRoute } from "@tanstack/react-router"

import { loadAdminShell } from "@/lib/page-renderer"

export const Route = createFileRoute("/admin")({
  // The shell is identical for every admin page and costs a session lookup plus
  // a site-list query, so it loads once per visit rather than on every click.
  // Mutations that change it (creating a site, renaming one) already call
  // router.invalidate(), which reloads this match regardless of shouldReload.
  staleTime: Infinity,
  shouldReload: false,
  loader: () => loadAdminShell(),
  head: ({ loaderData }) => loaderData?.head ?? {},
  component: AdminShell,
})

function AdminShell() {
  const data = Route.useLoaderData()
  if (!data) return null
  return <>{data.Renderable}</>
}
