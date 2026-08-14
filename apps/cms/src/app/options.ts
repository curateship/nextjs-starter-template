import { lazy } from "react"

import { defineCatchAllPage, type AppOptions } from "@/lib/app-options"
import type { DirectoryFrontPageData } from "@/lib/directory/front-page"

const DirectoryFrontPageComponent = lazy(() =>
  import("./directory-front-page").then((module) => ({
    default: module.DirectoryFrontPage,
  }))
)

export async function loadDirectoryFrontPageOverride(
  path: string,
  load: () => Promise<DirectoryFrontPageData | null> = async () => {
    const { loadDirectoryFrontPage } =
      await import("@/lib/api/directory/public")
    return loadDirectoryFrontPage()
  }
) {
  if (path !== "/") return null
  return load()
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
  workspaces: {
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
