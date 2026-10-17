import * as React from "react"
import { useRouterState } from "@tanstack/react-router"

import { usePublicBreadcrumbs } from "@/lib/branding"
import { pageForPath } from "@/lib/pages/page-registry"
import {
  publicBreadcrumbTrail,
  type PublicBreadcrumbItem,
} from "@/lib/pages/public-breadcrumbs"

/**
 * The trail under the public header, and the one place that works out what it
 * says.
 *
 * `PublicPageFrame` draws what this returns and `__root.tsx` turns it into the
 * structured data in the head. Both ask this hook rather than working the
 * trail out themselves, so the words a visitor reads and the words a search
 * engine reads cannot drift apart.
 */
export function usePublicBreadcrumbTrail(): PublicBreadcrumbItem[] {
  const breadcrumbs = usePublicBreadcrumbs()
  // Two plain strings rather than one object, so each `select` returns the
  // same value between renders and an unrelated router change redraws nothing.
  const path = useRouterState({
    select: (state) =>
      // A signed-in screen has the app's own sidebar and header, and a
      // not-found answer is not a place in the site, so neither gets a trail.
      state.matches.some(
        (match) =>
          match.routeId.startsWith("/_authenticated") ||
          match.status === "notFound"
      )
        ? ""
        : state.location.pathname,
  })
  const pageTitle = useRouterState({
    select: (state) => writtenPageTitle(state.matches),
  })

  return React.useMemo(
    () =>
      path
        ? publicBreadcrumbTrail({
            path,
            page: pageForPath(path),
            writtenPageTitle: pageTitle,
            homeLabel: pageForPath("/")?.name,
            breadcrumbs,
          })
        : [],
    [path, pageTitle, breadcrumbs]
  )
}

/**
 * The title of the page an admin wrote, when this address is one.
 *
 * Read from the catch-all route's loaded data rather than from the browser
 * title: the browser title carries the site name and the SEO wording after it,
 * and a trail step naming "About | Custom Shell" reads as a mistake.
 */
function writtenPageTitle(
  matches: ReadonlyArray<{ routeId: string; loaderData?: unknown }>
) {
  for (const match of matches) {
    if (match.routeId !== "/$") continue
    const data = match.loaderData as
      | { source?: string; page?: { title?: string } }
      | undefined
    if (data?.source === "written") return data.page?.title ?? ""
  }
  return ""
}
