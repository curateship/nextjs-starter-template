import { describe, expect, it } from "vitest"

import { buildHeaderBreadcrumb } from "@/lib/nav/header-breadcrumb"
import { shortcutsForRole, type ShellItem } from "@/lib/custom-shell"

const items: ShellItem[] = [
  {
    type: "item",
    id: "automations",
    label: "Automations",
    href: "/admin/automations",
    icon: "workflow",
    visible: true,
    children: [
      {
        id: "templates",
        label: "Templates",
        href: "/admin/automations/templates",
      },
    ],
  },
  {
    type: "item",
    id: "users",
    label: "Users",
    href: "/admin/users",
    icon: "users",
    visible: true,
  },
]

const labels = (steps: { label: string }[]) => steps.map((step) => step.label)

describe("buildHeaderBreadcrumb", () => {
  it("shows a sidebar page alone, not as a link", () => {
    const steps = buildHeaderBreadcrumb({
      items,
      currentPath: "/admin/users",
      pageTitle: "Users",
    })
    expect(steps).toEqual([{ label: "Users", href: undefined, icon: "users" }])
  })

  it("ends a record page with the record's name, the steps before it links", () => {
    const steps = buildHeaderBreadcrumb({
      items,
      currentPath: "/admin/automations/abc",
      pageTitle: "Welcome email",
    })
    expect(labels(steps)).toEqual(["Automations", "Welcome email"])
    expect(steps[0].href).toBe("/admin/automations")
    expect(steps[1].href).toBeUndefined()
  })

  it("puts the child link under its parent and the record after both", () => {
    const steps = buildHeaderBreadcrumb({
      items,
      currentPath: "/admin/automations/templates/welcome",
      pageTitle: "Welcome series",
    })
    expect(labels(steps)).toEqual([
      "Automations",
      "Templates",
      "Welcome series",
    ])
    expect(steps[1].href).toBe("/admin/automations/templates")
  })

  it("ends on the child link when you are on its own page", () => {
    const steps = buildHeaderBreadcrumb({
      items,
      currentPath: "/admin/automations/templates",
      pageTitle: "Automation templates",
    })
    expect(labels(steps)).toEqual(["Automations", "Templates"])
    expect(steps[1].href).toBeUndefined()
  })

  it("shows a page outside the sidebar by its own name alone", () => {
    expect(
      labels(
        buildHeaderBreadcrumb({
          items,
          currentPath: "/admin/media",
          pageTitle: "Media",
        })
      )
    ).toEqual(["Media"])
  })

  it("draws nothing for an unknown page outside the sidebar", () => {
    expect(
      buildHeaderBreadcrumb({ items, currentPath: "/somewhere" })
    ).toEqual([])
  })

  it("does not repeat the last step when the page name matches it", () => {
    expect(
      labels(
        buildHeaderBreadcrumb({
          items,
          currentPath: "/admin/users/settings",
          pageTitle: "Users",
        })
      )
    ).toEqual(["Users"])
  })
})

describe("shortcutsForRole", () => {
  const shortcuts = [
    { id: "a", label: "Users", href: "/admin/users", icon: "users", visible: true },
    { id: "b", label: "Home", href: "/home", icon: "home", visible: true },
    { id: "c", label: "Off", href: "/off", icon: "home", visible: false },
    { id: "d", label: "", href: "/blank", icon: "home", visible: true },
    { id: "e", label: "No page", href: " ", icon: "home", visible: true },
    { id: "f", label: "Admin tab", href: "/admin?tab=x", icon: "home", visible: true },
  ]

  it("never gives a member an admin page", () => {
    expect(shortcutsForRole(shortcuts, "member").map((s) => s.id)).toEqual([
      "b",
    ])
  })

  it("leaves out switched-off and unfinished links, keeping the order", () => {
    expect(shortcutsForRole(shortcuts, "admin").map((s) => s.id)).toEqual([
      "a",
      "b",
      "f",
    ])
  })
})
