import { CONTACT_SORT_COLUMNS } from "@/lib/contacts/contact-sort"
import {
  readSegmentRulesParam,
  type SegmentRules,
} from "@/lib/contacts/contact-segments"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import {
  readDirection,
  readOneOf,
  readPage,
  readSearchText,
} from "@/lib/nav/list-search"

/**
 * The people list's state in the address: the CRM's People tab
 * (`/admin/crm?tab=people`). It was the Contacts dashboard's until that moved
 * into the CRM on 7 Nov 2026, and `/admin/contacts` still forwards its links
 * here with the same keys.
 */
export type ContactsSearch = {
  /** Whose details are open in the right panel: a contact's id, or a lead's. */
  open?: string
  /** The segment the list is showing; its rules join as `filter` once changed. */
  segment?: string
  q?: string
  sort?: (typeof CONTACT_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
  page?: number
  /** Rows per page. Absent means the workspace's own setting. */
  size?: number
  /** The list's filters, written in the same rules a segment is. */
  filter?: SegmentRules
}

/** Every value is checked, so a hand-edited address can only fall back to the default. */
export function readContactsSearch(search: Record<string, unknown>): ContactsSearch {
  return {
    ...readOpenSearch(search),
    segment: readOpenSearch({ open: search.segment }).open || undefined,
    q: readSearchText(search.q),
    sort: readOneOf(search.sort, CONTACT_SORT_COLUMNS),
    direction: readDirection(search.direction),
    page: readPage(search.page),
    size: readOneOf(String(search.size), DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String))
      ? Number(search.size)
      : undefined,
    filter: readSegmentRulesParam(search.filter),
  }
}
