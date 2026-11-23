import { useRouterState } from "@tanstack/react-router"

/**
 * The address of the page a visitor is looking at, rather than the one being
 * fetched.
 *
 * `useLocation` moves to the new address the moment a link is clicked, while
 * the page on screen stays put until its replacement is ready. Anything that
 * decides how the current page is drawn has to read this instead, or the page
 * being left behind redraws itself as the page arriving.
 *
 * Tyler reported it on 27 Sep 2026: clicking from the public front page into
 * the admin centred the hero for about half a second before the dashboard
 * appeared, because the frame asked "is this a marketing page?" about
 * `/admin/dashboard` while the front page was still on the screen.
 */
export function usePaintedPathname() {
  return useRouterState({
    select: (state) =>
      state.status === "pending" && state.resolvedLocation
        ? state.resolvedLocation.pathname
        : state.location.pathname,
  })
}
