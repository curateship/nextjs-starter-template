// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { ScrollArea } from "@/components/ui/scroll-area"
import { TooltipProvider } from "@/components/ui/tooltip"
import { CreatorList, VideoGrid, VideoList } from "@/components/video-viral/video-grid"
import type { ViralCreator, ViralVideo } from "@/lib/video/viral"
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

describe("a downloaded video", () => {
  it("is finished, not amber, and carries its Downloaded chip", () => {
    act(() =>
      root.render(
        <TooltipProvider>
          <VideoGrid size="medium" {...COMMON} videos={[video("kept", "downloaded")]} />
        </TooltipProvider>
      )
    )
    expect(processing()).toEqual([])
    expect(container.textContent).toContain("Downloaded")
  })
})

function creator(name: string, followed: Partial<ViralCreator> | null): ViralCreator {
  return {
    key: `tiktok:@${name}`,
    platform: "tiktok",
    channelId: null,
    name,
    handle: name,
    subscribers: null,
    hits: 0,
    typicalScore: null,
    followedId: followed ? `creator-${name}` : null,
    watch: followed ? true : null,
    lastCheckedAt: null,
    avatarUrl: null,
    profileUrl: "",
    postsPerWeek: null,
    ...followed,
  }
}

describe("the Creators list", () => {
  it("gives followed rows the switch and when they were last checked, and search-only rows neither", () => {
    const changes: [string, boolean][] = []
    act(() =>
      root.render(
        <TooltipProvider>
          <CreatorList
            creators={[
              creator("watched", { lastCheckedAt: new Date(Date.now() - 2 * 3_600_000).toISOString() }),
              creator("paused", { watch: false }),
              creator("found", null),
            ]}
            selectedKey={null}
            onPick={() => undefined}
            onWatchChange={(one, watch) => changes.push([one.name, watch])}
          />
        </TooltipProvider>
      )
    )
    const rows = [...container.querySelectorAll("li")]
    expect(rows[0].textContent).toContain("Check for new posts")
    expect(rows[0].textContent).toContain("Last checked 2 hours ago")
    expect(rows[1].textContent).toContain("Paused")
    expect(rows[1].textContent).toContain("Not checked yet")
    expect(rows[2].textContent).not.toContain("Check for new posts")
    expect(rows[2].querySelector('[role="switch"]')).toBeNull()

    const switches = [...container.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(switches.map((one) => one.getAttribute("aria-checked"))).toEqual(["true", "false"])
    act(() => switches[0].click())
    act(() => switches[1].click())
    expect(changes).toEqual([
      ["watched", false],
      ["paused", true],
    ])
  })
})
