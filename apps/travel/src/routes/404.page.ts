import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The one page with no route file of its own. It is not served from an address
 * so much as *by* every address the app does not have — the router draws it
 * whenever nothing matches, and a switched-off page answers with it too.
 *
 * `/404` is written down here so it still appears on the Pages screen with a
 * description like any other page, and so the screen's Open button previews
 * it: `/404` is itself an address the app does not have, so opening it shows
 * exactly what a visitor would see.
 */
export default definePage({
  path: "/404",
  name: "Page not found",
  summary:
    "What any address the app does not have shows, and what a switched-off page answers with.",
  // There is no version of this app that does not need somewhere to send a
  // dead link.
  canSwitchOff: false,
})
