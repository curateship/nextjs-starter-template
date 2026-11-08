import { createFileRoute, redirect } from "@tanstack/react-router"

import { readContactsSearch } from "@/lib/contacts/contacts-search"

/**
 * Contacts live on the CRM's People tab now (Tyler, 7 Nov 2026: "I want to
 * consolidate them all into one CRM dashboard"). This address stays so old
 * links and bookmarks still land, with the list's own keys (the segment, the
 * filter, the search, the open person) carried over unchanged.
 */
export const Route = createFileRoute("/_authenticated/admin/contacts")({
  validateSearch: readContactsSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/admin/crm", search: { tab: "people", ...search }, replace: true })
  },
})
