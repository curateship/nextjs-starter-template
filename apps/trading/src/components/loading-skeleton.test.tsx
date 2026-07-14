import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import * as loadingSkeletons from "@/components/loading-skeleton"
import {
  ChartLoadingSkeleton,
  MarketListLoadingSkeleton,
  MediaGridSkeleton,
} from "@/components/loading-skeleton"

describe("dynamic loading skeletons", () => {
  it("only exposes placeholders for dynamic page elements", () => {
    expect(Object.keys(loadingSkeletons).sort()).toEqual([
      "ChartLoadingSkeleton",
      "MarketListLoadingSkeleton",
      "MediaGridSkeleton",
    ])
  })

  it.each([
    ["chart", <ChartLoadingSkeleton />],
    ["markets", <MarketListLoadingSkeleton />],
  ])("renders an accessible %s placeholder", (_, skeleton) => {
    const markup = renderToStaticMarkup(skeleton)

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('data-slot="skeleton"')
  })

  it("renders only the requested media placeholders", () => {
    const markup = renderToStaticMarkup(<MediaGridSkeleton count={3} />)

    expect(markup.match(/data-slot="skeleton"/g)).toHaveLength(3)
  })
})
