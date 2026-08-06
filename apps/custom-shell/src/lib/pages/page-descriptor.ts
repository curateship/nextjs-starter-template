/**
 * What one public page says about itself.
 *
 * A public page is two files: the route, and a `*.page.ts` beside it holding
 * one of these. The registry (`page-registry.ts`) finds every declaration
 * automatically, so adding a page never means editing a list somewhere else —
 * drop the file in and the page is known everywhere at once. Everything that
 * needs to know what the public pages are — the dashboard, the on/off switch,
 * the SEO fields, the public menu, the sitemap — reads these declarations.
 */

/**
 * Which frame the page is drawn in: `"marketing"` for the wide public pages
 * (the front page, pricing), `"card"` for the small centred ones (sign-in and
 * friends). Until the layout task lands this is a label only — it changes
 * nothing about how a page looks.
 */
export type PageLayout = "marketing" | "card"

/** What a page's `*.page.ts` file writes down about it. */
export type PageDeclaration = {
  /**
   * The page's address, matching its route file exactly — `"/pricing"` for
   * `src/routes/pricing.tsx`. Two declarations claiming the same address are
   * refused out loud when the list is built.
   */
  path: string
  /** What an admin sees this page called in the pages dashboard. */
  name: string
  /** One line saying what the page is for. */
  summary: string
  /**
   * Whether an admin may switch this page off. Defaults to true. The front
   * page and the sign-in family set it false — an app with no front door and
   * no way in is broken, not configured.
   */
  canSwitchOff?: boolean
  /** The frame the page is drawn in. Defaults to `"card"`. */
  layout?: PageLayout
}

/**
 * A declaration after the registry has filled in the blanks: every default
 * resolved, plus where the page came from.
 */
export type PageDescriptor = {
  path: string
  name: string
  summary: string
  canSwitchOff: boolean
  layout: PageLayout
  /**
   * Whether the shell ships this page or the app built on the shell added it.
   * Filled in by the registry, never written by hand — a declaration file has
   * no say in it.
   */
  source: "shell" | "app"
}

/** Identity helper so declaration literals stay fully typed where they are written. */
export function definePage(declaration: PageDeclaration): PageDeclaration {
  return declaration
}
