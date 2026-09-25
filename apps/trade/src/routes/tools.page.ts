import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The front door to every free tool. Declaring it is what puts `/tools` in
 * the sitemap, on the Pages dashboard with an on/off switch, and in the
 * share preview: the root route turns `name` and `summary` into the title and
 * the description social sites show.
 *
 * `source: "app"` is left out for the reason written on `traders.page.ts`.
 */
export default definePage({
  path: "/tools",
  name: "Free tools",
  summary:
    "Free trading calculators, live market pages, wallet tools and price alerts. No account needed.",
  layout: "marketing",
})
