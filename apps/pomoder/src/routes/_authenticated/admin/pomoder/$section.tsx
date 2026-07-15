import { createFileRoute, notFound } from "@tanstack/react-router"

import { PomoderAdminRoute } from "@/components/pomoder-admin-route"
import {
  pomoderAdminSections,
  type PomoderAdminSection,
} from "@/server/admin-contract"

const sections = new Set<string>(pomoderAdminSections)

export const Route = createFileRoute("/_authenticated/admin/pomoder/$section")({
  beforeLoad: ({ params }) => {
    if (!sections.has(params.section as PomoderAdminSection)) {
      throw notFound()
    }
  },
  component: PomoderAdminRoute,
})
