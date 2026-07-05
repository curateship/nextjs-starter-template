import { build } from "esbuild"
import path from "node:path"
import { fileURLToPath } from "node:url"

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await build({
  entryPoints: [path.join(root, "worker/src/index.ts")],
  outfile: path.join(root, "worker/dist/index.mjs"),
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
