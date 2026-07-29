import assert from "node:assert/strict"
import { describe, it } from "node:test"

import {
  isNotificationTypeAllowed,
  NOTIFICATION_PREFERENCE_TYPE_LIST,
  NOTIFICATION_PREFERENCE_TYPES,
  parseNotificationPreferences,
  resolveNotificationPreferenceMap,
} from "../lib/notification-preferences.ts"

describe("notification preferences", () => {
  it("registers a toggle for every notification type", () => {
    // Every NotificationType the app fires must have a preference entry so it
    // shows in Settings and can be suppressed. If a type is missing here, this
    // fails loudly rather than the type silently ignoring preferences.
    const expected = [
      "feedback_vote",
      "feedback_comment",
      "creator_watch",
      "api_usage_alert",
      "automation_approval",
    ].sort()
    assert.deepEqual([...NOTIFICATION_PREFERENCE_TYPE_LIST].sort(), expected)
    assert.equal(
      NOTIFICATION_PREFERENCE_TYPES.length,
      NOTIFICATION_PREFERENCE_TYPE_LIST.length
    )
  })

  it("parses only known boolean toggles and drops the rest", () => {
    assert.deepEqual(parseNotificationPreferences(null), {})
    assert.deepEqual(parseNotificationPreferences(undefined), {})
    assert.deepEqual(parseNotificationPreferences("nope"), {})
    assert.deepEqual(parseNotificationPreferences([true]), {})
    assert.deepEqual(
      parseNotificationPreferences({
        creator_watch: false,
        feedback_vote: true,
        unknown_type: false,
        api_usage_alert: "yes",
      }),
      { creator_watch: false, feedback_vote: true }
    )
  })

  it("defaults to on when a type has no explicit preference", () => {
    assert.equal(isNotificationTypeAllowed({}, "creator_watch"), true)
    assert.equal(isNotificationTypeAllowed({}, "feedback_vote"), true)
  })

  it("suppresses a type only when explicitly turned off", () => {
    assert.equal(
      isNotificationTypeAllowed({ creator_watch: false }, "creator_watch"),
      false
    )
    assert.equal(
      isNotificationTypeAllowed({ creator_watch: true }, "creator_watch"),
      true
    )
    // Turning one type off leaves the others delivering.
    assert.equal(
      isNotificationTypeAllowed({ creator_watch: false }, "feedback_comment"),
      true
    )
  })

  it("always delivers a blocked usage alert but can suppress the warning", () => {
    const off = { api_usage_alert: false }
    assert.equal(
      isNotificationTypeAllowed(off, "api_usage_alert", {
        apiUsageLevel: "blocked",
      }),
      true
    )
    assert.equal(
      isNotificationTypeAllowed(off, "api_usage_alert", {
        apiUsageLevel: "warning",
      }),
      false
    )
    // A blocked alert sends even with the toggle explicitly off and no level
    // context still respects the toggle.
    assert.equal(isNotificationTypeAllowed(off, "api_usage_alert"), false)
  })

  it("resolves a full on/off map filling defaults for unset types", () => {
    const map = resolveNotificationPreferenceMap({ creator_watch: false })
    assert.equal(map.creator_watch, false)
    assert.equal(map.feedback_vote, true)
    assert.equal(map.feedback_comment, true)
    assert.equal(map.api_usage_alert, true)
    // Every known type is present in the resolved map.
    assert.deepEqual(
      Object.keys(map).sort(),
      [...NOTIFICATION_PREFERENCE_TYPE_LIST].sort()
    )
  })
})
