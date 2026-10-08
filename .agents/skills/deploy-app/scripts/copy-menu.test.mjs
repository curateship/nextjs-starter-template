import assert from "node:assert/strict"
import { test } from "node:test"

import { describeSections, menuHrefs, missingPages, pickLists, routePaths } from "./copy-menu.mjs"

test("takes only the saved lists it names, so a missing one is left alone on live", () => {
  assert.deepEqual(pickLists({ sections: [], topRightNavigation: "broken", theme: "dark" }, ["sections", "topRightNavigation"]), { sections: [] })
  assert.deepEqual(pickLists(null, ["sections"]), {})
})

test("finds every link in the menu, children included, once each", () => {
  const menu = [{ sections: [{ entries: [{ href: "/admin/dashboard", children: [{ href: "/admin/users" }, { href: "/admin/dashboard" }] }] }] }, {}]
  assert.deepEqual(menuHrefs(menu), ["/admin/dashboard", "/admin/users"])
})

test("reads page addresses out of a route tree", () => {
  const text = "fullPath: '/'\n  fullPath: '/admin/users'\n  fullPath: '/u/$handle'\n  fullPath: '/admin/users'"
  assert.deepEqual(routePaths(text), ["/", "/admin/users", "/u/$handle"])
})

test("flags a menu link with no page, but not a page with a parameter or an outside link", () => {
  const paths = ["/", "/admin/users", "/u/$handle", "/docs/$", "/admin/settings/"]
  const hrefs = ["/admin/users", "/admin/users/", "/admin/users?tab=new", "/u/tyler", "/docs/a/b", "/admin/settings", "/admin/pomodoro-task-repeats", "https://example.com"]
  assert.deepEqual(missingPages(hrefs, paths), ["/admin/pomodoro-task-repeats"])
})

test("describes a menu so two can be compared by eye", () => {
  assert.equal(describeSections([{ title: "Rooms", entries: [{ label: "Focus rooms" }, { id: "x" }] }]), "[Rooms] Focus rooms, x")
  assert.equal(describeSections(undefined), "")
})
