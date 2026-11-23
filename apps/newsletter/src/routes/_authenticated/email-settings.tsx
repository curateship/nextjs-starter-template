import { createFileRoute } from "@tanstack/react-router"

import { EmailSettingsPage } from "@/components/email-settings-page"

export const Route = createFileRoute("/_authenticated/email-settings")({
  component: EmailSettingsPage,
})
