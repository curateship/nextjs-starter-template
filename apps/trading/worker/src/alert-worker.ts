import { randomUUID } from "node:crypto"
import { setMaxListeners } from "node:events"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()
// One intentional Hyperliquid trade listener per market.
setMaxListeners(0)

const { AlertSupervisor } = await import("./alerts/supervisor")
const { WorkerHeartbeat } = await import("./heartbeat")
const { acquireLeadership } = await import("./leadership")
const { WorkerRuntimeController } = await import("./runtime-control")

const workerId = randomUUID()
let role: "leader" | "standby" = "standby"
const runtime = new WorkerRuntimeController(
  "alert",
  () => new AlertSupervisor()
)
const heartbeat = new WorkerHeartbeat(workerId, "alert", "alert-1", () => ({
  role,
  ...runtime.meta(),
}))

console.log(`alert worker ${workerId} starting`)
heartbeat.start()
const leadershipConnection = await acquireLeadership("alert")
role = "leader"
console.log("alert worker: leader lock acquired")
await runtime.start()
console.log("alert worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`alert worker received ${signal}, shutting down`)
  heartbeat.stop()
  try {
    await runtime.stop()
  } catch (error) {
    console.error("alert worker: shutdown cleanup failed", error)
  } finally {
    await leadershipConnection.end().catch(() => {})
    process.exit(0)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
