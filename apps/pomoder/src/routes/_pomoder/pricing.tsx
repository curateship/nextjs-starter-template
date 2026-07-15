import { createFileRoute } from "@tanstack/react-router"

import { PricingPage } from "@/components/pomoder/pomoder-pages"

export const Route = createFileRoute("/_pomoder/pricing")({
  component: PricingPage,
})
