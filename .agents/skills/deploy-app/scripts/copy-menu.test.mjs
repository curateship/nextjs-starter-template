import assert from "node:assert/strict"
import { test } from "node:test"

import { describeSections, pickLists } from "./copy-menu.mjs"

test("takes only the saved lists it names, so a missing one is left alone on the laptop", () => {
  assert.deepEqual(pickLists({ sections: [], topRightNavigation: "broken", theme: "dark" }, ["sections", "topRightNavigation"]), { sections: [] })
  assert.deepEqual(pickLists(null, ["sections"]), {})
})

test("describes a menu so two can be compared by eye", () => {
  assert.equal(describeSections([{ title: "Rooms", entries: [{ label: "Focus rooms" }, { id: "x" }] }]), "[Rooms] Focus rooms, x")
  assert.equal(describeSections(undefined), "")
})
