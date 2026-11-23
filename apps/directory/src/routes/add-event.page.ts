import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The public Suggest an event form.
 *
 * A page of its own, so a site can publish its events without taking
 * suggestions. It starts on, the same as Add your listing, and the Events
 * page's "Suggest an event" button shows only while it is on. Turning it off
 * on the Pages screen is how a site says no, and the form's endpoint then
 * refuses too.
 *
 * `source: "app"` is left out for the reason `add-listing.page.ts` gives.
 */
export default definePage({
  path: "/add-event",
  name: "Suggest an event",
  summary:
    "The public form for suggesting an event. Every suggestion waits in Admin for a yes or a no.",
  layout: "marketing",
})
