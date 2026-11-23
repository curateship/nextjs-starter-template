import { loadCategories, type Category } from "@/lib/api/directory/categories"
import { loadClaimsScreen, type ClaimsScreen } from "@/lib/api/directory/claims"
import { loadCustomSectionRows, loadCustomSections } from "@/lib/api/directory/custom-sections"
import { loadFeaturedAdmin } from "@/lib/api/directory/featured"
import { loadGuidesPage } from "@/lib/api/directory/guides"
import { loadListingsPage, type ListingsPage } from "@/lib/api/directory/listings"
import { loadOutreach } from "@/lib/api/directory/outreach"
import { loadListingReportsPage } from "@/lib/api/directory/reports"
import { loadSavesAdmin, SAVED_COLLECTION_SORT_COLUMNS } from "@/lib/api/directory/saves"
import { loadSubmissionsPage } from "@/lib/api/directory/submissions"
import { loadPromotionsPage, type PromotionsPage } from "@/lib/api/promotions/promotions"
import { loadPromotionRequestsPage, type PromotionRequestsPage } from "@/lib/api/promotions/requests"
import type { CustomSection } from "@/lib/directory/custom-fields"
import { GUIDE_SORT_COLUMNS } from "@/lib/directory/guides"
import { LISTING_SORT_COLUMNS } from "@/lib/directory/listing-sort"
import { DIRECTORY_LISTING_STATUSES } from "@/lib/directory/listing-status"
import { PROMOTION_SORT_COLUMNS } from "@/lib/promotions/promotion-sort"
import { PROMOTION_REQUEST_STATUSES } from "@/lib/promotions/request-status"
import {
  sectionOf,
  statusIn,
  WAITING_STATUS,
  type ListingsSearch,
} from "@/lib/directory/listings-dashboard-search"
import { LISTING_REPORT_STATUSES } from "@/lib/directory/report-reasons"
import { EDIT_REQUEST_STATUSES, REVIEW_STATUSES } from "@/lib/directory/review-status"

/**
 * What the route reads for the row showing. Each row reads only its own
 * records, through the same API its old page used, so a row with thousands
 * of listings never waits on another's.
 */
export type ListingsLoaded =
  | { section: "overview" }
  | { section: "listings"; page: ListingsPage; categories: Category[]; customSections: CustomSection[] }
  | { section: "categories"; categories: Category[] }
  | { section: "fields"; sections: Awaited<ReturnType<typeof loadCustomSectionRows>> }
  | { section: "guides"; page: Awaited<ReturnType<typeof loadGuidesPage>> }
  | { section: "promotions"; page: PromotionsPage }
  | { section: "submissions"; page: Awaited<ReturnType<typeof loadSubmissionsPage>> }
  | { section: "claims"; screen: ClaimsScreen }
  | { section: "changes"; screen: ClaimsScreen }
  | { section: "dealRequests"; page: PromotionRequestsPage }
  | { section: "reports"; page: Awaited<ReturnType<typeof loadListingReportsPage>> }
  | { section: "plans"; featured: Awaited<ReturnType<typeof loadFeaturedAdmin>>; categories: Category[] }
  | { section: "placements"; featured: Awaited<ReturnType<typeof loadFeaturedAdmin>> }
  | { section: "saved"; saves: Awaited<ReturnType<typeof loadSavesAdmin>> }
  | { section: "outreach"; outreach: Awaited<ReturnType<typeof loadOutreach>> }

/** Which status a queue shows: the one in the address, its waiting one when there is none, or every one for "all". */
function queueStatus<const T extends string>(search: ListingsSearch, section: keyof typeof WAITING_STATUS, allowed: readonly T[]) {
  if (search.status === "all") return undefined
  return statusIn(search.status, allowed) ?? (WAITING_STATUS[section] as T)
}

const pick = <const T extends string>(value: string | undefined, allowed: readonly T[]) => statusIn(value, allowed)

export async function loadListingsSection(search: ListingsSearch): Promise<ListingsLoaded> {
  const section = sectionOf(search)
  const paging = { search: search.q, page: search.page, limit: search.size }
  switch (section) {
    case "overview":
      return { section }
    case "listings": {
      const [page, categories, customSections] = await Promise.all([
        loadListingsPage({
          ...paging,
          status: pick(search.status, DIRECTORY_LISTING_STATUSES),
          sort: pick(search.sort, LISTING_SORT_COLUMNS),
          direction: search.direction,
          days: search.days,
          categoryId: search.category,
        }),
        loadCategories(),
        loadCustomSections("listing"),
      ])
      return { section, page, categories, customSections }
    }
    case "categories":
      return { section, categories: await loadCategories() }
    case "fields":
      return { section, sections: await loadCustomSectionRows("listing") }
    case "guides":
      return {
        section,
        page: await loadGuidesPage({
          ...paging,
          status: pick(search.status, ["draft", "published"] as const),
          sort: pick(search.sort, GUIDE_SORT_COLUMNS),
          direction: search.direction,
        }),
      }
    case "promotions":
      return {
        section,
        page: await loadPromotionsPage({
          ...paging,
          status: pick(search.status, ["draft", "published"] as const),
          sort: pick(search.sort, PROMOTION_SORT_COLUMNS),
          direction: search.direction,
        }),
      }
    case "dealRequests":
      return {
        section,
        page: await loadPromotionRequestsPage({
          ...paging,
          status: search.status === "all" ? "all" : queueStatus(search, "dealRequests", PROMOTION_REQUEST_STATUSES),
        }),
      }
    case "submissions":
      return {
        section,
        page: await loadSubmissionsPage({ ...paging, status: queueStatus(search, "submissions", REVIEW_STATUSES) }),
      }
    case "claims":
      return {
        section,
        screen: await loadClaimsScreen({ ...paging, status: queueStatus(search, "claims", REVIEW_STATUSES) }),
      }
    case "changes":
      return {
        section,
        screen: await loadClaimsScreen({ limit: 1, requestStatus: queueStatus(search, "changes", EDIT_REQUEST_STATUSES) }),
      }
    case "reports":
      return {
        section,
        page: await loadListingReportsPage({
          ...paging,
          status: queueStatus(search, "reports", LISTING_REPORT_STATUSES),
          kind: search.kind,
        }),
      }
    case "plans": {
      const [featured, categories] = await Promise.all([loadFeaturedAdmin({ limit: 1 }), loadCategories()])
      return { section, featured, categories }
    }
    case "placements":
      return { section, featured: await loadFeaturedAdmin(paging) }
    case "saved":
      return {
        section,
        saves: await loadSavesAdmin({
          ...paging,
          sort: pick(search.sort, SAVED_COLLECTION_SORT_COLUMNS),
          direction: search.direction,
        }),
      }
    case "outreach":
      return { section, outreach: await loadOutreach(paging) }
  }
}
