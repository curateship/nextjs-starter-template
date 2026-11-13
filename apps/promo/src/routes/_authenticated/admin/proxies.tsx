import { createFileRoute, redirect } from "@tanstack/react-router"

import { antiDetectSearch } from "@/lib/anti-detect/search"

/**
 * The old Proxies address, which a dead-proxy notice in the bell use.
 * Proxies is a section of the Anti Detect dashboard now (Tyler, 12 Nov
 * 2026), so this opens it with the same open row and filters.
 */
export const Route = createFileRoute("/_authenticated/admin/proxies")({
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/anti-detect", search: antiDetectSearch("proxies", search), replace: true })
  },
})
