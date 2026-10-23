import assert from "node:assert/strict"
import test from "node:test"

import { pickContactEmail } from "./contact-email"

test("pickContactEmail keeps an ordinary business address", () => {
  assert.equal(pickContactEmail("hello@stopbbq.com"), "hello@stopbbq.com")
  assert.equal(pickContactEmail("  Orders@Stop-BBQ.co.uk "), "Orders@Stop-BBQ.co.uk")
  assert.equal(pickContactEmail("mailto:hello@stopbbq.com"), "hello@stopbbq.com")
})

test("pickContactEmail drops a site builder's error-reporting inbox", () => {
  // The one that shipped on Stop BBQ: a Wix/Sentry key, not a mailbox.
  assert.equal(
    pickContactEmail("605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com"),
    ""
  )
  assert.equal(pickContactEmail("abc123@sentry.io"), "")
})

test("pickContactEmail drops senders nobody reads and template placeholders", () => {
  assert.equal(pickContactEmail("no-reply@stopbbq.com"), "")
  assert.equal(pickContactEmail("noreply@stopbbq.com"), "")
  assert.equal(pickContactEmail("hello@example.com"), "")
})

test("pickContactEmail drops a long key even on an ordinary domain", () => {
  assert.equal(pickContactEmail("605a7baede844d278b89dc95ae0a9123@stopbbq.com"), "")
  // A long name that is not a bare key is a real address and stays.
  assert.equal(
    pickContactEmail("catering.and.private.events@stopbbq.com"),
    "catering.and.private.events@stopbbq.com"
  )
})

test("pickContactEmail takes the first usable address from a list", () => {
  assert.equal(
    pickContactEmail("605a7baede844d278b89dc95ae0a9123@sentry-next.wixpress.com, hi@stopbbq.com"),
    "hi@stopbbq.com"
  )
  assert.equal(pickContactEmail(["noreply@stopbbq.com", "hi@stopbbq.com"]), "hi@stopbbq.com")
})

test("pickContactEmail returns nothing for values that are not addresses", () => {
  for (const value of [null, undefined, "", "   ", "not an email", "stopbbq.com", 42]) {
    assert.equal(pickContactEmail(value), "")
  }
})
