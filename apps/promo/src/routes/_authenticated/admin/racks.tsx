import { createFileRoute, redirect } from "@tanstack/react-router"

import { antiDetectSearch } from "@/lib/anti-detect/search"

/**
 * The old Racks address, which older bookmarks and notices use. The racks
 * are the Anti Detect dashboard's Phones now, filtered by the Racks block
 * (Tyler, 12 Nov 2026), so this opens Phones; `?loose=1` opened the phones
 * on no rack, which is the Rack filter's No rack.
 */
export const Route = createFileRoute("/_authenticated/admin/racks")({
  beforeLoad: ({ search }) => {
    const { loose, ...rest } = search as Record<string, unknown>
    throw redirect({
      to: "/admin/anti-detect",
      search: antiDetectSearch("phones", { ...rest, ...(loose === "1" || loose === 1 ? { rack: "none" } : {}) }),
      replace: true,
    })
  },
})
