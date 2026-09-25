import { createFileRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/components/pomodoro/settings-page"

/** Focus rhythm, presets, alerts and the profile — the product's settings. */
export const Route = createFileRoute("/_pomodoro/settings")({
  component: SettingsPage,
})
