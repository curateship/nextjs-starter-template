import { createFileRoute } from "@tanstack/react-router"

import { CarouselRoutePage } from "@/pages/carousel-builder/carousel-route-page"

export const Route = createFileRoute("/_authenticated/admin/carousels/$carouselId")({
  component: CarouselRoutePage,
})
