import { randomUUID } from "node:crypto"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()

const { BacktestQueueWorker } = await import("./backtest/queue")
const { WorkerHeartbeat } = await import("./heartbeat")
const { acquireLeadership } = await import("./leadership")
const { WorkerRuntimeController } = await import("./runtime-control")
const { WorkerWatchdog } = await import("./watchdog")

const workerId = randomUUID()
let role: "leader" | "standby" = "standby"
const runtime = new WorkerRuntimeController(
  "backtest",
  () => new BacktestQueueWorker(workerId)
)
const watchdog = new WorkerWatchdog("backtest")
const heartbeat = new WorkerHeartbeat(
  workerId,
  "backtest",
  "backtest-1",
  () => ({ role, ...runtime.meta(), ...watchdog.meta() })
)

console.log(`backtest worker ${workerId} starting`)
heartbeat.start()
const leadershipConnection = await acquireLeadership("backtest")
role = "leader"
console.log("backtest worker: leader lock acquired")
await runtime.start()
watchdog.start()
console.log("backtest worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`backtest worker received ${signal}, shutting down`)
  heartbeat.stop()
  watchdog.stop()
  try {
    await runtime.stop()
  } catch (error) {
    console.error("backtest worker: shutdown cleanup failed", error)
  } finally {
    await leadershipConnection.end().catch(() => {})
    process.exit(0)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
