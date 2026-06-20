import { createFileRoute } from "@tanstack/react-router"

import { CarouselsDashboard } from "@/components/carousels-dashboard"

export const Route = createFileRoute("/_authenticated/admin/carousels/")({
  component: CarouselsDashboard,
})
