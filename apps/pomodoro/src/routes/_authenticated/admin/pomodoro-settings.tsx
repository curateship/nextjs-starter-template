import { createFileRoute } from "@tanstack/react-router"

import { AdminSettingsPage } from "@/components/pomodoro/admin-settings-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getAppSettingsErrorMessage,
  loadPomodoroSettings,
} from "@/lib/api/pomodoro/app-settings"

export const Route = createFileRoute("/_authenticated/admin/pomodoro-settings")({
  loader: () => loadPomodoroSettings(),
  component: AdminPomodoroSettingsRoute,
  errorComponent: routeErrorComponent(getAppSettingsErrorMessage),
})

function AdminPomodoroSettingsRoute() {
  const { settings, catalog } = Route.useLoaderData()
  return <AdminSettingsPage initial={settings} catalog={catalog} />
}
