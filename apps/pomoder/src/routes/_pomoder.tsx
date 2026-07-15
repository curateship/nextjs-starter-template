import { createFileRoute } from "@tanstack/react-router"

import { PomoderLayout } from "@/components/pomoder/pomoder-layout"

export const Route = createFileRoute("/_pomoder")({
  component: PomoderLayout,
})
