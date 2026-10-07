import { createFileRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/components/pomodoro/settings-page"
import {
  DEFAULT_SETTINGS_TAB,
  parseSettingsTab,
  type SettingsTab,
} from "@/lib/pomodoro/settings-tabs"

/** Focus rhythm, presets, alerts and the profile — the product's settings. */
export const Route = createFileRoute("/_pomodoro/settings")({
  // The first tab is left off the address, so `/settings` stays its own
  // canonical address. Anything unknown falls back to it.
  validateSearch: (search: Record<string, unknown>): { tab?: SettingsTab } => {
    const tab = parseSettingsTab(search.tab)
    return tab && tab !== DEFAULT_SETTINGS_TAB ? { tab } : {}
  },
  component: SettingsRoute,
})

function SettingsRoute() {
  const { tab } = Route.useSearch()
  const navigate = Route.useNavigate()
  return (
    <SettingsPage
      tab={tab ?? DEFAULT_SETTINGS_TAB}
      onTabChange={(next) =>
        void navigate({
          search: next === DEFAULT_SETTINGS_TAB ? {} : { tab: next },
        })
      }
    />
  )
}
