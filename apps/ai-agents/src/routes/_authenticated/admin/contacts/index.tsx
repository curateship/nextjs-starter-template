import { createFileRoute } from "@tanstack/react-router"

import { ContactsDashboard } from "@/components/contacts-dashboard"

export const Route = createFileRoute("/_authenticated/admin/contacts/")({
  component: ContactsDashboard,
})
