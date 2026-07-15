import { spawn } from "node:child_process"
import { watch } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const RESTART_DELAY_MS = 1_000

export function superviseWorker({
  spawnWorker,
  schedule = setTimeout,
  cancelSchedule = clearTimeout,
  logError = console.error,
  onStopped = () => {},
}) {
  let child = null
  let restartTimer = null
  let restartRequested = false
  let stopping = false

  function start() {
    if (stopping) return
    restartTimer = null
    child = spawnWorker()
    let handled = false

    const handleExit = (code, signal) => {
      if (handled) return
      handled = true
      child = null
      if (stopping) {
        onStopped()
        return
      }
      if (!restartRequested) {
        logError(
          `Market Scanner crashed${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}; restarting.`
        )
      }
      restartRequested = false
      restartTimer = schedule(start, RESTART_DELAY_MS)
    }

    child.once("exit", handleExit)
    child.once("error", (error) => {
      logError("Market Scanner failed to start; restarting.", error)
      handleExit(1, null)
    })
  }

  start()

  return {
    restart() {
      if (stopping || restartRequested) return
      if (restartTimer !== null) {
        cancelSchedule(restartTimer)
        restartTimer = schedule(start, RESTART_DELAY_MS)
        return
      }
      if (!child) return
      restartRequested = true
      child.kill("SIGTERM")
    },
    stop(signal = "SIGTERM") {
      if (stopping) return
      stopping = true
      if (restartTimer !== null) {
        cancelSchedule(restartTimer)
        restartTimer = null
      }
      if (child) child.kill(signal)
      else onStopped()
    },
  }
}

function spawnMarketScanner(mode) {
  if (mode === "--dev") {
    const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"))
    return spawn(
      process.execPath,
      [
        tsxCli,
        "--tsconfig",
        "worker/tsconfig.json",
        "worker/src/market-scanner-worker.ts",
      ],
      { cwd: root, stdio: "inherit" }
    )
  }
  return spawn(process.execPath, ["worker/dist/market-scanner.mjs"], {
    cwd: root,
    stdio: "inherit",
  })
}

function run() {
  const mode = process.argv[2]
  if (mode !== "--dev" && mode !== "--production") {
    throw new Error("Expected --dev or --production")
  }

  let stopped = false
  const supervisor = superviseWorker({
    spawnWorker: () => spawnMarketScanner(mode),
    onStopped: () => process.exit(0),
  })
  const watchers =
    mode === "--dev" ? watchWorkerSources(supervisor.restart) : []

  function stop(signal) {
    if (stopped) return
    stopped = true
    for (const watcher of watchers) watcher.close()
    supervisor.stop(signal)
  }

  process.on("SIGINT", () => stop("SIGINT"))
  process.on("SIGTERM", () => stop("SIGTERM"))
}

function watchWorkerSources(restart) {
  let debounceTimer = null
  const onChange = (_event, filename) => {
    if (!filename || !/\.[cm]?[jt]sx?$/.test(filename)) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(restart, 150)
  }
  return ["worker/src", "src/lib", "src/server"].map((folder) =>
    watch(path.join(root, folder), { recursive: true }, onChange)
  )
}

if (path.resolve(process.argv[1] || "") === fileURLToPath(import.meta.url)) {
  run()
}
