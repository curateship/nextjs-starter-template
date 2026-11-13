import { createFileRoute, redirect } from "@tanstack/react-router"

import { antiDetectSearch } from "@/lib/anti-detect/search"

/**
 * The old Browser profiles address, which the Reddit accounts and Projects
 * dashboards' profile links use. Browser profiles is a section of the Anti
 * Detect dashboard now (Tyler, 12 Nov 2026), so this opens it with the same
 * open row and filters.
 */
export const Route = createFileRoute("/_authenticated/admin/profiles")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/anti-detect", search: antiDetectSearch("profiles", search), replace: true })
  },
})
