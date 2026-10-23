import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The Events page's one declaration. An event's own page at /events/<address>
 * follows this page's on/off switch rather than having one of its own, the
 * same way a post follows the Posts page's.
 *
 * Declaring it here is also what stops an admin writing a page at /events: the
 * written-page check refuses any address a declared page already answers on.
 *
 * `source: "app"` is left out for the reason `directory.page.ts` gives.
 */
export default definePage({
  path: "/events",
  name: "Events",
  summary: "This site's published events.",
  layout: "marketing",
})
