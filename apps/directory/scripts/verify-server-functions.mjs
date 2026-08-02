#!/usr/bin/env node
/**
 * Reports how many server functions the built server can actually run.
 *
 * Run it by hand after a build: `node scripts/verify-server-functions.mjs`.
 *
 * THIS IS A DIAGNOSTIC FOR A LIVE, UNFIXED BUG. The RSC build writes its
 * server-function lookup table part-way through, from an earlier scan. Anything
 * reached only through the wildcard screen loader in src/lib/page-renderer.tsx
 * is transformed after that and never makes it in. Calling one of those in
 * production throws before the handler runs: the browser gets a bare HTTP 500
 * and the screen shows nothing. Today that is 19 of 314, which is why every
 * admin list screen is empty in production while public pages are fine.
 *
 * It is NOT wired into `npm run build`, deliberately. The obvious fix — a module
 * that globs every action file so they all land in the SSR graph — was tried and
 * is worse: it reorders the server bundle so drizzle-orm's chunk initialises
 * before what it extends, and EVERY page 500s with "Class extends value
 * undefined". That took the whole site down on 1 Aug 2026 and was reverted. A
 * real fix has to get the modules registered without dragging them into the root
 * chunk — most likely statically discoverable screen imports in page-renderer,
 * replacing the glob.
 *
 * Do not re-enable this as a build gate until that fix exists, or the build will
 * simply refuse to produce any image at all.
 */
import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

// fileURLToPath, not .pathname: a checkout under a path with a space in it comes
// back percent-encoded and every read then misses.
const OUTPUT_DIR = fileURLToPath(new URL("../.output/", import.meta.url))
const SERVER_DIR = join(OUTPUT_DIR, "server")
const CLIENT_DIR = join(OUTPUT_DIR, "public", "assets")

const FUNCTION_ID = /\b[0-9a-f]{64}\b/g
const REGISTERED_ENTRY = /"([0-9a-f]{64})":\s*\{\s*functionName:\s*"([^"]+)"/g

function walk(dir) {
  let files = []
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    if (statSync(path).isDirectory()) files = files.concat(walk(path))
    else if (path.endsWith(".mjs") || path.endsWith(".js")) files.push(path)
  }
  return files
}

function fail(message) {
  console.error(`\nverify-server-functions: ${message}\n`)
  process.exit(1)
}

let serverFiles
try {
  serverFiles = walk(SERVER_DIR)
} catch {
  fail(`no build output at ${SERVER_DIR} — run the build first`)
}

// The lookup table the server consults at request time: id -> handler importer.
const registered = new Map()
for (const file of serverFiles) {
  const source = readFileSync(file, "utf8")
  for (const match of source.matchAll(REGISTERED_ENTRY)) {
    registered.set(match[1], match[2])
  }
}

if (registered.size === 0) {
  fail("found no server-function lookup table in the build output — the shape this check looks for has changed, so it is no longer protecting anything")
}

// Every id the browser bundle can ask for.
const called = new Set()
for (const file of walk(CLIENT_DIR)) {
  for (const id of readFileSync(file, "utf8").matchAll(FUNCTION_ID)) {
    called.add(id[0])
  }
}

const missing = [...called].filter((id) => !registered.has(id))

if (missing.length > 0) {
  console.error(
    `\nverify-server-functions: the browser can call ${called.size} server functions but the server only knows ${registered.size}.`
  )
  console.error(`${missing.length} would return HTTP 500 with no explanation:\n`)
  for (const id of missing.slice(0, 10)) console.error(`  ${id}`)
  if (missing.length > 10) console.error(`  …and ${missing.length - 10} more`)
  fail("see the note at the top of this file — this is the known unfixed bug, not a new one")
}

console.log(
  `verify-server-functions: ${registered.size} server functions registered, all ${called.size} the browser calls are reachable.`
)
