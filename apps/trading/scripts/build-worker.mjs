import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const entries = {
  bot: "index.ts",
  "whale-scanner": "whale-scanner-worker.ts",
  "market-scanner": "market-scanner-worker.ts",
  alert: "alert-worker.ts",
  backtest: "backtest-worker.ts",
}
const requested = process.argv[2]
const targets = requested ? [requested] : Object.keys(entries)

for (const targetName of targets) {
  const entry = entries[targetName]
  if (!entry) throw new Error(`Unknown worker "${targetName}"`)
  await build({
    entryPoints: [path.join(root, "worker/src", entry)],
    outfile: path.join(root, "worker/dist", `${targetName}.mjs`),
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    sourcemap: true,
    alias: { "@": path.join(root, "src") },
    // Native/binary deps stay external and come from node_modules at runtime.
    external: ["pg", "pg-native", "argon2"],
    banner: {
      js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
    },
    logLevel: "info",
  })
}
