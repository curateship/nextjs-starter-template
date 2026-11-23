import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { createSaveStatus, getSaveStatusLabel, hasSaveableChange, isSaveStatusVisible } from "./save-status"

describe("save status helpers", () => {
  it("uses the standard label for each structured save state", () => {
    assert.equal(getSaveStatusLabel(createSaveStatus("dirty")), "Unsaved changes")
    assert.equal(getSaveStatusLabel(createSaveStatus("saving")), "Saving...")
    assert.equal(getSaveStatusLabel(createSaveStatus("saved")), "Saved")
    assert.equal(getSaveStatusLabel(createSaveStatus("error")), "Save failed")
  })

  it("keeps detailed messages without changing the standard label", () => {
    const status = createSaveStatus("error", "Product ID required")

    assert.equal(getSaveStatusLabel(status), "Save failed")
    assert.equal(status.message, "Product ID required")
  })

  it("hides idle status and shows actionable statuses", () => {
    assert.equal(isSaveStatusVisible(createSaveStatus("idle")), false)
    assert.equal(isSaveStatusVisible(createSaveStatus("dirty")), true)
  })

  it("does not treat equal input values as saveable changes", () => {
    assert.equal(hasSaveableChange({ body: "Hello", format: "html" }, { body: "Hello", format: "html" }), false)
    assert.equal(hasSaveableChange({ body: "Hello" }, { body: "Hello!" }), true)
  })
})
