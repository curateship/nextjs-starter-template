import type { CrmFrame } from "@/components/crm/crm-frame"
import { loadCategories, type Category } from "@/lib/api/directory/categories"
import { loadCustomSectionRows, type CustomSectionSummary } from "@/lib/api/directory/custom-sections"
import { loadEventsPage, type EventsPage } from "@/lib/api/events/events"
import { loadFeaturedEventsPage, loadSignUpsPage } from "@/lib/api/events/events-dashboard"
import { eventsSectionOf, type EventsSearch } from "@/lib/events/events-dashboard-search"

/**
 * What the route reads for the Events dashboard's row showing. Each row reads
 * only its own records, and every row brings the category tree, because the
 * event record on the right files the event under categories.
 */
export type EventsLoaded =
  | { section: "overview" }
  | { section: "events"; page: EventsPage; categories: Category[] }
  | { section: "signups"; page: Awaited<ReturnType<typeof loadSignUpsPage>>; categories: Category[] }
  | { section: "featured"; page: Awaited<ReturnType<typeof loadFeaturedEventsPage>>; categories: Category[] }
  | { section: "fields"; sections: CustomSectionSummary[] }

/** What every row of the dashboard is handed by the frame. */
export type EventsSectionProps<Data> = {
  data: Data
  search: EventsSearch
  frame: CrmFrame
  /** Something changed: the counts on the left and the list read again. */
  onChanged: () => Promise<unknown>
}

export async function loadEventsSection(search: EventsSearch): Promise<EventsLoaded> {
  const section = eventsSectionOf(search)
  if (section === "overview") return { section }
  if (section === "fields") return { section, sections: await loadCustomSectionRows("event") }
  const paging = { q: search.q, page: search.page, limit: search.size }
  if (section === "signups") {
    const [page, categories] = await Promise.all([loadSignUpsPage({ who: search.who ?? "coming", ...paging }), loadCategories()])
    return { section, page, categories }
  }
  if (section === "featured") {
    const [page, categories] = await Promise.all([
      loadFeaturedEventsPage({ spots: search.spots ?? "running", ...paging }),
      loadCategories(),
    ])
    return { section, page, categories }
  }
  const [page, categories] = await Promise.all([
    loadEventsPage({
      search: search.q,
      tab: search.tab ?? "upcoming",
      categoryId: search.category,
      sort: search.sort,
      direction: search.direction,
      days: search.days,
      page: search.page,
      limit: search.size,
    }),
    loadCategories(),
  ])
  return { section, page, categories }
}
