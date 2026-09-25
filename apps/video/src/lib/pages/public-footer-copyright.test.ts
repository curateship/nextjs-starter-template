import { describe, expect, it } from "vitest"

import { renderCopyrightText } from "@/lib/pages/public-footer-copyright"

describe("renderCopyrightText", () => {
  it("fills in the year and the app name when nothing is saved", () => {
    expect(renderCopyrightText("", 2026, "Custom Shell")).toBe(
      "© 2026 Custom Shell. All rights reserved."
    )
  })

  it("replaces every token in a saved line", () => {
    expect(
      renderCopyrightText("{site} — {year}. Built by {site}.", 2026, "Acme")
    ).toBe("Acme — 2026. Built by Acme.")
  })

  it("brings a hand-typed leading year forward", () => {
    expect(renderCopyrightText("© 2021 Acme Ltd", 2026, "Acme")).toBe(
      "© 2026 Acme Ltd"
    )
  })

  it("leaves a year alone when it is not the first thing on the line", () => {
    expect(renderCopyrightText("Acme, founded 2019", 2026, "Acme")).toBe(
      "Acme, founded 2019"
    )
  })

  it("treats a line of only spaces as blank", () => {
    expect(renderCopyrightText("   ", 2026, "Acme")).toBe(
      "© 2026 Acme. All rights reserved."
    )
  })
})
