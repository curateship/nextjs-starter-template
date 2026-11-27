import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

import { RACK_SOURCES } from "./rack-sources.gen"

/** `rack-sources.gen.ts` must be the files in rack/ exactly (`scripts/write-rack-sources.mjs`). */
describe("the rack files the app hands out", () => {
  const root = path.resolve(__dirname, "../../..")
  const files = { iphone: "rack/iphone.py", install: "rack/install.sh", launcher: "rack/launcher.py", program: "rack/promo_rack.py" } as const

  for (const [key, file] of Object.entries(files) as Array<[keyof typeof files, string]>) {
    it(`carries ${file} as it is, or says to run npm run rack:sources`, () => {
      const onDisk = readFileSync(path.join(root, file), "utf8")
      expect(RACK_SOURCES[key] === onDisk, `${file} changed: run npm run rack:sources`).toBe(true)
    })
  }
})
