import { randomUUID } from "node:crypto"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()

// Imports that read env (db pool, master key) must come after loadWorkerEnv,
// hence the dynamic imports below.
const { BotWorkerService } = await import("./bot-worker-service")
const { WorkerHeartbeat } = await import("./heartbeat")
const { acquireLeadership } = await import("./leadership")
const { WorkerRuntimeController } = await import("./runtime-control")
const { TradingNotificationSyncService } =
  await import("./trading-notification-sync-service")
const { WorkerWatchdog } = await import("./watchdog")

const WORKER_VERSION = "0.1.0"

const workerId = randomUUID()
console.log(`bot worker ${workerId} starting (v${WORKER_VERSION})`)
console.log(`network default: ${process.env.HL_NETWORK ?? "testnet"}`)

let role: "leader" | "standby" = "standby"
const runtime = new WorkerRuntimeController("bot", () => new BotWorkerService())
const watchdog = new WorkerWatchdog("bot")
const heartbeat = new WorkerHeartbeat(workerId, "bot", WORKER_VERSION, () => ({
  role,
  ...runtime.meta(),
  ...watchdog.meta(),
}))
heartbeat.start()
const leadershipConnection = await acquireLeadership("bot")
role = "leader"
console.log("bot worker: leader lock acquired")
const notificationSync = new TradingNotificationSyncService()
await runtime.start()
await notificationSync.start()
watchdog.start()
console.log("bot worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`bot worker received ${signal}, shutting down`)
  heartbeat.stop()
  watchdog.stop()
  notificationSync.stop()
  try {
    await runtime.stop()
  } catch (error) {
    console.error("bot worker: shutdown cleanup failed", error)
  } finally {
    await leadershipConnection.end().catch(() => {})
    process.exit(0)
  }
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
