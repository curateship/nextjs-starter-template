// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { startExport } = vi.hoisted(() => ({
  startExport: vi.fn(async () => []),
}))
vi.mock("@/lib/api/video/exports", () => ({
  startExport,
  cancelExports: vi.fn(async () => []),
  getExportErrorMessage: () => "The export could not be made.",
}))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: vi.fn(),
  dismissErrorToast: vi.fn(),
}))

import { ExportDialog } from "@/components/video-editor/export-dialog"
import type { RenderJobSummary } from "@/lib/api/video/exports"
import type { AspectRatio } from "@/lib/video/timeline-schema"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let host: HTMLDivElement | null = null

beforeEach(() => startExport.mockClear())

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

function job(aspect: AspectRatio): RenderJobSummary {
  return {
    id: `job-${aspect}`,
    project_id: "project",
    project_name: "Project",
    status: "ready",
    quality: "high",
    aspect,
    frame_rate: 30,
    error_message: null,
    queue_position: null,
    title: "Project",
    description: null,
    file_size: 1000,
    duration_ms: 10_000,
    width: 1080,
    height: 1920,
    has_thumbnail: false,
    created_at: "2026-09-24T00:00:00.000Z",
    finished_at: "2026-09-24T00:01:00.000Z",
  }
}

function open(jobs: RenderJobSummary[], projectMs = 10_000) {
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  act(() =>
    root!.render(
      <ExportDialog
        open
        onOpenChange={() => undefined}
        projectId="project"
        projectName="Project"
        projectAspect="9:16"
        projectMs={projectMs}
        jobs={jobs}
        onJobsChange={() => undefined}
      />
    )
  )
}

function exportButton() {
  return [...document.body.querySelectorAll("button")].find((button) =>
    /^(Re-export|Export)/.test(button.textContent ?? "")
  )!
}

function radio(name: string) {
  return [...document.body.querySelectorAll('[role="radio"]')].find((item) =>
    item.textContent?.startsWith(name)
  ) as HTMLButtonElement
}

function click(element: Element) {
  act(() => (element as HTMLElement).click())
}

describe("the frame rate", () => {
  it("starts at 30, and a pick of 60 goes with the export", async () => {
    open([])
    expect(radio("30 frames a second").getAttribute("aria-checked")).toBe(
      "true"
    )
    click(radio("60 frames a second"))
    expect(radio("60 frames a second").getAttribute("aria-checked")).toBe(
      "true"
    )
    await act(async () => exportButton().click())
    expect(startExport).toHaveBeenCalledWith(
      "project",
      ["9:16"],
      "high",
      60,
      true,
      "Project"
    )
  })

  it("never shows the number without words", () => {
    open([])
    for (const rate of ["30", "60"]) {
      expect(radio(`${rate} frames a second`).textContent).toMatch(
        /frames a second[A-Z]/
      )
    }
  })

  it("has no time estimate at 60, which has not been timed", () => {
    open([], 10 * 60_000)
    expect(document.body.textContent).toContain("Making it takes about")
    click(radio("60 frames a second"))
    expect(document.body.textContent).not.toContain("Making it takes")
  })
})

describe("the export button", () => {
  it("says Export for a shape never exported", () => {
    open([])
    expect(exportButton().textContent).toBe("Export")
  })

  it("says Re-export once the ticked shape has an export", () => {
    open([job("9:16")])
    expect(exportButton().textContent).toBe("Re-export")
  })

  it("says Export while any ticked shape is new", () => {
    open([job("9:16")])
    click(document.getElementById("export-shape-1x1")!)
    expect(exportButton().textContent).toBe("Export 2 shapes")
  })

  it("says Re-export for several shapes all exported before", () => {
    open([job("9:16"), job("1:1")])
    click(document.getElementById("export-shape-1x1")!)
    expect(exportButton().textContent).toBe("Re-export 2 shapes")
  })

  it("says Export with nothing ticked", () => {
    open([job("9:16")])
    click(document.getElementById("export-shape-9x16")!)
    expect(exportButton().textContent).toBe("Export")
  })
})
