import { describe, expect, it } from "vitest"

import { publicFigures } from "@/lib/trade/public-profile/figures"
import {
  renderProfileShareSvg,
  signedWholeUsd,
} from "@/lib/trade/public-profile/share-image"

describe("the share picture", () => {
  it("writes a member's name as text, never as markup", () => {
    const svg = renderProfileShareSvg(
      {
        handle: "sam",
        displayName: `Sam <script>alert("x")</script> & co`,
        figures: publicFigures([], [], Date.now()),
        recordStart: null,
      },
      "example.com"
    )
    expect(svg).not.toContain("<script>")
    expect(svg).toContain(
      "Sam &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; co"
    )
  })

  it("puts a plus on money made and none on a loss or nothing", () => {
    expect(signedWholeUsd(6200)).toBe("+$6,200")
    expect(signedWholeUsd(-3100)).toBe("-$3,100")
    expect(signedWholeUsd(0.4)).toBe("$0")
  })
})
