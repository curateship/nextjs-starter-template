import { describe, expect, it } from "vitest"

import { getDraftErrorMessage } from "./drafts"

describe("why a draft could not be written", () => {
  it("says to add a key when no AI key is saved, rather than to try again", () => {
    // The words `draftComments` throws, provider and all.
    expect(
      getDraftErrorMessage(
        new Error("There is no anthropic key saved. Add one in Settings, under AI provider keys.")
      )
    ).toBe("Add an AI provider key in Settings before asking for a draft.")
  })
})
