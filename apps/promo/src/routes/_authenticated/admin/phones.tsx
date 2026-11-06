import { createFileRoute, redirect } from "@tanstack/react-router"

import { findPhoneRack } from "@/lib/api/phones/phones"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * The one address that opens a phone, wherever it is: `?open=<id>` lands on
 * the page of the rack it was last plugged into or put on, with the phone
 * open (Racks dashboard, part 87). A phone's bell notices and the Accounts,
 * Bans and Reddit accounts dashboards all link here, so a link stays right
 * when the phone moves rack. A phone on no rack opens Not on a rack, and the
 * bare address goes to the Racks dashboard.
 */
export const Route = createFileRoute("/_authenticated/admin/phones")({
  validateSearch: (search: Record<string, unknown>) => readOpenSearch(search),
  beforeLoad: async ({ search }) => {
    if (!search.open) throw redirect({ to: "/admin/racks", replace: true })
    const { found, rackId } = await findPhoneRack(search.open)
    if (rackId) {
      throw redirect({ to: "/admin/racks/$rackId", params: { rackId }, search: { open: search.open }, replace: true })
    }
    throw redirect({ to: "/admin/racks", search: found ? { loose: "1" } : {}, replace: true })
  },
})
