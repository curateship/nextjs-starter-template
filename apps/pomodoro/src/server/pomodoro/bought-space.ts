import { and, desc, eq } from "drizzle-orm"

import { getStripeSettings } from "@/server/billing/settings"
import { db, type CustomShellDb } from "@/server/db"
import { pomodoroPurchases } from "@/server/pomodoro/schema"
import { PURCHASES, SPACE_PRODUCT } from "@/lib/pomodoro/purchases"

/**
 * The extra space a member has bought and is still within its year of, in
 * bytes, and the last such year that has ended, for the line under Upload.
 */
export async function loadBoughtSpace(
  userId: string,
  database: CustomShellDb = db
) {
  const rows = await database
    .select({ endsAt: pomodoroPurchases.endsAt })
    .from(pomodoroPurchases)
    .where(
      and(
        eq(pomodoroPurchases.userId, userId),
        eq(pomodoroPurchases.product, SPACE_PRODUCT),
        eq(pomodoroPurchases.status, "paid"),
        await inCurrentStripeMode(database)
      )
    )
    .orderBy(desc(pomodoroPurchases.endsAt))
  const now = Date.now()
  const active = rows.filter((row) => row.endsAt && row.endsAt.getTime() > now)
  const lapsed = rows.find((row) => row.endsAt && row.endsAt.getTime() <= now)
  return {
    extraBytes: active.length * PURCHASES.space_10gb.bytes,
    endsAt: active[0]?.endsAt ?? null,
    lapsedAt: active.length ? null : (lapsed?.endsAt ?? null),
  }
}

/**
 * Only purchases paid in the Stripe mode the site uses now count, so a
 * test-card purchase made on sandbox keys stops counting once live keys are
 * switched on (audit, 10 Oct 2026).
 */
export async function inCurrentStripeMode(
  database: CustomShellDb | Parameters<Parameters<CustomShellDb["transaction"]>[0]>[0] = db
) {
  // The sandbox switch alone, read on the caller's own handle, so a check
  // inside a transaction never waits on a second connection.
  const settings = await getStripeSettings(database as CustomShellDb)
  return eq(pomodoroPurchases.livemode, !settings?.useSandbox)
}
