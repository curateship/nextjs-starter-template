import { spawn } from "node:child_process"
import { watch } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const [label, entry] = process.argv.slice(2)
if (!label || !entry) throw new Error("Expected a worker label and entry file")

const tsxCli = fileURLToPath(import.meta.resolve("tsx/cli"))
let child = null
let stopping = false
let restarting = false
let debounceTimer = null

const watchers = ["worker/src", "src/lib", "src/server"].map((folder) =>
  watch(path.join(root, folder), { recursive: true }, (_event, filename) => {
    if (!filename || !/\.[cm]?[jt]sx?$/.test(filename)) return
    if (debounceTimer) clearTimeout(debounceTimer)
    debounceTimer = setTimeout(restart, 150)
  })
)

start()

process.on("SIGINT", () => stop("SIGINT"))
process.on("SIGTERM", () => stop("SIGTERM"))

function start() {
  child = spawn(
    process.execPath,
    [tsxCli, "--tsconfig", "worker/tsconfig.json", entry],
    { cwd: root, stdio: "inherit" }
  )
  child.once("error", (error) => {
    console.error(`${label} failed to start.`, error)
    process.exit(1)
  })
  child.once("exit", (code, signal) => {
    child = null
    if (stopping) {
      process.exit(0)
    } else if (restarting) {
      restarting = false
      start()
    } else {
      console.error(
        `${label} stopped${signal ? ` from ${signal}` : ` with code ${code ?? 1}`}.`
      )
      process.exit(code || 1)
    }
  })
}

function restart() {
  if (stopping || restarting) return
  restarting = true
  child?.kill("SIGTERM")
}

function stop(signal) {
  if (stopping) return
  stopping = true
  if (debounceTimer) clearTimeout(debounceTimer)
  for (const watcher of watchers) watcher.close()
  if (child) child.kill(signal)
  else process.exit(0)
}
