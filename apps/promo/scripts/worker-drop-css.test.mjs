import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { build } from "esbuild"
import { workerDropCss } from "./worker-drop-css.mjs"

/** Bundles one line of source the way the worker build does. */
async function bundle(dir, source) {
  const outfile = path.join(dir, "out.mjs")
  await build({
    stdin: { contents: source, resolveDir: dir },
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    plugins: [workerDropCss()],
    logLevel: "silent",
  })
  return outfile
}

test("a stylesheet beside the code is dropped and the bundle runs", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-drop-css-"))
  try {
    await writeFile(path.join(dir, "styles.css"), ".a { color: red }")
    const outfile = await bundle(
      dir,
      'import "./styles.css"; console.log("started")'
    )
    const result = spawnSync(process.execPath, [outfile], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
    assert.equal(result.stdout.trim(), "started")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// The failure this exists for: a package's stylesheet stays an import Node
// cannot open, because dependencies are left external.
test("a package's stylesheet leaves no import behind", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-drop-css-"))
  try {
    const outfile = await bundle(
      dir,
      'import "react-image-crop/dist/ReactCrop.css"; console.log("started")'
    )
    const built = await readFile(outfile, "utf8")
    assert.ok(!built.includes("ReactCrop.css"), built)
    const result = spawnSync(process.execPath, [outfile], { encoding: "utf8" })
    assert.equal(result.status, 0, result.stderr)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

// A query on the end is still a stylesheet, and esbuild's own answer to one is
// an empty object plus a stray `.css` file written beside the bundle.
test("a stylesheet with a query leaves no second file behind", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-drop-css-"))
  try {
    await writeFile(path.join(dir, "styles.css"), ".a { color: red }")
    await bundle(dir, 'import "./styles.css?raw"; console.log("started")')
    const written = await readdir(dir)
    assert.deepEqual(written.sort(), ["out.mjs", "styles.css"])
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

test("javascript is still bundled normally", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-drop-css-"))
  try {
    await writeFile(path.join(dir, "greet.js"), 'export const greet = "hello"')
    const outfile = await bundle(
      dir,
      'import { greet } from "./greet.js"; console.log(greet)'
    )
    const result = spawnSync(process.execPath, [outfile], { encoding: "utf8" })
    assert.equal(result.stdout.trim(), "hello")
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})
