import path from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

/**
 * Builds the trading worker into one file it can be run from.
 *
 * The worker imports the same strategy code the website and the backtest use,
 * and that code is written against the `@/` alias — so it cannot simply be
 * handed to Node. Bundling resolves the alias and produces a single file with
 * no build tooling needed where it runs.
 *
 * `pg` stays external because it loads native bits at runtime; the image keeps
 * a pruned `node_modules` for exactly that.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

await build({
  entryPoints: [path.join(root, "worker/src/index.ts")],
  outfile: path.join(root, "worker/dist/trade.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  alias: { "@": path.join(root, "src") },
  external: ["pg", "pg-native"],
  // Some bundled packages still expect CommonJS's `require`; an ESM bundle has
  // none, so one is made from the module's own url.
  banner: {
    js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);",
  },
  logLevel: "info",
})
