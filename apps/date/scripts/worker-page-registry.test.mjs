import assert from "node:assert/strict"
import { test } from "node:test"
import { spawnSync } from "node:child_process"
import { copyFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { build } from "esbuild"
import { workerPageRegistry } from "./worker-page-registry.mjs"

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..")

async function runRegistry(root, outdir) {
  const output = path.join(outdir, "registry.mjs")
  await build({
    stdin: {
      contents:
        'import { publicPages } from "./src/lib/pages/page-registry.ts"; console.log(JSON.stringify(publicPages()));',
      resolveDir: root,
    },
    outfile: output,
    bundle: true,
    platform: "node",
    format: "esm",
    alias: { "@": path.join(root, "src") },
    plugins: [workerPageRegistry(root)],
    logLevel: "silent",
  })
  return spawnSync(process.execPath, [output], { encoding: "utf8" })
}

test("the app's real page registry runs in Node", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-registry-"))
  try {
    const result = await runRegistry(app, dir)
    assert.equal(result.status, 0, result.stderr)
    const pages = JSON.parse(result.stdout)
    assert.ok(pages.length > 1)
    assert.equal(
      pages.find((page) => page.path === "/login")?.canSwitchOff,
      false,
    )
    assert.deepEqual(
      pages.map((page) => page.path),
      pages.map((page) => page.path).sort(),
    )
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
})

async function fixture(work) {
  const dir = await mkdtemp(path.join(tmpdir(), "worker-pages-"))
  try {
    await mkdir(path.join(dir, "src/lib/pages"), { recursive: true })
    await mkdir(path.join(dir, "src/routes/nested"), { recursive: true })
    for (const file of ["page-registry.ts", "page-descriptor.ts"]) {
      await copyFile(
        path.join(app, "src/lib/pages", file),
        path.join(dir, "src/lib/pages", file),
      )
    }
    await work(dir)
  } finally {
    await rm(dir, { recursive: true, force: true })
  }
}

test("includes nested declarations and safely imports quoted filenames", () =>
  fixture(async (dir) => {
    await writeFile(
      path.join(dir, 'src/routes/nested/a"b.page.ts'),
      'export default {path:"/example",name:"Example",summary:"App page",source:"app"}',
    )
    await writeFile(
      path.join(dir, "src/routes/ignored.ts"),
      'throw new Error("Not a page declaration")',
    )
    const result = await runRegistry(dir, dir)
    assert.equal(result.status, 0, result.stderr)
    assert.deepEqual(JSON.parse(result.stdout), [
      {
        path: "/example",
        name: "Example",
        summary: "App page",
        source: "app",
        canSwitchOff: true,
        layout: "card",
      },
    ])
  }))

test("preserves the registry's duplicate-address refusal", () =>
  fixture(async (dir) => {
    for (const file of ["one.page.ts", "nested/two.page.ts"]) {
      await writeFile(
        path.join(dir, "src/routes", file),
        'export default {path:"/duplicate",name:"Duplicate",summary:"Duplicate"}',
      )
    }
    const result = await runRegistry(dir, dir)
    assert.notEqual(result.status, 0)
    assert.match(result.stderr, /Two pages both claim the address/)
  }))

test("refuses a changed discovery contract during the build", () =>
  fixture(async (dir) => {
    const registry = path.join(dir, "src/lib/pages/page-registry.ts")
    const { readFile } = await import("node:fs/promises")
    await writeFile(
      registry,
      (await readFile(registry, "utf8")).replace("eager: true", "eager: false"),
    )
    await assert.rejects(runRegistry(dir, dir), /Worker page discovery changed/)
  }))
