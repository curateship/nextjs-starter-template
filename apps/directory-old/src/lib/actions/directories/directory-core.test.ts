import assert from "node:assert/strict"
import test from "node:test"

import { getDirectoryCoreMenuLabel } from "./directory-core"

test("a custom label always wins over the value", () => {
  assert.equal(
    getDirectoryCoreMenuLabel({ type: "phone", label: "Call the kitchen", value: "+1 416-555-0134" }),
    "Call the kitchen",
  )
})

test("phone rows without a label show the number formatted for reading", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "phone", value: "+1 416-555-0134" }), "(416) 555-0134")
  assert.equal(getDirectoryCoreMenuLabel({ type: "phone", value: "4165550134" }), "(416) 555-0134")
  assert.equal(getDirectoryCoreMenuLabel({ type: "phone", value: "tel:+14165550134" }), "(416) 555-0134")
})

test("phone numbers that are not ten North American digits show as typed", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "phone", value: "+44 20 7946 0958" }), "+44 20 7946 0958")
})

test("website rows without a label show the bare domain", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "website", value: "https://www.sanwich.ca/" }), "sanwich.ca")
  assert.equal(getDirectoryCoreMenuLabel({ type: "website", value: "sanwich.ca/menu?tab=1" }), "sanwich.ca")
})

test("email rows without a label show the address", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "email", value: "hello@sanwich.ca" }), "hello@sanwich.ca")
  assert.equal(getDirectoryCoreMenuLabel({ type: "email", value: "mailto:hello@sanwich.ca" }), "hello@sanwich.ca")
})

test("directions rows show the street address but not a maps URL", () => {
  assert.equal(
    getDirectoryCoreMenuLabel({ type: "directions", value: "1245 Broadway, New York, NY" }),
    "1245 Broadway, New York, NY",
  )
  assert.equal(
    getDirectoryCoreMenuLabel({ type: "directions", value: "https://maps.google.com/?q=sanwich" }),
    "Get Directions",
  )
})

test("claim and custom rows keep their type names", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "claim", value: "anything" }), "Claim Listing")
  assert.equal(getDirectoryCoreMenuLabel({ type: "custom", value: "/about" }), "Custom")
})

test("a row with no label and no value falls back to the type name", () => {
  assert.equal(getDirectoryCoreMenuLabel({ type: "phone" }), "Phone")
})
