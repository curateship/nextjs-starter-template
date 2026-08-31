import { createServerFn } from "@tanstack/react-start"
import { eq, sql } from "drizzle-orm"
import { z } from "zod"

import type { ActiveTradesSnapshot } from "@/lib/trade/dashboard/overview"
import { db } from "@/server/db"
import { adminGet, userPost } from "@/server/guards"
import { tradePrefs } from "@/server/trade/schema"
import { loadActiveTradesSnapshot } from "@/server/trade/trading-overview"

export type ActiveTradesHeaderSnapshot = {
  snapshot: ActiveTradesSnapshot
  headerProfitVisible: boolean
}

function readHeaderProfitVisible(value: unknown) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return true
  }
  const visible = (value as Record<string, unknown>).headerProfitVisible
  return typeof visible === "boolean" ? visible : true
}

async function loadHeaderProfitVisible(userId: string) {
  const [row] = await db
    .select({ panelLayouts: tradePrefs.panelLayouts })
    .from(tradePrefs)
    .where(eq(tradePrefs.userId, userId))
    .limit(1)
  return readHeaderProfitVisible(row?.panelLayouts)
}

async function saveHeaderProfitVisible(userId: string, visible: boolean) {
  const initial = JSON.stringify({
    legacyImported: false,
    current: {},
    named: [],
    headerProfitVisible: visible,
  })
  const stored = sql`case
    when jsonb_typeof(${tradePrefs.panelLayouts}) = 'object'
      then ${tradePrefs.panelLayouts}
    else '{}'::jsonb
  end`
  await db
    .insert(tradePrefs)
    .values({
      userId,
      panelLayouts: sql`${initial}::jsonb`,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: tradePrefs.userId,
      set: {
        panelLayouts: sql`jsonb_set(
          ${stored},
          '{headerProfitVisible}',
          ${JSON.stringify(visible)}::jsonb
        )`,
        updatedAt: new Date(),
      },
    })
}

const loadActiveTradesHeaderFn = createServerFn({ method: "GET" })
  .middleware([adminGet])
  .handler(async ({ context }): Promise<ActiveTradesHeaderSnapshot> => {
    const [snapshot, headerProfitVisible] = await Promise.all([
      loadActiveTradesSnapshot(context.user.id),
      loadHeaderProfitVisible(context.user.id),
    ])
    return { snapshot, headerProfitVisible }
  })

const saveHeaderProfitVisibilityFn = createServerFn({ method: "POST" })
  .middleware([userPost])
  .inputValidator(z.object({ visible: z.boolean() }))
  .handler(async ({ data, context }): Promise<{ saved: true }> => {
    await saveHeaderProfitVisible(context.user.id, data.visible)
    return { saved: true }
  })

export function loadActiveTradesHeader() {
  return loadActiveTradesHeaderFn()
}

export function saveHeaderProfitVisibility(visible: boolean) {
  return saveHeaderProfitVisibilityFn({ data: { visible } })
}
