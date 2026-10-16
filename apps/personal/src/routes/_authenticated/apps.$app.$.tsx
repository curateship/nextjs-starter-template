import { createFileRoute, notFound } from "@tanstack/react-router"

import { AppPanel } from "@/components/personal/app-panel"
import { findConnectedApp } from "@/lib/personal/app-panels"

// One of another app's pages in the middle panel: /apps/project/dashboard
// shows Project's /dashboard. See workspace/docs/app-panels.md.
export const Route = createFileRoute("/_authenticated/apps/$app/$")({
  loader: ({ params }) => {
    if (!findConnectedApp(params.app)) throw notFound()
  },
  component: AppPanelPage,
})

function AppPanelPage() {
  const { app: appId, _splat: rest } = Route.useParams()
  const app = findConnectedApp(appId)
  if (!app) return null
  return <AppPanel key={app.id} app={app} path={`/${rest ?? ""}`} />
}
