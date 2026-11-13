import { createFileRoute, redirect } from "@tanstack/react-router"

import { antiDetectSearch } from "@/lib/anti-detect/search"

/**
 * The old Bans address, which bell notices and a project's "banned in the
 * last 30 days" link use. Bans is a section of the Anti Detect dashboard now
 * (Tyler, 12 Nov 2026), so this opens it with the same open row and filters.
 */
export const Route = createFileRoute("/_authenticated/admin/bans")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/anti-detect", search: antiDetectSearch("bans", search), replace: true })
  },
})
