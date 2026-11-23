import { describe, expect, it } from "vitest"

import { stripRetiredAccountEntries } from "@/components/shell/shell-layout"
import type { ShellItem, ShellSection } from "@/lib/custom-shell"

function link(href: string): ShellItem {
  return {
    type: "item",
    id: `item-${href}`,
    label: href,
    href,
    icon: "Link",
    visible: true,
  }
}

function section(id: string, entries: ShellSection["entries"]): ShellSection {
  return { id, title: id, entries }
}

/**
 * The account pages became a modal, so a saved sidebar link to one of them is
 * dropped as the config loads. The auto-save then writes that deletion, so
 * anything this drops is gone for good — which is why it may not drop a
 * section the admin left empty on purpose.
 */
describe("stripRetiredAccountEntries", () => {
  it("drops a retired account link and keeps the rest of its section", () => {
    const result = stripRetiredAccountEntries([
      section("one", [link("/account"), link("/admin/users")]),
    ])

    expect(result).toHaveLength(1)
    expect(result[0].entries.map((entry) => entry.id)).toEqual([
      "item-/admin/users",
    ])
  })

  it("drops a section whose only link was a retired account link", () => {
    const result = stripRetiredAccountEntries([
      section("gone", [link("/account/billing")]),
      section("kept", [link("/admin/users")]),
    ])

    expect(result.map((entry) => entry.id)).toEqual(["kept"])
  })

  // "Add section" makes an empty section and the save answers a second later.
  // Dropping it here made adding a section impossible.
  it("keeps a section that was already empty", () => {
    const result = stripRetiredAccountEntries([
      section("empty", []),
      section("kept", [link("/admin/users")]),
    ])

    expect(result.map((entry) => entry.id)).toEqual(["empty", "kept"])
  })
})
