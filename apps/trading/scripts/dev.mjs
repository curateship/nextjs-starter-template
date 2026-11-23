import { spawn } from "node:child_process"

const npm = process.platform === "win32" ? "npm.cmd" : "npm"
const detached = process.platform !== "win32"
const children = [
  start("Trading app", ["run", "dev:app"]),
  start("Bot Worker", ["run", "bot-worker:dev"]),
  start("Whale Scanner", ["run", "whale-scanner:dev"]),
  start("Market Scanner", ["run", "market-scanner:dev"]),
  start("Alert Worker", ["run", "alert-worker:dev"]),
  start("Backtest Worker", ["run", "backtest-worker:dev"]),
]

let stopping = false
let requestedExitCode = 0

for (const child of children) {
  child.on("error", (error) => {
    console.error(`Failed to start ${child.label}.`, error)
    shutdown("SIGTERM", 1)
  })
  child.on("exit", (code, signal) => {
    if (!stopping) {
      console.error(
        `${child.label} stopped${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}.`
      )
      shutdown("SIGTERM", code || 1)
      return
    }
    finishIfStopped()
  })
}

process.on("SIGINT", () => shutdown("SIGINT", 0))
process.on("SIGTERM", () => shutdown("SIGTERM", 0))

function start(label, args) {
  const child = spawn(npm, args, {
    detached,
    stdio: "inherit",
  })
  child.label = label
  return child
}

function shutdown(signal, exitCode) {
  if (stopping) return
  stopping = true
  requestedExitCode = exitCode

  for (const child of children) {
    if (child.exitCode !== null || child.signalCode !== null) continue
    if (detached && child.pid) {
      try {
        process.kill(-child.pid, signal)
      } catch {
        child.kill(signal)
      }
    } else {
      child.kill(signal)
    }
  }

  const forceStop = setTimeout(() => {
    for (const child of children) {
      if (child.exitCode !== null || child.signalCode !== null) continue
      if (detached && child.pid) {
        try {
          process.kill(-child.pid, "SIGKILL")
        } catch {
          child.kill("SIGKILL")
        }
      } else {
        child.kill("SIGKILL")
      }
    }
  }, 5_000)
  forceStop.unref()
  finishIfStopped()
}

function finishIfStopped() {
  if (
    stopping &&
    children.every(
      (child) => child.exitCode !== null || child.signalCode !== null
    )
  ) {
    process.exit(requestedExitCode)
  }
}
