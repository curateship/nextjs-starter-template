import { createFileRoute, redirect } from "@tanstack/react-router"

import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Segments are pills on the CRM's People tab and a block on its left page
 * (they joined Contacts on 19 Oct 2026, and Contacts joined the CRM on
 * 7 Nov 2026). This address stays so old links land: `?open=<id>` shows that
 * segment's people.
 */
export const Route = createFileRoute("/_authenticated/admin/segments")({
  validateSearch: readOpenSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/crm",
      search: search.open ? { tab: "people", segment: search.open } : { tab: "people" },
      replace: true,
    })
  },
})
