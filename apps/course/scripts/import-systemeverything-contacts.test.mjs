import assert from "node:assert/strict"
import { test } from "node:test"

import {
  readTags,
  splitStoredTag,
} from "./import-systemeverything-contacts.mjs"

/**
 * The tag repair, which is the only real decision the import makes.
 *
 * Worth its own tests because getting it wrong is invisible: the import would
 * finish, report 25,000 contacts, and leave a tag list full of invented names
 * like "2025 at 7:28 AM (Gumroad)" that nobody would notice until they went
 * looking for a group that no longer existed.
 */

test("leaves a plain tag alone", () => {
  assert.deepEqual(splitStoredTag("Trip Planner"), ["Trip Planner"])
})

test("splits several tags stuck together with commas", () => {
  assert.deepEqual(splitStoredTag("Wheel of Life,Knowledge Hub"), [
    "Wheel of Life",
    "Knowledge Hub",
  ])
})

test("keeps an Imported date whole instead of splitting it in half", () => {
  assert.deepEqual(
    splitStoredTag("Imported February 1st, 2025 at 7:28 AM (Gumroad)"),
    ["Imported February 1st, 2025 at 7:28 AM (Gumroad)"]
  )
})

test("separates a date tag from the real tag jammed after it", () => {
  assert.deepEqual(
    splitStoredTag(
      "Imported February 1st, 2025 at 7:28 AM (Gumroad),Cold Subscribers"
    ),
    ["Imported February 1st, 2025 at 7:28 AM (Gumroad)", "Cold Subscribers"]
  )
})

test("handles two date tags in one string", () => {
  assert.deepEqual(
    splitStoredTag(
      "Imported February 1st, 2025 at 7:28 AM (Gumroad),Imported April 23rd, 2025 at 6:29 PM"
    ),
    [
      "Imported February 1st, 2025 at 7:28 AM (Gumroad)",
      "Imported April 23rd, 2025 at 6:29 PM",
    ]
  )
})

test("drops the blanks a trailing comma leaves behind", () => {
  assert.deepEqual(splitStoredTag("Brand Guide, ,"), ["Brand Guide"])
})

test("reads every tag on a contact and says each one once", () => {
  const tags = readTags({
    tags: ["Wheel of Life,Knowledge Hub", "knowledge hub", "Wheel of Life"],
  })
  assert.deepEqual(tags, ["Wheel of Life", "Knowledge Hub"])
})

test("answers nothing for a contact with no tags recorded", () => {
  assert.deepEqual(readTags({}), [])
  assert.deepEqual(readTags(null), [])
  assert.deepEqual(readTags({ tags: "not an array" }), [])
})
