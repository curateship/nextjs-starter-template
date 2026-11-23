import { readFileSync } from "node:fs"
import path from "node:path"

import { describe, expect, it } from "vitest"

const read = (file: string) =>
  readFileSync(path.join(process.cwd(), "src", file), "utf8")

/**
 * The deal doors check input against these limits outside the handler, and
 * that part ships to the browser. When the doors took them from the server's
 * deal rules, argon2 and node:crypto came along and every page crashed.
 */
describe("deal limits", () => {
  it("import nothing from the server", () => {
    expect(read("lib/promotions/deal-limits.ts")).not.toContain("@/server/")
  })

  it("are not offered by the server's deal rules, so no door takes them from there", () => {
    expect(read("server/promotions/promotions.ts")).not.toMatch(
      /export const MAX_PROMOTION_/
    )
  })

  it("reach both doors from this file", () => {
    for (const door of [
      "lib/api/promotions/owner.ts",
      "lib/api/promotions/promotions.ts",
    ]) {
      const source = read(door)
      expect(source).toContain('from "@/lib/promotions/deal-limits"')
    }
  })
})
