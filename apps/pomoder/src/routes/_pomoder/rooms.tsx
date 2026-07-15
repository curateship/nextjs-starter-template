import { createFileRoute } from "@tanstack/react-router"

import { RoomsPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/rooms")({
  component: RoomsPage,
})
