import { createFileRoute } from "@tanstack/react-router"

import { AdminRoomPresetsDashboard } from "@/components/pomodoro/admin-room-presets-dashboard"
import { routeErrorComponent } from "@/components/shell/route-error"
import { loadPomodoroSettings } from "@/lib/api/pomodoro/app-settings"
import {
  getRoomsAdminErrorMessage,
  listPomodoroRoomPresets,
} from "@/lib/api/pomodoro/admin-rooms"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

export const Route = createFileRoute("/_authenticated/admin/pomodoro-room-presets")({
  validateSearch: (search: Record<string, unknown>): { open?: string } =>
    readOpenSearch(search),
  // Opening the window is not a new list.
  loaderDeps: () => ({}),
  // The window's sound and theme pickers need the Live catalogue, which the
  // settings read already carries.
  loader: async () => {
    const [presets, { catalog }] = await Promise.all([
      listPomodoroRoomPresets(),
      loadPomodoroSettings(),
    ])
    return { presets, catalog }
  },
  component: AdminPomodoroRoomPresetsRoute,
  errorComponent: routeErrorComponent(getRoomsAdminErrorMessage),
})

function AdminPomodoroRoomPresetsRoute() {
  const { presets, catalog } = Route.useLoaderData()
  return (
    <AdminRoomPresetsDashboard
      initial={presets}
      catalog={catalog}
      openId={Route.useSearch().open}
    />
  )
}
