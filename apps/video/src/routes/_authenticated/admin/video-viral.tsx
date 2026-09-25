import { createFileRoute } from "@tanstack/react-router"

import { ViralPage } from "@/components/video-viral/viral-page"
import { routeErrorComponent } from "@/components/shell/route-error"
import { getViralErrorMessage, loadViralSearch } from "@/lib/api/video/viral"
import { readDirection, readOneOf, readSearchText } from "@/lib/nav/list-search"
import { VIRAL_DAY_CHOICES, type ViralDays } from "@/lib/video/viral"

export const VIRAL_SORT_COLUMNS = [
  "title",
  "channel",
  "views",
  "likes",
  "comments",
  "age",
  "subscribers",
] as const

type ViralSearch = {
  q?: string
  days?: ViralDays
  views?: number
  /** A saved search open from the past-keywords list. */
  open?: string
  sort?: (typeof VIRAL_SORT_COLUMNS)[number]
  direction?: "asc" | "desc"
}

/** A saved search's id: a uuid, or nothing. */
function readOpenId(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 && value.length <= 36
    ? value
    : undefined
}

/** One of the offered windows, or nothing. 7 days is the default. */
function readDays(value: unknown): ViralDays | undefined {
  const days = typeof value === "number" ? value : Number(value)
  return (VIRAL_DAY_CHOICES as readonly number[]).includes(days) &&
    days !== VIRAL_DAY_CHOICES[0]
    ? (days as ViralDays)
    : undefined
}

/** A minimum view count someone typed. 0 is the default and stays absent. */
function readMinViews(value: unknown): number | undefined {
  const views = typeof value === "number" ? value : Number(value)
  return Number.isInteger(views) && views > 0 && views <= 1_000_000_000
    ? views
    : undefined
}

/**
 * The whole search lives in the address — keyword, window, minimum views,
 * sort — so a reload repeats the same search and the address can be handed
 * to somebody else.
 */
function readViralSearch(search: Record<string, unknown>): ViralSearch {
  return {
    q: readSearchText(search.q),
    days: readDays(search.days),
    views: readMinViews(search.views),
    open: readOpenId(search.open),
    sort: readOneOf(search.sort, VIRAL_SORT_COLUMNS),
    direction: readDirection(search.direction),
  }
}

export const Route = createFileRoute("/_authenticated/admin/video-viral")({
  validateSearch: readViralSearch,
  // Only a new keyword, window or view floor asks YouTube again — every
  // search costs 102 of the day's 10,000 free units. Sorting is done here on
  // what already came back.
  loaderDeps: ({ search }) => ({
    q: search.q,
    days: search.days,
    views: search.views,
    open: search.open,
  }),
  loader: ({ deps }) =>
    loadViralSearch({
      keyword: deps.q,
      days: deps.days ?? VIRAL_DAY_CHOICES[0],
      minViews: deps.views ?? 0,
      open: deps.open,
    }),
  component: AdminVideoViralRoute,
  errorComponent: routeErrorComponent(getViralErrorMessage),
})

function AdminVideoViralRoute() {
  return <ViralPage data={Route.useLoaderData()} />
}
