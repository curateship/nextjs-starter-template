import { createFileRoute } from "@tanstack/react-router"

import { SettingsPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/settings")({
  component: SettingsPage,
})
