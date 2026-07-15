import { and, eq } from "drizzle-orm"

import type { WorkerKind } from "@/lib/workers"
import { db, type CustomShellDb } from "@/server/db"
import { tradingWorkerControls } from "@/server/schema"
import { now } from "@/server/util"

export async function getWorkerControl(
  kind: WorkerKind,
  database: CustomShellDb = db
) {
  const [control] = await database
    .select()
    .from(tradingWorkerControls)
    .where(eq(tradingWorkerControls.kind, kind))
    .limit(1)
  if (!control) throw new Error(`Worker control is missing for ${kind}`)
  return control
}

export async function listWorkerControls(database: CustomShellDb = db) {
  return database.select().from(tradingWorkerControls)
}

export async function setWorkerEnabled(
  kind: WorkerKind,
  enabled: boolean,
  database: CustomShellDb = db
) {
  const [control] = await database
    .update(tradingWorkerControls)
    .set({ enabled, paused: false, updatedAt: now() })
    .where(eq(tradingWorkerControls.kind, kind))
    .returning()
  if (!control) throw new Error(`Worker control is missing for ${kind}`)
  return control
}

export async function setWorkerPaused(
  kind: WorkerKind,
  paused: boolean,
  database: CustomShellDb = db
) {
  const [control] = await database
    .update(tradingWorkerControls)
    .set({ paused, updatedAt: now() })
    .where(
      paused
        ? and(
            eq(tradingWorkerControls.kind, kind),
            eq(tradingWorkerControls.enabled, true)
          )
        : eq(tradingWorkerControls.kind, kind)
    )
    .returning()
  if (!control) {
    const current = await getWorkerControl(kind, database)
    if (!current.enabled && paused) {
      throw new Error("Turn the worker on before pausing it")
    }
    throw new Error(`Worker control could not be updated for ${kind}`)
  }
  return control
}
