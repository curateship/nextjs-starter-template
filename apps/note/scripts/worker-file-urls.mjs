import path from "node:path"
import { cp, readFile, realpath, stat } from "node:fs/promises"

// A server file can find a file that sits beside it in the source tree with
// `new URL("../assets", import.meta.url)`. Once esbuild has folded every module
// into one bundle, `import.meta.url` is the bundle's own address, so that
// address now points somewhere else and the file is not there.
//
// This copies each such file or folder into the build folder, at the same path
// it has under the app (`src/server/assets` lands in `worker/dist/src/server/assets`),
// and rewrites the address to point at the copy. The build folder is the only
// part of the worker the Dockerfile ships, so the copy has to live inside it.

const FILE_URL =
  /new URL\(\s*(["'])(\.{1,2}\/[^"']*)\1\s*,\s*import\.meta\.url\s*\)/g

const LOADERS = { ".ts": "ts", ".tsx": "tsx", ".mts": "ts", ".js": "js", ".mjs": "js" }

export function workerFileUrls(root, outdir) {
  return {
    name: "worker-file-urls",
    async setup(builder) {
      // esbuild hands over real paths, so the app's folder is compared as one.
      const app = await realpath(root)
      const src = path.join(app, "src")
      // Source path under the app → where its copy goes in the build folder.
      const copies = new Map()

      builder.onLoad({ filter: /\.(ts|tsx|mts|js|mjs)$/ }, async ({ path: file }) => {
        if (!file.startsWith(src + path.sep)) return
        const source = await readFile(file, "utf8")
        if (!source.includes("import.meta.url")) return

        const replacements = []
        for (const match of source.matchAll(FILE_URL)) {
          const [whole, quote, relative] = match
          const target = path.resolve(path.dirname(file), relative)
          // Only files that belong to the app. Anything else is left exactly
          // as written, the same as before this step existed.
          if (!target.startsWith(src + path.sep)) continue
          await stat(target).catch(() => {
            throw new Error(
              `${path.relative(app, file)} points at ${relative}, which does not exist.`,
            )
          })
          const inApp = path.relative(app, target).split(path.sep).join("/")
          copies.set(target, path.join(outdir, inApp))
          const trailing = relative.endsWith("/") ? "/" : ""
          replacements.push([
            whole,
            `new URL(${quote}./${inApp}${trailing}${quote}, import.meta.url)`,
          ])
        }
        if (!replacements.length) return

        let contents = source
        for (const [from, to] of replacements) {
          contents = contents.replace(from, () => to)
        }
        return {
          contents,
          loader: LOADERS[path.extname(file)],
          resolveDir: path.dirname(file),
        }
      })

      builder.onEnd(async (result) => {
        if (result.errors.length) return
        for (const [from, to] of copies) {
          await cp(from, to, { recursive: true })
        }
      })
    },
  }
}
