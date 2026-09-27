import { redirect } from "@tanstack/react-router"
import {
  CalendarDaysIcon,
  NewspaperIcon,
  ShapesIcon,
  StoreIcon,
  TagIcon,
} from "lucide-react"

import { defineCatchAllPage, type AppOptions } from "@/lib/app-options"
import type { DirectoryFrontPageAnswer } from "@/lib/directory/front-page"
import {
  CMS_FRONT_PAGE_ROW_HINTS,
  CMS_FRONT_PAGE_ROW_KEYS,
  CMS_FRONT_PAGE_ROW_LABELS,
} from "@/lib/directory/front-page-kinds"
import { draftEventsNode } from "@/lib/events/draft-events-step"

/**
 * The deployment's own address, and nothing else.
 *
 * **The platform's root is the admin's front door.** It used to draw the
 * shell's marketing page, which is the right answer for an app that sells
 * itself and the wrong one here: every site CMS serves has its own address, so
 * nobody reaches the platform's root except the person who runs it. Tyler's
 * call on 25 Sep 2026. It forwards rather than drawing a form of its own,
 * because `/login` already knows how to carry a `?redirect=` and how to send a
 * signed-in reader onward.
 *
 * `/home` rather than `/admin` on purpose: it is the signpost that reads the
 * Admin home route setting, so changing that setting still decides where this
 * lands. It also sends a member to the member home rather than to an admin page
 * they cannot open.
 *
 * **A site's own address answers "not mine"**, and the shell's front page draws
 * that site's rows. Those rows were a builder of CMS's own until 27 Sep 2026,
 * when they moved onto the shell's — one builder, one place, and a site with
 * none draws its header and its footer with nothing between them.
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
  if (answer.host === "site") return null

  // Replace, never push. This address only forwards now, so leaving it in the
  // history turns Back into a bounce straight back out of it.
  throw redirect({ to: answer.signedIn ? "/home" : "/login", replace: true })
}

/**
 * The app's answer for `/`. It claims the address only to forward the
 * deployment's own root; a site's root is answered with "not mine", so the
 * shell's front page draws the site's own rows.
 */
const directoryFrontPage = defineCatchAllPage<never>({
  loader: ({ path }) => loadDirectoryFrontPageOverride(path),
  Component: () => null,
})

/** Which panel edits each of this app's row kinds, and which component draws it. */
const ROW_PANELS = {
  listings: "ListingsRowPanel",
  categories: "CategoriesRowPanel",
  events: "EventsRowPanel",
  deals: "DealsRowPanel",
  posts: "PostsRowPanel",
} as const

/** The picture on each kind's card in the shell's Add row window. */
const ROW_ICONS = {
  listings: StoreIcon,
  categories: ShapesIcon,
  events: CalendarDaysIcon,
  deals: TagIcon,
  posts: NewspaperIcon,
} as const

const ROW_CONTENT = {
  listings: "ListingsRowContent",
  categories: "CategoriesRowContent",
  events: "EventsRowContent",
  deals: "DealsRowContent",
  posts: "PostsRowContent",
} as const

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
  pages: {
    catchAll: directoryFrontPage,
    /**
     * The five kinds of row this app adds to the shell's front page builder:
     * its listings, its category cards, its events, its deals and its posts.
     *
     * Each one is a label, a line saying what it shows, the panel that edits
     * its own fields and the component that draws it. What fills one is the
     * other half and it is server-side, under the same key in
     * `server-options.ts`, because a row of this app's records is a database
     * read that also decides whether the row is drawn at all.
     *
     * Both pointers are dynamic on purpose. An app's screens are not in the
     * bundle of a page that has no such row, and this file may not reach an
     * endpoint module while it is still being read.
     */
    frontPageRowKinds: CMS_FRONT_PAGE_ROW_KEYS.map((key) => ({
      key,
      label: CMS_FRONT_PAGE_ROW_LABELS[key],
      hint: CMS_FRONT_PAGE_ROW_HINTS[key],
      icon: ROW_ICONS[key],
      panel: () =>
        import("@/components/directory/front-page-row-panels").then(
          (module) => ({ default: module[ROW_PANELS[key]] })
        ),
      component: () =>
        import("@/components/directory/public/front-page-row-content").then(
          (module) => ({ default: module[ROW_CONTENT[key]] })
        ),
    })),
  },
  automations: {
    // What it does is `server/events/ai-drafts.ts`, registered under the same
    // kind in `server-options.ts`.
    nodes: [draftEventsNode],
  },
  settings: {
    tabs: [
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
