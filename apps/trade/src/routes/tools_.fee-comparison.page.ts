import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The fee comparison. Declaring it puts it in the sitemap and on the Pages
 * dashboard; `freeToolHead` turns `name` and `summary` into its title and
 * share preview.
 */
export default definePage({
  path: "/tools/fee-comparison",
  name: "Fee comparison",
  summary:
    "What your trading costs in fees each month on Hyperliquid, Lighter, Aster, KuCoin, Phemex, ApeX, edgeX and Binance, cheapest first, with each exchange's own fee page.",
  layout: "marketing",
})
