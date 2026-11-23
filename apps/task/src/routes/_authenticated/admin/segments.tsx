import { createFileRoute, redirect } from "@tanstack/react-router"

import { readOpenSearch } from "@/lib/hooks/use-open-from-link"

/**
 * Segments live on the Contacts dashboard now (Tyler, 19 Oct 2026: "We have
 * to combine both the contacts and segment into one 3 col dashboard"). This
 * address stays so old links and bookmarks still land: `?open=<id>` opens the
 * contacts list with that segment applied, and a bare address opens the list.
 */
export const Route = createFileRoute("/_authenticated/admin/segments")({
  validateSearch: readOpenSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/contacts",
      search: search.open ? { segment: search.open } : {},
      replace: true,
    })
  },
})
