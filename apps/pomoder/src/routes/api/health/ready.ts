import { createFileRoute } from "@tanstack/react-router"
import { desc, sql } from "drizzle-orm"

import { db } from "@/server/db"
import { workerHeartbeats } from "@/server/schema"

export const Route = createFileRoute("/api/health/ready")({ server: { handlers: { GET: async () => {
  try {
    await db.execute(sql`select 1`)
    const [worker] = await db.select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1)
    const workerReady = Boolean(worker && Date.now() - worker.lastSeenAt.getTime() < 45_000)
    const requireWorker = process.env.POMODER_REQUIRE_WORKER === "true"
    return Response.json({ status: requireWorker && !workerReady ? "degraded" : "ok", database: "ok", worker: workerReady ? "ok" : "stale" }, { status: requireWorker && !workerReady ? 503 : 200 })
  } catch { return Response.json({ status: "unavailable", database: "failed" }, { status: 503 }) }
} } } })
