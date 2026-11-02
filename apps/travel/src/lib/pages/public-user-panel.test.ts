import { describe, expect, it } from "vitest"

import {
  createDefaultPublicUserPanel,
  getPublicUserPanelAddressProblem,
  normalizePublicUserPanel,
} from "@/lib/pages/public-user-panel"

describe("public user panel settings", () => {
  it("starts with the words and addresses the header always had", () => {
    const panel = createDefaultPublicUserPanel()
    expect(panel.login).toMatchObject({ label: "Sign in", href: "/login" })
    expect(panel.register).toMatchObject({
      label: "Create an account",
      href: "/register",
    })
    expect(panel.links).toEqual([])
    expect(normalizePublicUserPanel(undefined)).toEqual(panel)
    expect(normalizePublicUserPanel("junk")).toEqual(panel)
  })

  it("keeps a blank address, which hides the button, and drops an unsafe one", () => {
    const panel = normalizePublicUserPanel({
      login: { label: "  Log in ", href: "", style: "ghost", showOnPhone: false },
      register: { label: "", href: "javascript:alert(1)", style: "loud" },
    })

    expect(panel.login).toEqual({
      label: "Log in",
      href: "",
      style: "ghost",
      icon: "",
      showOnPhone: false,
    })
    // A blank name keeps the default word, an unsafe address hides the
    // button, and an unknown style falls back to the default one.
    expect(panel.register).toMatchObject({
      label: "Create an account",
      href: "",
      style: "primary",
      showOnPhone: true,
    })
  })

  it("keeps complete, safe signed-in links in order with unique ids", () => {
    const panel = normalizePublicUserPanel({
      links: [
        { id: "a", label: "Profile", href: "/account", icon: "settings" },
        { id: "a", label: "Help", href: "https://example.com/help" },
        { id: "c", label: "", href: "/nameless" },
        { id: "d", label: "Bad", href: "javascript:alert(1)" },
        "junk",
      ],
    })

    expect(panel.links.map((link) => link.label)).toEqual(["Profile", "Help"])
    expect(new Set(panel.links.map((link) => link.id)).size).toBe(2)
    expect(panel.links[0]).toMatchObject({ id: "a", icon: "settings" })
  })

  it("only lets a button, not a link, leave its address blank", () => {
    expect(getPublicUserPanelAddressProblem("", true)).toBeNull()
    expect(getPublicUserPanelAddressProblem("", false)).toMatch(/address/)
    expect(getPublicUserPanelAddressProblem("/account", false)).toBeNull()
    expect(getPublicUserPanelAddressProblem("javascript:x", true)).toMatch(
      /safe/
    )
  })
})
