import { sql } from "drizzle-orm"

import { tradeSmartLadders } from "@/server/trade/schema"

/**
 * The small plan fact needed by `isWorkingFlowOrder`.
 *
 * Keep this path beside the shared TypeScript reader in `flow-run.ts` when a
 * future plan changes where rung status lives. PostgreSQL works the answer out
 * beside the row, so the full plan never crosses the database connection.
 */
export const hasWaitingDcaRungSql = sql<boolean>`
  ${tradeSmartLadders.plan} @> ${JSON.stringify({ rungs: [{ status: "waiting" }] })}::jsonb
`
