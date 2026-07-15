import { createFileRoute } from "@tanstack/react-router"

import { CatalogPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/sounds")({
  component: () => <CatalogPage kind="sounds" />,
})
