import { describe, expect, it } from "vitest"

import { describeVaultBulk } from "@/lib/viral/vault-bulk"

describe("describeVaultBulk", () => {
  it("names what changed, what already was, and each refusal with its reason", () => {
    expect(
      describeVaultBulk(
        { completed: ["a", "b"], same: ["c"], skipped: [{ id: "d", reason: "no longer in the vault" }] },
        "set to Scripted"
      )
    ).toBe("2 ideas set to Scripted, 1 was already set to Scripted. 1 was no longer in the vault.")
  })

  it("says a plain line when all went through", () => {
    expect(describeVaultBulk({ completed: ["a"], same: [], skipped: [] }, "deleted")).toBe("1 idea deleted.")
  })
})
