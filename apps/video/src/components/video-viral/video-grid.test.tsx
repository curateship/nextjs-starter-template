// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { VideoGrid, VideoList } from "@/components/video-viral/video-grid"
import type { ViralVideo } from "@/lib/video/viral"
import { scoreViralVideo } from "@/lib/video/viral-score"

function video(id: string, savedStatus: string | null): ViralVideo {
  return {
    key: `youtube:${id}`,
    platform: "youtube",
    platformVideoId: id,
    url: `https://www.youtube.com/shorts/${id}`,
    title: `Video ${id}`,
    channelId: "UCchannel",
    channelName: "Channel",
    subscribers: 1_000,
    views: 10_000,
    likes: 100,
    comments: 10,
    postedAt: "2099-01-01T00:00:00Z",
    durationSeconds: 30,
    thumbnailUrl: null,
    keywords: [],
    isNew: false,
    topicMatch: null,
    source: "search",
    sample: false,
    savedVideoId: savedStatus ? `saved-${id}` : null,
    savedStatus,
    score: scoreViralVideo({
      views: 10_000,
      likes: 100,
      comments: 10,
      postedAt: "2099-01-01T00:00:00Z",
      followers: 1_000,
      breakdown: null,
      now: new Date("2099-01-02T00:00:00Z"),
    }),
  }
}

const VIDEOS = [
  video("plain", null),
  video("downloading", "downloading"),
  video("watching", "analysing"),
  video("done", "ready"),
]

const COMMON = {
  videos: VIDEOS,
  // Somebody has since clicked another video: the working ones must still say so.
  selectedKey: "youtube:plain",
  onPick: () => undefined,
  ticked: new Set<string>(),
  onTick: () => undefined,
  favourites: { collections: [], starred: {} },
  onFavouritesChanged: async () => undefined,
  projectId: "project-1",
}

let container: HTMLDivElement
let root: Root

/** jsdom has no ResizeObserver, and the scroll area measures itself. */
class StubResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

beforeEach(() => {
  ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = StubResizeObserver
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  container = document.createElement("div")
  document.body.append(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function processing() {
  return [...container.querySelectorAll("[data-processing]")].map((element) =>
    element.textContent?.includes("Video downloading")
      ? "downloading"
      : element.textContent?.includes("Video watching")
        ? "watching"
        : "other"
  )
}

describe("a video being saved and broken down", () => {
  it("stands out in the grid while another video is picked, saying what it is doing", () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <VideoGrid size="medium" {...COMMON} />
        </TooltipProvider>
      )
    )
    expect(processing()).toEqual(["downloading", "watching"])
    const strips = [...container.querySelectorAll('[role="status"]')].map((one) => one.textContent)
    expect(strips).toEqual(["Downloading…", "Watching it…"])
    // A finished one is not highlighted; it carries its "Broken down" chip.
    expect(container.textContent).toContain("Broken down")
  })

  it("stands out in the list too", () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <ScrollArea>
            <VideoList {...COMMON} sort="score" direction="desc" onSort={() => undefined} />
          </ScrollArea>
        </TooltipProvider>
      )
    )
    expect(processing()).toEqual(["downloading", "watching"])
  })
})
