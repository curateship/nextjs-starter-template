import { readdir, readFile } from "node:fs/promises"
import { describe, expect, it } from "vitest"

/**
 * Every server function behind a Pomoder admin page is admin-only (admin tasks
 * 01 to 06). The guards themselves are tested in `src/server/guards.test.ts`;
 * this proves each admin door actually stands behind one, so a member calling
 * a function by hand is refused whatever the sidebar shows them.
 */

const folder = new URL("./", import.meta.url)

async function adminApiFiles() {
  const files = await readdir(folder)
  return files.filter((file) => file.startsWith("admin") && file.endsWith(".ts") && !file.endsWith(".test.ts"))
}

describe("the Pomoder admin server functions", () => {
  it("are each behind adminGet or adminPost", async () => {
    const files = await adminApiFiles()
    expect(files.length).toBeGreaterThan(4)
    for (const file of files) {
      const source = await readFile(new URL(file, folder), "utf8")
      const functions = source.split("createServerFn(").slice(1)
      for (const body of functions) {
        const chain = body.slice(0, body.indexOf(".handler("))
        const guarded = /\.middleware\(\[admin(Get|Post)\]\)/.test(chain)
        expect(guarded, `${file}: a server function without adminGet or adminPost`).toBe(true)
        // A change must use the POST guard, which also checks the request came from this app.
        if (chain.includes('method: "POST"')) expect(chain, `${file}: a POST behind adminGet`).toContain("adminPost")
      }
    }
  })
})
