import assert from "node:assert/strict"
import test from "node:test"

import { pickNotificationRecipients } from "./notification-kinds"

const alice = { id: "alice" }
const bob = { id: "bob" }
const everyone = [alice, bob]

test("no saved preferences means everyone receives the notification", () => {
  assert.deepEqual(
    pickNotificationRecipients(everyone, [], "product_order"),
    everyone
  )
})

test("a kind switched off mutes only that person for that kind", () => {
  const preferences = [
    { userId: "alice", type: "event_registration", enabled: false },
  ]

  assert.deepEqual(
    pickNotificationRecipients(everyone, preferences, "event_registration"),
    [bob]
  )
  // The same person still receives every other kind.
  assert.deepEqual(
    pickNotificationRecipients(everyone, preferences, "directory_claim"),
    everyone
  )
})

test("a preference saved as on changes nothing", () => {
  const preferences = [
    { userId: "alice", type: "product_order", enabled: true },
  ]

  assert.deepEqual(
    pickNotificationRecipients(everyone, preferences, "product_order"),
    everyone
  )
})

test("a kind nobody has a preference for goes to everyone", () => {
  const preferences = [
    { userId: "alice", type: "product_order", enabled: false },
  ]

  assert.deepEqual(
    pickNotificationRecipients(everyone, preferences, "brand_new_kind"),
    everyone
  )
})

test("everyone muted means nobody receives it", () => {
  const preferences = [
    { userId: "alice", type: "newsletter_paused", enabled: false },
    { userId: "bob", type: "newsletter_paused", enabled: false },
  ]

  assert.deepEqual(
    pickNotificationRecipients(everyone, preferences, "newsletter_paused"),
    []
  )
})
