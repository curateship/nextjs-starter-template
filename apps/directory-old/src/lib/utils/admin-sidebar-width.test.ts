import assert from "node:assert/strict"
import test from "node:test"

import {
  MAX_ADMIN_SIDEBAR_WIDTH,
  MIN_ADMIN_SIDEBAR_WIDTH,
  clampAdminSidebarWidth,
} from "./admin-sidebar-width"

test("clampAdminSidebarWidth clamps and rounds persisted widths", () => {
  assert.equal(clampAdminSidebarWidth(100), MIN_ADMIN_SIDEBAR_WIDTH)
  assert.equal(clampAdminSidebarWidth(300.6), 301)
  assert.equal(clampAdminSidebarWidth(500), MAX_ADMIN_SIDEBAR_WIDTH)
})
