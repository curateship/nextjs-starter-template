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

/**
 * Who ships a page: `"shell"` for the pages this template comes with,
 * `"app"` for the ones an app built on top of it added itself.
 *
 * It is a label and nothing more — see `PageDescriptor["source"]` for what a
 * wrong answer costs.
 */
export type PageSource = "shell" | "app"

/** What a page's `*.page.ts` file writes down about it. */
export type PageDeclaration = {
  /**
   * The page's address, matching its route file exactly — `"/pricing"` for
   * `src/routes/pricing.tsx`. Two declarations claiming the same address are
   * refused out loud when the list is built.
   *
   * `/404` is the one address with no route file behind it: the not-found page
   * is drawn by the router for anything that does not match, so its address is
   * where you go to *see* it rather than where it is served from.
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
  /**
   * Who this page belongs to. Defaults to `"shell"`, so the shell's own pages
   * say nothing and an app writes one word — `source: "app"` — in the pages it
   * adds. Nothing works it out from the file path: an app's pages sit in
   * `src/routes` beside the shell's by design, so the declaration is the only
   * place that knows.
   */
  source?: PageSource
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
   *
   * **Nothing behaves differently on the strength of it.** It is shown on the
   * Pages dashboard so an admin can tell the two apart — they are maintained by
   * different people — and it changes no permission, no visibility and no way
   * of editing. So a wrong answer is a wrong caption and never a broken page:
   * a shell page that claimed `"app"` would be labelled when it should not be,
   * and an app page left at the default — much the commoner slip, since the
   * default is what you get by writing nothing — simply reads as the shell's,
   * exactly as every page does today.
   */
  source: PageSource
}

/** Identity helper so declaration literals stay fully typed where they are written. */
export function definePage(declaration: PageDeclaration): PageDeclaration {
  return declaration
}
