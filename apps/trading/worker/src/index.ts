import { randomUUID } from "node:crypto"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()

// Imports that read env (db pool, master key) must come after loadWorkerEnv,
// hence the dynamic imports below.
const { CommandListener } = await import("./command-listener")
const { Heartbeat } = await import("./heartbeat")
const { PaperAccountEngine } = await import("./paper-account-engine")
const { SnapshotPoller } = await import("./snapshot-poller")
const { BotSupervisor } = await import("./supervisor")
const { acquireLeadership } = await import("./leadership")

const WORKER_VERSION = "0.1.0"

const workerId = randomUUID()
console.log(`trading worker ${workerId} starting (v${WORKER_VERSION})`)
console.log(`network default: ${process.env.HL_NETWORK ?? "testnet"}`)

const leadershipConnection = await acquireLeadership()
console.log("leader lock acquired")

const supervisor = new BotSupervisor()
const heartbeat = new Heartbeat(workerId, WORKER_VERSION, () =>
  supervisor.meta()
)
const commandListener = new CommandListener((command) =>
  supervisor.handleCommand(command)
)
const snapshotPoller = new SnapshotPoller()
const paperEngine = new PaperAccountEngine()

heartbeat.start()
snapshotPoller.start()
await supervisor.start()
await commandListener.start()
await paperEngine.start()

console.log("trading worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`received ${signal}, shutting down`)
  heartbeat.stop()
  snapshotPoller.stop()
  await commandListener.stop()
  await paperEngine.stop()
  await supervisor.stop()
  await leadershipConnection.end().catch(() => {})
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
