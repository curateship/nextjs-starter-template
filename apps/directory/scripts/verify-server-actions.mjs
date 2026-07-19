// Fails the build when the production bundle's server-action registry does not
// contain every 'use server' module in src/.
//
// @vitejs/plugin-rsc writes that registry before modules reached only through
// the screen glob in src/lib/page-renderer.tsx are transformed, so actions can
// go missing from a build that otherwise succeeds. The symptom is invisible
// until runtime: the page loads, then every call fails with "server reference
// not found '<id>'". src/lib/server-action-registry.ts works around it; this
// check is what stops the workaround from silently regressing.
//
// Runs after `vite build`, so a regression fails the Docker build and never
// reaches production.

import { readdirSync, readFileSync, statSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const appDirectory = dirname(dirname(fileURLToPath(import.meta.url)))
const sourceDirectory = join(appDirectory, "src")
const serverOutputDirectory = join(appDirectory, ".output", "server")

function walk(directory) {
  const entries = []
  for (const entry of readdirSync(directory)) {
    const path = join(directory, entry)
    if (statSync(path).isDirectory()) entries.push(...walk(path))
    else entries.push(path)
  }
  return entries
}

function findServerActionModules() {
  return walk(sourceDirectory)
    .filter((path) => path.endsWith(".ts") || path.endsWith(".tsx"))
    .filter((path) => /^\s*['"]use server['"]/.test(readFileSync(path, "utf8")))
}

function findRegistryEntries() {
  const files = walk(serverOutputDirectory).filter((path) => path.endsWith(".mjs"))
  for (const file of files) {
    const code = readFileSync(file, "utf8")
    if (!code.includes("server_references_default")) continue
    const registry = code.slice(code.indexOf("server_references_default"))
    return {
      file,
      count: [...registry.matchAll(/"[a-f0-9]{12}": async/g)].length,
    }
  }
  return null
}

const modules = findServerActionModules()
const registry = findRegistryEntries()

if (!registry) {
  console.error(
    `\nServer action check FAILED: no action registry found in ${serverOutputDirectory}.\n` +
      `Expected a bundled module containing 'server_references_default'.\n`
  )
  process.exit(1)
}

if (registry.count !== modules.length) {
  console.error(
    `\nServer action check FAILED\n\n` +
      `  'use server' modules in src/: ${modules.length}\n` +
      `  registered in the build:      ${registry.count}\n\n` +
      `Actions missing from the registry throw "server reference not found" at\n` +
      `runtime, which takes down every page that calls one — the build itself\n` +
      `gives no warning. See src/lib/server-action-registry.ts.\n\n` +
      `Most likely cause: a new 'use server' file outside src/lib/actions/, which\n` +
      `the glob in that file does not cover. Extend the glob to include it.\n`
  )
  process.exit(1)
}

console.log(
  `Server action check passed: ${registry.count} of ${modules.length} actions registered.`
)
