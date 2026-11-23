import path from "node:path"
import { fileURLToPath } from "node:url"

import { build } from "esbuild"

import { workerFileUrls } from "./worker-file-urls.mjs"
import { workerPageRegistry } from "./worker-page-registry.mjs"

/**
 * Builds the social browser worker into a file Node can run.
 *
 * **Why this is a separate script and not one more entry in
 * `build-worker.mjs`.** That file came from the shell and an app never edits a
 * shell file: an edited one conflicts on every future shell merge, forever.
 * Trade took the other road and added its engine's entry there, so
 * `scripts/build-worker.mjs` is a fork it will reconcile by hand every time.
 * A new file of our own costs this duplicated settings block and nothing else.
 *
 * The two plugins and every esbuild setting are deliberately the same as the
 * shell's, because they encode things that were learned the hard way:
 * `packages: "external"` is not a size choice but the only thing that works
 * (`pg` and `argon2` load native binaries and cannot be inlined), stylesheets
 * are dropped because Node cannot open one, and the banner builds a `require`
 * an ESM bundle does not have. If the shell's copy changes, this should be
 * read beside it.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const outdir = path.join(root, "worker/dist")

await build({
  plugins: [workerPageRegistry(root), workerFileUrls(root, outdir)],
  entryPoints: [path.join(root, "worker/src/social-browser.ts")],
  outdir,
  outExtension: { ".js": ".mjs" },
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: true,
  sourcesContent: false,
  packages: "external",
  alias: {
    "@": path.join(root, "src"),
    // `lucide-react` ships no "exports" map, so Node cannot find the
    // extensionless subpath that every bundler resolves happily.
    "lucide-react/dynamic": "lucide-react/dynamic.mjs",
  },
  banner: {
    js: "import { createRequire as __bannerCreateRequire } from 'node:module'; const require = __bannerCreateRequire(import.meta.url);",
  },
  logLevel: "info",
})
