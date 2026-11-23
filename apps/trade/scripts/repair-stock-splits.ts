/**
 * Refolds every market that has a stock split on record under the current
 * split rules (`workspace/docs/charts/candle-store.md`, "Stock splits").
 *
 *   set -a; source .env.local; set +a
 *   npx tsx --tsconfig tsconfig.app.json scripts/repair-stock-splits.ts
 *
 * Use `.env.live` in place of `.env.local` for the live database.
 *
 * Safe to run again: a market already right finds the same splits and keeps
 * the same prices.
 */
import { db } from "@/server/db"
import { repairStoredSplits } from "@/server/trade/candle-store"
import { tradeCandleSplits } from "@/server/trade/schema"

const markets = await db
  .selectDistinct({ marketKey: tradeCandleSplits.marketKey })
  .from(tradeCandleSplits)

for (const { marketKey } of markets) {
  const found = await repairStoredSplits(marketKey, db)
  console.info(
    `${marketKey}: ${
      found
        .map(
          (split) =>
            `${new Date(split.at).toISOString().slice(0, 10)} x${split.ratio}`
        )
        .join(", ") || "no splits"
    }`
  )
}
process.exit(0)
