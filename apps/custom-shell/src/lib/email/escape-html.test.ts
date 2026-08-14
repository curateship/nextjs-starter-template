import { describe, expect, it } from "vitest"

import { escapeHtml } from "@/lib/email/escape-html"

describe("email HTML escaping", () => {
  it("escapes every character that can leave text or an attribute", () => {
    expect(escapeHtml(`Tom & <Sue> said "it's ready"`)).toBe(
      "Tom &amp; &lt;Sue&gt; said &quot;it&#39;s ready&quot;",
    )
  })

  it("does not change ordinary email wording", () => {
    expect(escapeHtml("Reset your password in one hour.")).toBe(
      "Reset your password in one hour.",
    )
  })
})
