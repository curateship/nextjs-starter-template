import { timingSafeEqual } from "node:crypto"
import { createFileRoute } from "@tanstack/react-router"
import { desc } from "drizzle-orm"

import { pool, db } from "@/server/db"
import { workerHeartbeats } from "@/server/schema"

export const Route = createFileRoute("/api/metrics")({ server: { handlers: { GET: async ({ request }) => {
  const expected = process.env.POMODER_METRICS_TOKEN
  const actual = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "")
  if (!expected || !secureEqual(actual, expected)) return new Response("Unauthorized", { status: 401 })
  const [worker] = await db.select().from(workerHeartbeats).orderBy(desc(workerHeartbeats.lastSeenAt)).limit(1)
  const age = worker ? Math.max(0, (Date.now() - worker.lastSeenAt.getTime()) / 1_000) : -1
  return new Response(["# TYPE pomoder_up gauge", "pomoder_up 1", "# TYPE pomoder_db_pool_total gauge", `pomoder_db_pool_total ${pool.totalCount}`, "# TYPE pomoder_db_pool_waiting gauge", `pomoder_db_pool_waiting ${pool.waitingCount}`, "# TYPE pomoder_worker_heartbeat_age_seconds gauge", `pomoder_worker_heartbeat_age_seconds ${age}`, ""].join("\n"), { headers: { "Content-Type": "text/plain; version=0.0.4", "Cache-Control": "no-store" } })
} } } })

function secureEqual(actual: string | undefined, expected: string) { if (!actual) return false; const a = Buffer.from(actual); const b = Buffer.from(expected); return a.length === b.length && timingSafeEqual(a, b) }
