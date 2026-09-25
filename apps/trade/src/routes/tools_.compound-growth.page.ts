import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The compound growth calculator. Declaring it puts it in the sitemap and on
 * the Pages dashboard; `freeToolHead` turns `name` and `summary` into its
 * title and share preview.
 */
export default definePage({
  path: "/tools/compound-growth",
  name: "Compound growth calculator",
  summary:
    "What a steady daily, weekly or monthly gain turns your money into, and what gain a money goal needs by a date. With losing days mixed in.",
  layout: "marketing",
})
