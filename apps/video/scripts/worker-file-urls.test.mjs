import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { build } from "esbuild"
import { workerFileUrls } from "./worker-file-urls.mjs"

async function bundle(root, outdir) {
  await build({
    entryPoints: [path.join(root, "src/server/jobs/read.ts")],
    outdir,
    outExtension: { ".js": ".mjs" },
    bundle: true,
    platform: "node",
    format: "esm",
    plugins: [workerFileUrls(root, outdir)],
    logLevel: "silent",
  })
  return path.join(outdir, "read.mjs")
}

test("a file beside the source is found beside the bundle", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-file-urls-"))
  try {
    const root = path.join(dir, "app")
    await mkdir(path.join(root, "src/server/assets"), { recursive: true })
    await mkdir(path.join(root, "src/server/jobs"), { recursive: true })
    await writeFile(path.join(root, "src/server/assets/font.txt"), "the font")
    await writeFile(
      path.join(root, "src/server/jobs/read.ts"),
      [
        'import { readFileSync } from "node:fs"',
        'import path from "node:path"',
        'import { fileURLToPath } from "node:url"',
        // A folder, the way the video exporter names it, and a single file.
        'const folder = fileURLToPath(new URL("../assets", import.meta.url))',
        "console.log(readFileSync(path.join(folder, 'font.txt'), 'utf8'))",
        "console.log(readFileSync(fileURLToPath(new URL('../assets/font.txt', import.meta.url)), 'utf8'))",
      ].join("\n"),
    )

    // Built somewhere else, and the source thrown away, so only the copy the
    // build made can answer: the same as a worker image, which ships dist alone.
    const outdir = path.join(dir, "shipped/dist")
    const output = await bundle(root, outdir)
    await rm(root, { recursive: true })

    const result = spawnSync(process.execPath, [output], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout, "the font\nthe font\n")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("a file that is not there fails the build", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-file-urls-"))
  try {
    const root = path.join(dir, "app")
    await mkdir(path.join(root, "src/server/jobs"), { recursive: true })
    await writeFile(
      path.join(root, "src/server/jobs/read.ts"),
      'console.log(new URL("../assets", import.meta.url).href)',
    )
    await assert.rejects(bundle(root, path.join(dir, "dist")), /does not exist/)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
