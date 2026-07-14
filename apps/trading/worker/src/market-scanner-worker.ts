import { randomUUID } from "node:crypto"
import { setMaxListeners } from "node:events"

import { loadWorkerEnv } from "./env"

loadWorkerEnv()
// One intentional Hyperliquid trade listener per market.
setMaxListeners(0)

const { MarketScannerSupervisor } = await import("./market-scanner")
const { MarketScannerHeartbeat } = await import(
  "./market-scanner/heartbeat"
)
const { acquireMarketScannerLeadership } = await import(
  "./market-scanner/leadership"
)

console.log("market scanner worker starting")
const leadershipConnection = await acquireMarketScannerLeadership()
console.log("market scanner leader lock acquired")

const scanner = new MarketScannerSupervisor()
await scanner.start()
const heartbeat = new MarketScannerHeartbeat(randomUUID(), () => scanner.meta())
heartbeat.start()
console.log("market scanner worker ready")

let shuttingDown = false
async function shutdown(signal: string) {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`market scanner received ${signal}, shutting down`)
  heartbeat.stop()
  await scanner.stop()
  await leadershipConnection.end().catch(() => {})
  process.exit(0)
}

process.on("SIGINT", () => void shutdown("SIGINT"))
process.on("SIGTERM", () => void shutdown("SIGTERM"))
