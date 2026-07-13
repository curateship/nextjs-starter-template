import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ChartLoadingSkeleton,
  DashboardLoadingSkeleton,
  MarketListLoadingSkeleton,
  WorkspaceLoadBoundary,
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

  it("keeps workspace content hidden behind a skeleton until layout is ready", () => {
    const markup = renderToStaticMarkup(
      <WorkspaceLoadBoundary>
        <div>Finished workspace</div>
      </WorkspaceLoadBoundary>
    )

    expect(markup).toContain('data-slot="workspace-loading-boundary"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain("invisible")
    expect(markup).toContain('aria-label="Loading workspace"')
    expect(markup).toContain("Finished workspace")
  })
})
