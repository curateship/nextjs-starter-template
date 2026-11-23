import { definePage } from "@/lib/pages/page-descriptor"

/**
 * The wallet checker. Declaring it puts it in the sitemap and on the Pages
 * dashboard; `freeToolHead` turns `name` and `summary` into its title and
 * share preview.
 */
export default definePage({
  path: "/tools/wallet-checker",
  name: "Wallet checker",
  summary:
    "Paste any Hyperliquid wallet address and see what it really made and lost over the last 30 days and its whole history, worked out from the trades themselves.",
  layout: "marketing",
})
