import { createFileRoute, redirect } from "@tanstack/react-router"

import { routeErrorComponent } from "@/components/shell/route-error"
import { pickProjectTeam } from "@/lib/api/project/teams"
import { safeRedirectPath } from "@/lib/nav/redirect-path"
import { getProjectErrorMessage } from "@/lib/project/errors"

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
 * Where the site admin's notices open. The site admin looks at one team at a
 * time, so a notice about another team moves the team picker there first,
 * then goes on to the page the notice is about (`onTeamHref` in
 * `src/lib/project/notices.ts`). Nothing is drawn: it always redirects.
 */
export const Route = createFileRoute("/_authenticated/projects/team/$teamId")({
  // The switch is a write, which the server only takes from the browser
  // itself, so a notice opened in a new tab runs this in the browser too.
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({ to: readTo(search.to) }),
  loaderDeps: ({ search }) => ({ to: search.to }),
  loader: async ({ params, deps }) => {
    await pickProjectTeam(params.teamId)
    // Checked again here, at the redirect itself, not only in validateSearch.
    throw redirect({ href: readTo(deps.to), replace: true })
  },
  errorComponent: routeErrorComponent(getProjectErrorMessage),
})
