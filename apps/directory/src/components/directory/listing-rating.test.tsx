import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import { ListingRating } from "@/components/directory/listing-rating"

describe("listing stars", () => {
  it("draws a half star with one readable name", () => {
    const markup = renderToStaticMarkup(<ListingRating rating={4.5} />)

    expect(markup).toContain('aria-label="4.5 out of 5"')
    expect(markup).toContain("lucide-star-half")
    expect(markup).toContain("-scale-x-100")
    expect(markup.match(/aria-hidden="true"/g)?.length).toBeGreaterThan(0)
  })

  it("draws nothing when no rating was set", () => {
    expect(renderToStaticMarkup(<ListingRating rating={null} />)).toBe("")
  })
})
