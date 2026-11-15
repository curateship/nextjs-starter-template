import { createFileRoute, redirect } from "@tanstack/react-router"

import {
  FRONT_PAGE_PATH,
  MAX_PAGE_PATH_LENGTH,
} from "@/lib/pages/page-descriptor"

/**
 * Which page is being built, as its address: `?path=/`.
 *
 * The address and not a slug, because a page is known by where it answers
 * everywhere else in the app, and `/` has no segment that could sit in the
 * route's own path. A junk value falls back to the front page rather than
 * breaking the screen.
 */
function readEditSearch(search: Record<string, unknown>) {
  const path = search.path
  return {
    path:
      typeof path === "string" &&
      path.startsWith("/") &&
      path.length <= MAX_PAGE_PATH_LENGTH
        ? path
        : FRONT_PAGE_PATH,
  }
}

/**
 * The page builder opens inside the Admin dashboard's Pages section since
 * 9 Nov 2026 (Tyler: "Clicking on editing a page should not forward me to an
 * isolated page editor. Look at how automation does it"). This address stays
 * so older links and bookmarks land on the same page there.
 */
export const Route = createFileRoute("/_authenticated/admin/pages_/edit")({
  validateSearch: readEditSearch,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/admin/dashboard",
      search: { tab: "pages", open: search.path, edit: search.path },
      replace: true,
    })
  },
})
