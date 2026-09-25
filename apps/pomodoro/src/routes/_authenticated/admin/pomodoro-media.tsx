import { createFileRoute } from "@tanstack/react-router"

import { AdminMediaDashboard } from "@/components/pomodoro/admin-media-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import {
  getPomodoroAdminErrorMessage,
  loadPomodoroMediaUsage,
} from "@/lib/api/pomodoro/admin"

export const Route = createFileRoute("/_authenticated/admin/pomodoro-media")({
  loader: () => loadPomodoroMediaUsage(),
  component: AdminPomodoroMediaRoute,
  errorComponent: routeErrorComponent(getPomodoroAdminErrorMessage),
})

function AdminPomodoroMediaRoute() {
  return <AdminMediaDashboard usage={Route.useLoaderData()} />
}
