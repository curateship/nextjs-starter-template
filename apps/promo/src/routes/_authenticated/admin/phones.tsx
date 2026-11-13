import { createFileRoute, redirect } from "@tanstack/react-router"

import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * The one address that opens a phone, wherever it is: `?open=<id>` opens it
 * on the Anti Detect dashboard's Phones (Racks dashboard, part 87; since
 * 12 Nov 2026 there is no rack page to land on, Tyler: "I dont think a rack
 * needs its own dashboard"). A phone's bell notices and the Accounts and
 * Bans screens link here, so a link stays right when the phone moves rack.
 */
export const Route = createFileRoute("/_authenticated/admin/phones")({
  validateSearch: (search: Record<string, unknown>) => readOpenSearch(search),
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/anti-detect",
      search: search.open ? { section: "phones", open: search.open } : { section: "phones" },
      replace: true,
    })
  },
})
