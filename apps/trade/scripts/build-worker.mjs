import path from "node:path"
import { fileURLToPath } from "node:url"
import { copyFile } from "node:fs/promises"

import { build } from "esbuild"

/**
 * Builds the background worker and its health check into files Node can run.
 *
 * Both import the app's own server code, which is written against the `@/`
 * alias — so neither can simply be handed to Node. Bundling resolves the alias
 * and leaves two self-contained files with no build tooling needed where they
 * run.
 *
 * **Only our own code is bundled.** `packages: "external"` leaves every
 * dependency as a plain import, so the image's pruned `node_modules` supplies
 * them at runtime exactly as it does for the website.
 *
 * That is not a size choice, it is the only thing that works. `pg` and
 * `argon2` load native binaries and cannot be inlined at all. And the reach is
 * wider than it looks: the engine names a step through the node registry, the
 * registry also draws the palette, and account code the jobs touch imports
 * TanStack Start's server runtime — which is stitched together by Vite from
 * virtual modules that do not exist outside a Vite build. Bundling that is not
 * possible; leaving it as an import is fine, because nothing on the pass ever
 * calls into it.
 *
 * The one alias below is a package with no `exports` map: bundlers guess the
 * missing extension and Node does not.
 *
 * Trade adds one entry to the shell's two: the trading engine
 * (`index.ts` → `trade.mjs`), its own program with its own image
 * (`worker/Dockerfile`), built with exactly the same settings.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outdir = path.join(root, "worker/dist")

// When this build ran and, inside a Coolify build, which commit it was given
// (`SOURCE_COMMIT`, declared in worker/Dockerfile). The engine reads it back
// through `src/lib/build-stamp.ts` and refuses the trading lock when a newer
// build has already led, so a container built weeks ago cannot trade during
// a redeploy. The website gets the same stamp from vite.config.ts.
const buildStamp = {
  builtAt: Date.now(),
  commit: process.env.SOURCE_COMMIT?.trim() || null,
}

await build({
  entryPoints: {
    worker: path.join(root, "worker/src/worker.ts"),
    health: path.join(root, "worker/src/health.ts"),
    trade: path.join(root, "worker/src/index.ts"),
  },
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  sourcesContent: false,
  packages: "external",
  define: {
    __TRADE_BUILD_STAMP__: JSON.stringify(JSON.stringify(buildStamp)),
  },
  alias: {
    "@": path.join(root, "src"),
    // `lucide-react` ships no "exports" map, so Node cannot find the
    // extensionless subpath that every bundler resolves happily.
    "lucide-react/dynamic": "lucide-react/dynamic.mjs",
  },
  // Some dependencies still expect CommonJS's `require`; an ESM bundle has
  // none, so one is made from the module's own url. The import is renamed
  // because the banner sits outside esbuild's scope tracking: a source file
  // that imports `createRequire` under its own name (the Dukascopy client
  // does) would otherwise be declared twice and Node would refuse the bundle.
  banner: {
    js: "import { createRequire as __bannerCreateRequire } from 'node:module'; const require = __bannerCreateRequire(import.meta.url);",
  },
  logLevel: "info",
})

await copyFile(
  path.join(
    root,
    "src/server/protocols/lighter/signer/assets/lighter-signer.wasm"
  ),
  path.join(outdir, "lighter-signer.wasm")
)
