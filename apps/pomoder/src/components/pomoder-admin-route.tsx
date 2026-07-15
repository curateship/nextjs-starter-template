import { getRouteApi } from "@tanstack/react-router"

import { PomoderAdminPage } from "@/components/pomoder-admin-page"
import type { PomoderAdminSection } from "@/server/admin-contract"

const route = getRouteApi("/_authenticated/admin/pomoder/$section")

export function PomoderAdminRoute() {
  const { section } = route.useParams()
  return (
    <PomoderAdminPage key={section} section={section as PomoderAdminSection} />
  )
}
