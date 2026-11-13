import { createFileRoute, redirect } from "@tanstack/react-router"

import { antiDetectSearch } from "@/lib/anti-detect/search"

/**
 * A rack's old page, which a rack's bell notices and older links use. A rack
 * has no page of its own any more (Tyler, 12 Nov 2026: "I dont think a rack
 * needs its own dashboard"), so this opens the Anti Detect dashboard's Phones
 * filtered to that rack, with the open phone, the tab, the search and the
 * filters it had. The page called a phone's kind `kind`; Phones calls it
 * `phoneKind`, since Bans has a `kind` of its own.
 */
export const Route = createFileRoute("/_authenticated/admin/racks_/$rackId")({
  beforeLoad: ({ params, search }) => {
    const { kind, ...rest } = search as Record<string, unknown>
    throw redirect({
      to: "/admin/anti-detect",
      search: antiDetectSearch("phones", { ...rest, phoneKind: kind, rack: params.rackId }),
      replace: true,
    })
  },
})
