import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ChartLoadingSkeleton,
  DashboardLoadingSkeleton,
  MarketListLoadingSkeleton,
  WorkspaceLoadingSkeleton,
} from "@/components/loading-skeleton"

describe("loading skeletons", () => {
  it.each([
    ["dashboard", <DashboardLoadingSkeleton />],
    ["workspace", <WorkspaceLoadingSkeleton />],
    ["chart", <ChartLoadingSkeleton />],
    ["markets", <MarketListLoadingSkeleton />],
  ])("renders an accessible %s placeholder", (_, skeleton) => {
    const markup = renderToStaticMarkup(skeleton)

    expect(markup).toContain('role="status"')
    expect(markup).toContain('aria-busy="true"')
    expect(markup).toContain('data-slot="skeleton"')
    expect(markup).not.toMatch(/Loading [A-Z]/)
  })
})
