import { describe, expect, it } from "vitest"

import { appOptions } from "@/app/options"

describe("the stock automation canvas", () => {
  it("has no Trade overrides", () => {
    expect(appOptions.automations).toBeUndefined()
  })
})
