import { renderToStaticMarkup } from "react-dom/server"
import { describe, expect, it } from "vitest"

import {
  ChartLoadingSkeleton,
  DashboardLoadingSkeleton,
  MarketListLoadingSkeleton,
  PageLoadBoundary,
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

  it("keeps page content hidden behind its skeleton until layout is ready", () => {
    const markup = renderToStaticMarkup(
      <PageLoadBoundary fallback={<WorkspaceLoadingSkeleton />}>
        <div>Finished workspace</div>
      </PageLoadBoundary>
    )

    expect(markup).toContain('data-slot="page-loading-boundary"')
    expect(markup).toContain('aria-hidden="true"')
    expect(markup).toContain("invisible")
    expect(markup).toContain('aria-label="Loading workspace"')
    expect(markup).toContain("Finished workspace")
  })

  it("does not add summary sections above a dashboard table", () => {
    const markup = renderToStaticMarkup(<DashboardLoadingSkeleton />)

    expect(markup).toContain('data-slot="dashboard-table-skeleton"')
    expect(markup).not.toContain("h-24")
    expect(markup).not.toContain("h-7")
  })
})
