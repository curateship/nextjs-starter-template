import { readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"

/**
 * Writes the four rack files into `src/server/phones/rack-sources.gen.ts`, so
 * the website and the background worker both carry the exact files in `rack/`
 * (`workspace/docs/content-app.md`, "Workers and the build").
 *
 * Promo read them with Vite's `?raw` imports. The worker is built by esbuild,
 * which has no loader for a `.py` or `.sh` file, so the worker build failed on
 * them. A plain TypeScript file builds in both. `rack-sources.test.ts` fails
 * whenever a rack file and this file disagree, so after editing anything in
 * `rack/`, run `npm run rack:sources`.
 */

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")
const files = {
  iphone: "rack/iphone.py",
  install: "rack/install.sh",
  launcher: "rack/launcher.py",
  program: "rack/promo_rack.py",
}

const entries = await Promise.all(
  Object.entries(files).map(async ([key, file]) => `  ${key}: ${JSON.stringify(await readFile(path.join(root, file), "utf8"))},`)
)
const out = `// Written by scripts/write-rack-sources.mjs from the files in rack/. Do not edit:
// change the file in rack/ and run \`npm run rack:sources\`.
export const RACK_SOURCES = {
${entries.join("\n")}
} as const
`
await writeFile(path.join(root, "src/server/phones/rack-sources.gen.ts"), out)
console.log("Wrote src/server/phones/rack-sources.gen.ts")
