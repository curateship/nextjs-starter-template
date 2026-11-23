import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The Guides page's one declaration. A guide's own page at /guides/<address>
 * follows this page's on/off switch rather than having one of its own, the
 * same way a post follows the Posts page's.
 *
 * Declaring it here is also what stops an admin writing a page at /guides: the
 * written-page check refuses any address a declared page already answers on.
 *
 * `source: "app"` is left out for the reason `directory.page.ts` gives.
 */
export default definePage({
  path: "/guides",
  name: "Guides",
  summary: "This site's published guides, from Admin → Listings → Guides.",
  layout: "marketing",
})
