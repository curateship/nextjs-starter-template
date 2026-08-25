import { existsSync, readdirSync } from "node:fs"
import path from "node:path"

import { configDefaults, defineConfig } from "vitest/config"

import base from "./vitest.config"

/**
 * The everyday test run: `npm run test:app`. Two differences from the full
 * `npm run test`, both aimed at time, neither touching a shell file.
 *
 * 1. Test files that also exist in `../custom-shell` are skipped. They are
 *    the shell's own tests, they only change during a shell merge, and they
 *    are most of the suite's running time. The list is computed fresh on
 *    every run by comparing paths against the shell, so it never goes stale.
 *    A shell merge should still run the full `npm run test` once.
 *
 * 2. Imports of `@/server/test-support` are pointed at
 *    `test-support.fast.ts`, which starts each test's database from a saved
 *    snapshot instead of replaying every migration. See that file.
 */

const appRoot = __dirname
const shellRoot = path.resolve(appRoot, "../custom-shell")

function shellOriginTests(): string[] {
  if (!existsSync(shellRoot)) return []
  const found: string[] = []
  const walk = (relative: string) => {
    const entries = readdirSync(path.join(appRoot, relative), {
      withFileTypes: true,
    })
    for (const entry of entries) {
      const relativePath = path.join(relative, entry.name)
      if (entry.isDirectory()) {
        walk(relativePath)
      } else if (
        /\.test\.[jt]sx?$/.test(entry.name) &&
        existsSync(path.join(shellRoot, relativePath))
      ) {
        found.push(relativePath.split(path.sep).join("/"))
      }
    }
  }
  walk("src")
  return found
}

export default defineConfig({
  ...base,
  resolve: {
    alias: [
      {
        find: /^@\/server\/test-support$/,
        replacement: path.resolve(appRoot, "src/server/test-support.fast.ts"),
      },
      { find: "@", replacement: path.resolve(appRoot, "./src") },
    ],
  },
  test: {
    ...base.test,
    exclude: [...configDefaults.exclude, ...shellOriginTests()],
  },
})
