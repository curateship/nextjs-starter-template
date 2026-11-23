import { createFileRoute, redirect } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { safeRedirectPath } from "@/lib/nav/redirect-path"
import { getProjectErrorMessage } from "@/lib/project/errors"
import { onTeamHref } from "@/lib/project/notices"

/**
 * Only an address on this site, so the link can't send anyone elsewhere. A
 * tab or line break is refused too: a browser drops them, which would turn
 * "/<tab>/evil.example" into "//evil.example".
 */
function readTo(value: unknown) {
  const path = safeRedirectPath(value)
  const hidden = [...(path ?? "")].some((char) => char.charCodeAt(0) < 32 || /\s/.test(char))
  return path && !hidden ? path : "/team"
}

/**
 * Where the site admin's notices made before 19 Oct 2026 open. They switched a
 * team picker that is gone, so the page they name opens straight away, a team
 * page as that team's own page under Teams (`onTeamHref` in
 * `src/lib/project/notices.ts`). Nothing is drawn: it always redirects.
 */
export const Route = createFileRoute("/_authenticated/projects/team/$teamId")({
  validateSearch: (search: Record<string, unknown>) => ({ to: readTo(search.to) }),
  loaderDeps: ({ search }) => ({ to: search.to }),
  loader: ({ params, deps }) => {
    // Checked again here, at the redirect itself, not only in validateSearch.
    throw redirect({ href: onTeamHref(params.teamId, readTo(deps.to)), replace: true })
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})
