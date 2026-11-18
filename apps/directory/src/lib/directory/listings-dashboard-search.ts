import { GUIDE_SORT_COLUMNS, type GuideSortColumn } from "@/lib/directory/guides"
import {
  LISTING_SORT_COLUMNS,
  readListingViewRange,
  type ListingSortColumn,
  type ListingViewRange,
} from "@/lib/directory/listing-sort"
import { DIRECTORY_LISTING_STATUSES } from "@/lib/directory/listing-status"
import { LISTING_REPORT_STATUSES, REPORT_KINDS, type ReportKind } from "@/lib/directory/report-reasons"
import { EDIT_REQUEST_STATUSES, REVIEW_STATUSES } from "@/lib/directory/review-status"
import { DASHBOARD_ROWS_PER_PAGE_OPTIONS } from "@/lib/custom-shell"
import { readOpenSearch } from "@/lib/hooks/use-open-from-link"
import { readDirection, readOneOf, readPage, readSearchText } from "@/lib/nav/list-search"

/**
 * What the Listings dashboard's address holds (Tyler, 18 Nov 2026:
 * "Cosolidate listings into one 3 panel dashboard. Match design pattern of
 * the shell 1 to 1"), so a reload, Back or a pasted link opens the same row
 * of the Dashboards block, the same filters and the same open record.
 * Listings is the row with no `section`, so `/admin/listings` alone still
 * lands on it.
 *
 * The rows, in Tyler's order (records first, then the queues): Overview,
 * Listings, Categories, Custom fields, Guides, Submissions, Claims, Owner
 * changes, Reports, Featured plans, Placements, Saved lists, Outreach.
 */

export const LISTINGS_SECTIONS = [
  "overview",
  "listings",
  "categories",
  "fields",
  "guides",
  "submissions",
  "claims",
  "changes",
  "reports",
  "plans",
  "placements",
  "saved",
  "outreach",
] as const
export type ListingsSection = (typeof LISTINGS_SECTIONS)[number]

/** A row the Dashboards block can hide or move: every one but Overview. */
export type ListingsListSection = Exclude<ListingsSection, "overview">
export const LISTINGS_LIST_SECTIONS: readonly ListingsListSection[] = LISTINGS_SECTIONS.filter(
  (section): section is ListingsListSection => section !== "overview"
)

export const LISTINGS_SECTION_LABELS: Record<ListingsSection, string> = {
  overview: "Overview",
  listings: "Listings",
  categories: "Categories",
  fields: "Custom fields",
  guides: "Guides",
  submissions: "Submissions",
  claims: "Claims",
  changes: "Owner changes",
  reports: "Reports",
  plans: "Featured plans",
  placements: "Placements",
  saved: "Saved lists",
  outreach: "Outreach",
}

/** Every status any row filters by, read once; each row checks its own. */
const STATUSES = [
  ...new Set<string>([
    ...DIRECTORY_LISTING_STATUSES,
    ...REVIEW_STATUSES,
    ...LISTING_REPORT_STATUSES,
    ...EDIT_REQUEST_STATUSES,
    "draft",
    "published",
    "all",
  ]),
] as [string, ...string[]]

const SORTS = [...new Set<string>([...LISTING_SORT_COLUMNS, ...GUIDE_SORT_COLUMNS, "name", "owner", "visibility", "listings"])] as [
  string,
  ...string[],
]

export type ListingsSearch = {
  section?: Exclude<ListingsSection, "listings">
  /** The row open on the right. */
  open?: string
  /** Words to find, in the row showing. */
  q?: string
  /** The row's status filter. Its default is that row's own: Waiting on Submissions and Claims, Open on Reports. */
  status?: string
  /** Reports: listing, event or deal. */
  kind?: ReportKind
  sort?: ListingSortColumn | GuideSortColumn | "name" | "owner" | "visibility" | "listings"
  direction?: "asc" | "desc"
  /** Listings: the range the Views column counts. */
  days?: ListingViewRange
  /** Listings: one category, picked in the Categories block or from a category's count. */
  category?: string
  page?: number
  size?: number
}

const ID = /^[A-Za-z0-9-]{1,36}$/

/** The address read safely: anything unknown falls back to the default. */
export function readListingsSearch(search: Record<string, unknown>): ListingsSearch {
  const out: ListingsSearch = {}
  const section = readOneOf(search.section, LISTINGS_SECTIONS)
  if (section && section !== "listings") out.section = section
  const { open } = readOpenSearch(search)
  if (open && ID.test(open)) out.open = open
  const q = readSearchText(search.q)
  if (q) out.q = q
  const status = readOneOf(search.status, STATUSES)
  if (status) out.status = status
  const kind = readOneOf(search.kind, REPORT_KINDS)
  if (kind) out.kind = kind
  const sort = readOneOf(search.sort, SORTS)
  if (sort) out.sort = sort as ListingsSearch["sort"]
  const direction = readDirection(search.direction)
  if (direction) out.direction = direction
  const days = readListingViewRange(search.days)
  if (days !== undefined && days !== "all") out.days = days
  if (typeof search.category === "string" && ID.test(search.category)) out.category = search.category
  const page = readPage(search.page)
  if (page) out.page = page
  if (readOneOf(String(search.size), DASHBOARD_ROWS_PER_PAGE_OPTIONS.map(String))) out.size = Number(search.size)
  return out
}

export function sectionOf(search: ListingsSearch): ListingsSection {
  return search.section ?? "listings"
}

/** The address for a row picked in the Dashboards block: a fresh start in that row. */
export function sectionSearch(section: ListingsSection, keep: Partial<ListingsSearch> = {}): ListingsSearch {
  return { ...(section === "listings" ? {} : { section }), ...keep }
}

/** A status if it is one of the row's own, else nothing. */
export function statusIn<const T extends string>(value: string | undefined, allowed: readonly T[]): T | undefined {
  return value && (allowed as readonly string[]).includes(value) ? (value as T) : undefined
}

/**
 * Where an old Listings page's address goes now: the same row of the
 * dashboard, keeping the search, the filters and the open record. Claims'
 * `request=` was an owner change, which is a row of its own.
 */
export function forwardedSearch(section: ListingsSection, old: Record<string, unknown>): ListingsSearch {
  // A link to one record shows every status, so one already decided is
  // still in the list rather than left out by the waiting filter.
  if (section === "claims" && typeof old.request === "string" && ID.test(old.request)) {
    return { section: "changes", open: old.request, status: "all" }
  }
  const read = readListingsSearch({ ...old, section })
  if (read.open && WAITING_STATUS[section] && !read.status) return { ...read, status: "all" }
  return read
}

/** The rows that wait on somebody, which open on their waiting rows. */
export const WAITING_STATUS: Partial<Record<ListingsSection, string>> = {
  submissions: "pending_review",
  claims: "pending_review",
  changes: "pending",
  reports: "open",
}
