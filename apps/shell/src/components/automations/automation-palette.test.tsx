import { renderToStaticMarkup } from "react-dom/server"
import type * as React from "react"
import { describe, expect, it, vi } from "vitest"

// A template card is a router link. There is no router in a test, so the
// link is a plain anchor carrying the attributes the card gives it.
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to: _to,
    params: _params,
    ...props
  }: React.ComponentProps<"a"> & { to: string; params: unknown }) => (
    <a {...props}>{children}</a>
  ),
}))

import { AutomationPalette } from "@/components/automations/automation-palette"

describe("the automation palette's panel gutter", () => {
  it("uses the same 12px gutter as its tab header", () => {
    const markup = renderToStaticMarkup(
      <AutomationPalette
        favoriteNodeKeys={[]}
        onSelect={() => {}}
        onAdd={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    )

    expect(markup).toContain("flex flex-col gap-4 px-1.5 py-3")
    expect(markup).not.toContain("p-4 sm:p-5")
  })

  it("adds a Templates tab with a card per template, open on the open template", () => {
    const markup = renderToStaticMarkup(
      <AutomationPalette
        favoriteNodeKeys={[]}
        templates={{
          items: [
            {
              key: "welcome-members",
              name: "Welcome confirmed members",
              description: "Send a welcome.",
              steps: ["Audience", "Send email"],
              isCustomized: false,
              isValid: true,
              updated_at: null,
            },
          ],
          openKey: "welcome-members",
          hooks: { after: () => {} },
        }}
        onSelect={() => {}}
        onAdd={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    )

    expect(markup).toContain("Templates")
    expect(markup).toContain("Welcome confirmed members")
    expect(markup).toContain('aria-current="page"')
  })

  it("has no Templates tab when no templates are passed", () => {
    const markup = renderToStaticMarkup(
      <AutomationPalette
        favoriteNodeKeys={[]}
        onSelect={() => {}}
        onAdd={() => {}}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />
    )

    expect(markup).not.toContain("Templates")
  })
})
