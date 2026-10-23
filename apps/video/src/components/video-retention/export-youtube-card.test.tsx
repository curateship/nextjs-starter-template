// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  loadExportRetention: vi.fn(),
  postExportYoutubeLink: vi.fn(),
  refreshExportYoutube: vi.fn(),
  removeExportYoutubeLink: vi.fn(),
}))
vi.mock("@/lib/api/video/youtube-retention", () => ({
  ...api,
  getRetentionErrorMessage: (error: Error) => error.message,
}))
const toasts = vi.hoisted(() => ({ showErrorToast: vi.fn() }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: toasts.showErrorToast,
  dismissErrorToast: vi.fn(),
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a href="/admin/settings/youtube">{children}</a>,
}))
// The chart itself needs a laid-out page; here it only has to be handed the curve.
vi.mock("@/components/video-retention/retention-chart", () => ({
  RetentionChart: ({ points }: { points: unknown[] }) => (
    <div data-testid="chart">{points.length} points</div>
  ),
}))

import { TooltipProvider } from "@/components/ui/tooltip"
import { ExportYoutubeCard } from "@/components/video-retention/export-youtube-card"
import type { RenderJobSummary } from "@/lib/api/video/exports"
import type { ExportRetention } from "@/lib/video/retention"
import { YOUTUBE_LINK_INVALID_MESSAGE } from "@/lib/video/retention"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

let root: Root | null = null
let host: HTMLDivElement | null = null
let submitted = 0

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset())
  toasts.showErrorToast.mockReset()
  submitted = 0
})

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  root = null
  host = null
})

const item = { id: "job-1", kind: "video", status: "ready" } as RenderJobSummary

function retention(overrides: Partial<ExportRetention> = {}): ExportRetention {
  return {
    channel_title: "Barely Cooking",
    posted: null,
    export_length_ms: 30_000,
    scenes: [{ startMs: 0, endMs: 30_000, name: "Hook" }],
    scenes_from_project_now: false,
    ...overrides,
  }
}

async function open(answer: ExportRetention | null) {
  api.loadExportRetention.mockResolvedValue(answer)
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      // The Export window is a form; the card must never submit it.
      <TooltipProvider>
        <form
          onSubmit={(event) => {
            event.preventDefault()
            submitted += 1
          }}
        >
          <ExportYoutubeCard item={item} />
        </form>
      </TooltipProvider>
    )
  })
}

function input() {
  return host!.querySelector("input") as HTMLInputElement
}

function type(value: string) {
  const field = input()
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value"
    )!.set!
    setter.call(field, value)
    field.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

function pressEnter() {
  act(() => {
    input().dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
    )
  })
}

describe("the Posted on YouTube card", () => {
  it("is left out for anybody who is not an admin", async () => {
    await open(null)
    expect(host!.textContent).toBe("")
  })

  it("sends a channel-less admin to Settings", async () => {
    await open(retention({ channel_title: null }))
    expect(host!.textContent).toContain("Connect your YouTube channel")
    expect(host!.querySelector("a")?.getAttribute("href")).toBe(
      "/admin/settings/youtube"
    )
  })

  it("marks a link that is not YouTube's and asks nobody", async () => {
    await open(retention())
    type("https://vimeo.com/1")
    pressEnter()
    expect(input().getAttribute("aria-invalid")).toBe("true")
    expect(toasts.showErrorToast).toHaveBeenCalledWith(YOUTUBE_LINK_INVALID_MESSAGE)
    expect(api.postExportYoutubeLink).not.toHaveBeenCalled()
    expect(submitted).toBe(0)
  })

  it("reads the figures on Enter without saving the window", async () => {
    await open(retention())
    api.postExportYoutubeLink.mockResolvedValue(
      retention({
        posted: {
          youtube_video_id: "dQw4w9WgXcQ",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          video_title: "Scene three needs a cut",
          published_at: "2026-01-01T00:00:00Z",
          length_seconds: 30,
          other_channel: false,
          points: [
            { ratio: 0, watch: 1, relative: 0.5 },
            { ratio: 1, watch: 0.4, relative: 0.5 },
          ],
          views: 1240,
          average_view_seconds: 18,
          read_at: "2026-10-22T10:00:00Z",
        },
      })
    )
    type("https://youtu.be/dQw4w9WgXcQ")
    await act(async () => pressEnter())
    expect(api.postExportYoutubeLink).toHaveBeenCalledWith(
      "job-1",
      "https://youtu.be/dQw4w9WgXcQ"
    )
    expect(submitted).toBe(0)
    expect(host!.textContent).toContain("Scene three needs a cut")
    expect(host!.textContent).toContain("1,240 views")
    expect(host!.querySelector('[data-testid="chart"]')?.textContent).toBe(
      "2 points"
    )
  })

  it("says the figures lag for a young video, and where older scene columns came from", async () => {
    await open(
      retention({
        scenes_from_project_now: true,
        posted: {
          youtube_video_id: "dQw4w9WgXcQ",
          url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
          video_title: "Just up",
          published_at: new Date(Date.now() - 3_600_000).toISOString(),
          length_seconds: 34,
          other_channel: false,
          points: [],
          views: 0,
          average_view_seconds: 0,
          read_at: new Date().toISOString(),
        },
      })
    )
    const text = host!.textContent ?? ""
    expect(text).toContain("YouTube's figures arrive a day or two late")
    expect(text).toContain("runs 34 s and this export 30 s")
    expect(text).toContain("the project's scenes as they are now")
    expect(text).toContain("YouTube has no curve for this video yet")
  })
})
