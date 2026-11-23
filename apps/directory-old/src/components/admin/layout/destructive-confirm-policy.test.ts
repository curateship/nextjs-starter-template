import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  DESTRUCTIVE_ACTION_POLICIES,
  getDestructiveConfigurationError,
  isDestructiveConfirmDisabled,
  matchesDestructiveConfirmation,
} from "./destructive-confirm-policy"

describe("destructive action policy", () => {
  it("classifies simple, dependent, and catastrophic deletes", () => {
    assert.equal(DESTRUCTIVE_ACTION_POLICIES["delete-media"].level, 1)
    assert.equal(DESTRUCTIVE_ACTION_POLICIES["delete-product"].level, 2)
    assert.equal(DESTRUCTIVE_ACTION_POLICIES["delete-site"].level, 3)
  })

  it("gives every destructive action concrete consequence copy", () => {
    for (const policy of Object.values(DESTRUCTIVE_ACTION_POLICIES)) {
      assert.ok(policy.consequence.trim().length > 0)
    }
  })

  it("keeps dependent and catastrophic actions at elevated levels", () => {
    const levelTwo = [
      "delete-ai-automation",
      "delete-category",
      "delete-listing",
      "delete-newsletter-automation",
      "delete-product",
      "delete-saved-collection",
      "delete-segment",
      "delete-sponsor",
    ] as const
    for (const action of levelTwo) assert.equal(DESTRUCTIVE_ACTION_POLICIES[action].level, 2)
    assert.equal(DESTRUCTIVE_ACTION_POLICIES["delete-site"].level, 3)
    assert.equal(DESTRUCTIVE_ACTION_POLICIES["delete-user"].level, 3)
  })

  it("describes archive behavior without claiming permanent deletion", () => {
    assert.match(DESTRUCTIVE_ACTION_POLICIES["archive-form"].consequence, /keeps its existing submissions/)
  })
})

describe("type-to-confirm matching", () => {
  it("trims input but remains case-sensitive", () => {
    assert.equal(matchesDestructiveConfirmation("  Acme Directory  ", "Acme Directory"), true)
    assert.equal(matchesDestructiveConfirmation("acme directory", "Acme Directory"), false)
    assert.equal(matchesDestructiveConfirmation("Acme Directory ", "Acme Directory"), true)
  })
})

describe("destructive confirmation gating", () => {
  it("requires impact data for elevated actions and a name for catastrophic actions", () => {
    assert.match(getDestructiveConfigurationError(2, false) ?? "", /impact is unavailable/)
    assert.match(getDestructiveConfigurationError(3, true) ?? "", /name is unavailable/)
    assert.equal(getDestructiveConfigurationError(3, true, "Acme"), null)
  })

  it("stays disabled while impact loads, when loading fails, and for a name mismatch", () => {
    const enabledState = {
      configurationError: null,
      confirming: false,
      disabled: false,
      impactError: null,
      loadingImpact: false,
      confirmationMatches: true,
    }

    assert.equal(isDestructiveConfirmDisabled(enabledState), false)
    assert.equal(isDestructiveConfirmDisabled({ ...enabledState, loadingImpact: true }), true)
    assert.equal(isDestructiveConfirmDisabled({ ...enabledState, impactError: "Failed" }), true)
    assert.equal(isDestructiveConfirmDisabled({ ...enabledState, confirmationMatches: false }), true)
  })
})
