import { randomUUID } from "node:crypto"
import { setMaxListeners } from "node:events"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()
setMaxListeners(0)

const { WorkerHeartbeat } = await import("./heartbeat")
const { acquireLeadership } = await import("./leadership")
const { WorkerRuntimeController } = await import("./runtime-control")
const { ScannerSupervisor } = await import("./scanner")
const { WorkerWatchdog } = await import("./watchdog")

const workerId = randomUUID()
let role: "leader" | "standby" = "standby"
const runtime = new WorkerRuntimeController(
  "whale-scanner",
  () => new ScannerSupervisor()
)
const watchdog = new WorkerWatchdog("whale-scanner")
const heartbeat = new WorkerHeartbeat(
  workerId,
  "whale-scanner",
  "whale-scanner-1",
  () => ({ role, ...runtime.meta(), ...watchdog.meta() })
)

console.log(`whale scanner worker ${workerId} starting`)
heartbeat.start()
const leadershipConnection = await acquireLeadership("whale-scanner")
role = "leader"
console.log("whale scanner worker: leader lock acquired")
await runtime.start()
watchdog.start()
console.log("whale scanner worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`whale scanner worker received ${signal}, shutting down`)
  heartbeat.stop()
  watchdog.stop()
  try {
    await runtime.stop()
  } catch (error) {
    console.error("whale scanner worker: shutdown cleanup failed", error)
  } finally {
    await leadershipConnection.end().catch(() => {})
    process.exit(0)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
