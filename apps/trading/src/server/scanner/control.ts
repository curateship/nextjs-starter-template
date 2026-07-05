import { eq } from "drizzle-orm"

import { db } from "@/server/db"
import { scannerControl } from "@/server/schema"
import { now } from "@/server/util"

// Shared by the web API and the worker — must stay free of web-server and
// React imports (the worker imports this module).

const CONTROL_KEY = "default"

export async function isScannerPaused(): Promise<boolean> {
  const [row] = await db
    .select({ paused: scannerControl.paused })
    .from(scannerControl)
    .where(eq(scannerControl.id, CONTROL_KEY))
    .limit(1)
  return row?.paused ?? false
}

export async function setScannerPaused(paused: boolean): Promise<boolean> {
  await db
    .insert(scannerControl)
    .values({ id: CONTROL_KEY, paused, updatedAt: now() })
    .onConflictDoUpdate({
      target: scannerControl.id,
      set: { paused, updatedAt: now() },
    })
  return paused
}
