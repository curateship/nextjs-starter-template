import { describe, expect, it } from "vitest"

import { linkText, projectLinksSchema, readWebAddress } from "@/lib/project/project-links"

describe("a project's links (Misc 5, 2 Nov 2026)", () => {
  it("takes a typed address as a web address, adding https:// when it has none", () => {
    expect(readWebAddress("acme.com/brief")).toBe("https://acme.com/brief")
    expect(readWebAddress(" http://acme.com ")).toBe("http://acme.com")
    expect(readWebAddress("")).toBeNull()
    expect(readWebAddress("not an address")).toBeNull()
  })

  it("never saves an address that could run a script", () => {
    expect(readWebAddress("javascript:alert(1)")).toBeNull()
    expect(readWebAddress("data:text/html,hi")).toBeNull()
    const saved = projectLinksSchema.safeParse([{ id: "a", kind: "link", label: "x", url: "javascript:alert(1)" }])
    expect(saved.success).toBe(false)
  })

  it("keeps links and labelled dividers in order, and refuses a divider with no label", () => {
    const list = [
      { id: "a", kind: "link", label: "Figma", url: "https://figma.com" },
      { id: "b", kind: "divider", label: "Docs" },
    ]
    expect(projectLinksSchema.parse(list)).toEqual(list)
    expect(projectLinksSchema.safeParse([{ id: "b", kind: "divider", label: " " }]).success).toBe(false)
  })

  it("shows the label, or the address without https:// when it has none", () => {
    expect(linkText({ label: "Figma", url: "https://figma.com" })).toBe("Figma")
    expect(linkText({ label: "", url: "https://figma.com/file" })).toBe("figma.com/file")
  })
})
