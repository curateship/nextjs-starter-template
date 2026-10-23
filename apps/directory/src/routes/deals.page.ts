import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The Deals page's one declaration. A deal's own page at /deals/<address>
 * follows this page's on/off switch rather than having one of its own, the
 * same way an event follows the Events page's.
 *
 * Declaring it here is also what stops an admin writing a page at /deals: the
 * written-page check refuses any address a declared page already answers on.
 *
 * `source: "app"` is left out for the reason `directory.page.ts` gives.
 */
export default definePage({
  path: "/deals",
  name: "Deals",
  summary: "This site's published deals, from Admin → Promotions.",
  layout: "marketing",
})
