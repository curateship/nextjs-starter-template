import { lazy } from "react"
import { redirect } from "@tanstack/react-router"

import { defineCatchAllPage, type AppOptions } from "@/lib/app-options"
import type {
  DirectoryFrontPageAnswer,
  DirectoryFrontPageData,
} from "@/lib/directory/front-page"
import { draftEventsNode } from "@/lib/events/draft-events-step"

const DirectoryFrontPageComponent = lazy(() =>
  import("./directory-front-page").then((module) => ({
    default: module.DirectoryFrontPage,
  }))
)

/**
 * The front page, which is two different pages depending on who is being asked.
 *
 * **A site's address gets that site's home page**, or nothing when it has none
 * and the shell's own front page should draw instead. That fall-through is the
 * reason the answer names the host rather than the page alone: a site with no
 * home page, and one whose rows all came back empty, both answer "no page", and
 * neither of them is the platform.
 *
 * **The deployment's own address is the admin's front door and nothing else.**
 * It used to draw the shell's marketing page, which is the right answer for an
 * app that sells itself and the wrong one here: every site CMS serves has its
 * own address, so nobody reaches the platform's root except the person who runs
 * it. Tyler's call on 25 Sep 2026. It forwards rather than drawing a form of
 * its own, because `/login` already knows how to carry a `?redirect=` and how
 * to send a signed-in reader onward.
 *
 * `/home` rather than `/admin` on purpose: it is the signpost that reads the
 * Admin home route setting, so changing that setting still decides where this
 * lands. It also sends a member to the member home rather than to an admin page
 * they cannot open.
 *
 * `load` is a parameter only so the tests can drive it. The dynamic import is
 * the rule for this file, written at the top of `appOptions` below: reaching an
 * endpoint module while this one is still being read catches the server's
 * guards half-built.
 */
export async function loadDirectoryFrontPageOverride(
  path: string,
  load: () => Promise<DirectoryFrontPageAnswer> = async () => {
    const { loadDirectoryFrontPage } =
      await import("@/lib/api/directory/public")
    return loadDirectoryFrontPage()
  }
) {
  if (path !== "/") return null

  const answer = await load()
  if (answer.host === "site") return answer.page

  // Replace, never push. This address only forwards now, so leaving it in the
  // history turns Back into a bounce straight back out of it.
  throw redirect({ to: answer.signedIn ? "/home" : "/login", replace: true })
}

const directoryFrontPage = defineCatchAllPage<DirectoryFrontPageData>({
  loader: ({ path }) => loadDirectoryFrontPageOverride(path),
  head: ({ data }) => ({
    meta: [
      { title: `${data.heading} · ${data.siteName}` } as Record<string, string>,
      ...(data.intro
        ? [
            {
              name: "description",
              content: data.intro,
            } as Record<string, string>,
          ]
        : []),
    ],
  }),
  Component: DirectoryFrontPageComponent,
})

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * The type is written as an annotation rather than `satisfies` so that an empty
 * object still reads as the full shape. Both catch a misspelled option.
 *
 * **Nothing here may import `@/lib/api/*`, or anything that does.** This file is
 * pulled into the automation node registry, which the server's own modules
 * import while they are still starting up — so an endpoint module reached from
 * here builds its server functions in the middle of that, finds the guards
 * half-made, and the app falls over before it serves anything. Reach for an
 * endpoint **inside a loader**, where it is fetched at request time.
 */
export const appOptions: AppOptions = {
  pages: { catchAll: directoryFrontPage },
  automations: {
    // What it does is `server/events/ai-drafts.ts`, registered under the same
    // kind in `server-options.ts`.
    nodes: [draftEventsNode],
  },
  settings: {
    tabs: [
      {
        id: "site-identity",
        label: "Site identity",
        panel: () => import("@/components/settings/cms-settings"),
      },
      {
        id: "directory",
        label: "Directory",
        panel: () =>
          import("@/components/settings/directory-settings").then((module) => ({
            default: module.DirectorySettings,
          })),
      },
      {
        id: "listing-badges",
        label: "Listing badges",
        panel: () =>
          import("@/components/settings/listing-badge-settings").then(
            (module) => ({ default: module.ListingBadgeSettings })
          ),
      },
    ],
  },
  workspaces: {
    /**
     * **CMS is the app with several sites**, and the shell now assumes one
     * unless told otherwise, so this has to be said out loud. Admins have and
     * switch sites; members have none and reach none.
     */
    whoMayHave: "admins",
    siteBranding: true,
    /**
     * This app builds websites, so its containers are sites. The shell says
     * "workspace" because that is what one is where a container is one
     * person's desk; here every container is a public website with its own
     * domain, and showing an admin both words for one thing is worse than
     * either word alone.
     *
     * Wording only. Addresses, tables and every name in the code stay
     * `workspace`, so a shell update still has something to merge into.
     */
    word: { one: "site", many: "sites" },
  },
}
