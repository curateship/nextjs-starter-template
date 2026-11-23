import { redirect } from "@tanstack/react-router"
import { GraduationCapIcon } from "lucide-react"

import { defineCatchAllPage, type AppOptions } from "@/lib/app-options"
import type { SiteRootAnswer } from "@/lib/api/site-root"
import { COURSES_ROW_KEY } from "@/lib/courses/courses-row"

/**
 * The deployment's own address, and nothing else.
 *
 * **The platform's root is the admin's front door**, the same as CMS: every
 * site Course serves has its own address, so nobody reaches the platform's
 * root except the person who runs it. It forwards rather than drawing a form
 * of its own, because `/login` already knows how to send a signed-in reader
 * onward.
 *
 * `/home` rather than `/admin` on purpose: it reads the Admin home route
 * setting, and it sends a member to the member home rather than to an admin
 * page they cannot open.
 *
 * **A site's own address answers "not mine"**, and the shell's front page
 * draws that site's rows. Reading "not mine" as "this must be the platform"
 * would send a site's visitors to a sign-in form.
 *
 * `load` is a parameter only so the tests can drive it. The dynamic import is
 * the rule for this file, written at the top of `appOptions` below.
 */
export async function loadSiteRootOverride(
  path: string,
  load: () => Promise<SiteRootAnswer> = async () => {
    const { loadSiteRoot } = await import("@/lib/api/site-root")
    return loadSiteRoot()
  }
) {
  if (path !== "/") return null

  const answer = await load()
  if (answer.host === "site") return null

  // Replace, never push, so Back never bounces straight back out of here.
  throw redirect({ to: answer.signedIn ? "/home" : "/login", replace: true })
}

/**
 * The app's answer for `/`. It claims the address only to forward the
 * deployment's own root; a site's root is answered with "not mine".
 */
const siteRootPage = defineCatchAllPage<never>({
  loader: ({ path }) => loadSiteRootOverride(path),
  Component: () => null,
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
 * **Nothing here may import `@/lib/api/*`, or anything that does**, except as a
 * type. This file is pulled into modules the server reads while it is still
 * starting up, and an endpoint module reached from here finds the guards
 * half-made. Reach for an endpoint **inside a loader**, where it is fetched at
 * request time.
 */
export const appOptions: AppOptions = {
  pages: {
    catchAll: siteRootPage,
    /**
     * A Courses row for a site's front page: that site's published courses as
     * cards. What fills it is `readCoursesRow`, under the same key in
     * `server-options.ts`. Both pointers are dynamic so the course screens are
     * not in the bundle of a page that has no such row.
     */
    frontPageRowKinds: [
      {
        key: COURSES_ROW_KEY,
        label: "Courses",
        hint: "This site's published courses, as cards.",
        icon: GraduationCapIcon,
        panel: () =>
          import("@/components/courses/public/courses-row").then((module) => ({
            default: module.CoursesRowPanel,
          })),
        component: () =>
          import("@/components/courses/public/courses-row").then((module) => ({
            default: module.CoursesRowContent,
          })),
      },
    ],
  },
  workspaces: {
    /**
     * **Course serves several websites**, each on its own address, the way
     * CMS does. Admins have and switch sites; members have none and reach
     * none. The shell assumes one site unless told otherwise.
     */
    whoMayHave: "admins",
    siteBranding: true,
    /**
     * Every container here is a public website with its own domain, so the
     * screens say "site". Wording only: addresses, tables and every name in
     * the code stay `workspace`, so a shell update still has something to
     * merge into.
     */
    word: { one: "site", many: "sites" },
  },
}
