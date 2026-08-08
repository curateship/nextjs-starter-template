import { createElement } from "react"
import { notFound } from "@tanstack/react-router"

import { SiteLandingPage } from "@/components/sites/site-landing-page"
import { defineCatchAllPage, type AppOptions } from "@/lib/app-options"
import type { PublicSite } from "@/lib/api/sites/sites"
import { siteDescription, siteTitle } from "@/lib/sites/site-settings"

/**
 * What this app changes about the shell.
 *
 * Open `src/lib/app-options.ts` for the full list of what can go in here and
 * what each one does. Anything not offered there is a compile error, on
 * purpose: the shell always knows every way an app can deviate from it.
 *
 * **Nothing here may import `@/lib/api/*`, or anything that does.** This file is
 * pulled into the automation node registry, which the server's own modules
 * import while they are still starting up — so an endpoint module reached from
 * here builds its server functions in the middle of that, finds the guards
 * half-made, and the app falls over before it serves anything. It is the same
 * trap the automation node panels avoid with their `fields: () => import(…)`
 * pointer. The way out is the same: reach for the endpoint **inside the
 * loader**, where it is fetched at request time and nothing is imported at boot.
 * The type above is `import type`, which the compiler erases entirely.
 */

type SiteHome = { site: PublicSite }

export const appOptions: AppOptions = {
  pages: {
    /**
     * Every public address, answered by the site whose domain the visitor
     * typed — including `/`.
     *
     * Three cases, and they are deliberately different. A live site draws its
     * own page. The deployment's own address answers `null`, so the app's front
     * page and the admin-written pages carry on exactly as they always have. An
     * address belonging to nobody — a name never taken, or a site switched off
     * — is a dead address and says so, rather than quietly showing the app's
     * own marketing page under somebody else's domain.
     */
    catchAll: defineCatchAllPage<SiteHome>({
      loader: async ({ path }) => {
        const { loadCurrentSite } = await import("@/lib/api/sites/sites")
        const answer = await loadCurrentSite()

        if (answer.kind === "platform") return null

        // The site is checked for as well as the answer's kind: the union
        // crosses a request on its way here, and what comes back is plain
        // parsed data rather than the type the server had in hand.
        if (answer.kind !== "site" || !answer.site) throw notFound()

        // Task 03 gives a site real pages; until then it has one, its front
        // page, and every other address on it is genuinely not there yet.
        if (path !== "/") throw notFound()

        return { site: answer.site }
      },
      head: ({ data }) => {
        const meta: Record<string, string>[] = [
          { title: siteTitle(data.site.name, data.site.settings) },
        ]

        const description = siteDescription(data.site.settings)
        if (description) meta.push({ name: "description", content: description })

        return { meta }
      },
      Component: ({ data }) => createElement(SiteLandingPage, { site: data.site }),
    }),
  },
}
