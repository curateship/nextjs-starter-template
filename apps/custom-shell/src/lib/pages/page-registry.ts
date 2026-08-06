import type { PageDeclaration, PageDescriptor } from "./page-descriptor"

/**
 * Every `*.page.ts` sitting beside a route, found by Vite at build time.
 *
 * Eager on purpose: the server renders the page first and the browser takes
 * over, and both must reach the same list or hydration disagrees. A lazy glob
 * would make the list a promise, and the two sides could resolve it at
 * different moments. The declaration files are tiny leaves — a few strings
 * each, importing nothing but the descriptor type — so loading them all up
 * front costs nothing.
 */
const declarationModules = import.meta.glob("/src/routes/**/*.page.ts", {
  eager: true,
})

type Registry = {
  pages: readonly PageDescriptor[]
  byPath: Map<string, PageDescriptor>
}

let registry: Registry | null = null

/**
 * Turns declarations into finished descriptors: defaults filled in, `source`
 * stamped, duplicate addresses refused out loud.
 *
 * Separate from the registry itself so tests can feed it a hand-made list —
 * the glob above is fixed at build time, so a duplicate can't be staged
 * through it.
 */
export function buildPageDescriptors(
  entries: ReadonlyArray<{ file: string; declaration: PageDeclaration }>,
  source: PageDescriptor["source"]
): PageDescriptor[] {
  const byPath = new Map<string, string>()
  const pages: PageDescriptor[] = []

  for (const { file, declaration } of entries) {
    // An address that is not an address is a silent wrong, not a loud one:
    // everything downstream — the link that opens the page, the visit counts
    // keyed by path, the sitemap — would quietly show nothing rather than
    // fail. Caught here, where the list is built, like a stolen address is.
    if (!declaration.path.startsWith("/")) {
      throw new Error(
        `${file} declares the address "${declaration.path}". A page's address starts with "/" and matches its route file exactly.`
      )
    }

    const alreadyFrom = byPath.get(declaration.path)
    if (alreadyFrom !== undefined) {
      // Silently winning would mean the dashboard, the menu and the sitemap
      // all describe a different page than the one the router serves.
      throw new Error(
        `Two pages both claim the address "${declaration.path}": ${alreadyFrom} and ${file}. Every public page needs its own address.`
      )
    }
    byPath.set(declaration.path, file)

    pages.push({
      path: declaration.path,
      name: declaration.name,
      summary: declaration.summary,
      canSwitchOff: declaration.canSwitchOff ?? true,
      layout: declaration.layout ?? "card",
      source,
    })
  }

  return pages
}

/**
 * The list itself, worked out the first time anything asks and kept.
 *
 * Deliberately not built at module load, the same way `node-registry.ts`
 * holds back: modules that import this one are still loading when this file
 * runs, and a later task folds in pages from the app's options file — which
 * imports app components, which import shell components, which can import
 * this file. Everything here is called from a component, a loader or a
 * request, all of which happen long after boot.
 */
function pageRegistry(): Registry {
  if (registry) return registry

  const entries = Object.entries(declarationModules).map(([file, module]) => {
    const declaration = (module as { default?: PageDeclaration }).default
    if (!declaration || typeof declaration.path !== "string") {
      throw new Error(
        `${file} doesn't default-export a page declaration. Export one with definePage(...) from "@/lib/pages/page-descriptor".`
      )
    }
    return { file, declaration }
  })

  // Address order, so the list reads the same everywhere it is shown and the
  // server and the browser agree without either caring how the glob sorts.
  //
  // Compared by character rather than with `localeCompare`, which answers
  // differently depending on the locale the process is running under. The
  // server and the browser are two different runtimes, and a list they sorted
  // differently would hydrate into a different order than it rendered in.
  entries.sort((left, right) =>
    left.declaration.path < right.declaration.path
      ? -1
      : left.declaration.path > right.declaration.path
        ? 1
        : 0
  )

  const pages = buildPageDescriptors(entries, "shell")
  registry = {
    pages,
    byPath: new Map(pages.map((page) => [page.path, page])),
  }
  return registry
}

/** Every public page the app has, in address order. */
export function publicPages(): readonly PageDescriptor[] {
  return pageRegistry().pages
}

/** The page at an address, or null — an address with no declaration is not an error. */
export function pageForPath(path: string): PageDescriptor | null {
  return pageRegistry().byPath.get(path) ?? null
}
