import { createFileRoute } from "@tanstack/react-router"

import { Dashboard2Content } from "@/components/dashboard2"

export const Route = createFileRoute("/_authenticated/admin/")({
  component: Dashboard2Content,
})
