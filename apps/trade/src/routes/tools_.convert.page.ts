import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The price converter. Declaring it puts `/tools/convert` in the sitemap and
 * on the Pages dashboard, where its switch also covers every coin's page
 * under it. `freeToolHead` turns `name` and `summary` into its title and
 * share preview.
 */
export default definePage({
  path: "/tools/convert",
  name: "Price converter",
  summary:
    "Coins into US dollars and dollars into coins at the live Hyperliquid price, with where the price came from and how old it is.",
  layout: "marketing",
})
