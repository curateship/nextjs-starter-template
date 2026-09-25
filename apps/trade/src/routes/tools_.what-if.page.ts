import { definePage } from "@/lib/pages/page-descriptor"

/**
 * What if I had bought. Declaring it puts it in the sitemap and on the Pages
 * dashboard; `freeToolHead` turns `name` and `summary` into its title and
 * share preview.
 */
export default definePage({
  path: "/tools/what-if",
  name: "What if I had bought",
  summary:
    "What $1,000 of Bitcoin, Solana or another busy coin bought on a past day is worth now, and what buying every week would have added up to. From stored daily closing prices.",
  layout: "marketing",
})
