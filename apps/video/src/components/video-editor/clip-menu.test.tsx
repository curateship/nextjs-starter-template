// @vitest-environment jsdom

import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, describe, expect, it, vi } from "vitest"

// The menu's file reaches the AI tools' server code through its imports; the
// menu itself only needs to be drawn, so the router and the server are stubs.
vi.mock("@tanstack/react-router", () => ({
  useMatch: () => ({ loaderData: { user: { id: "user-1" } } }),
}))
// Two server files find their fonts and sounds beside themselves on disk,
// which a browser test cannot do.
vi.mock("@/server/video/stock-sound-files", () => ({
  STOCK_SOUND_MISSING_MESSAGE: "",
  requireStockSoundFile: () => "",
}))
vi.mock("@/server/video/text-font-files", () => ({
  FONT_MISSING_MESSAGE: "",
  requireTextFontFiles: () => ({}),
}))

import {
  createEditorStore,
  createInitialEditorState,
  EditorContext,
  type EditorClip,
} from "@/components/video-editor/editor-store"
import { ClipContextMenu } from "@/components/video-editor/remake-clips"
import { PlaybackClock } from "@/lib/video/playback-clock"

let root: Root | null = null
let host: HTMLDivElement | null = null

afterEach(() => {
  act(() => root?.unmount())
  host?.remove()
  document.body.innerHTML = ""
  root = null
  host = null
})

function caption(id: string, startMs: number): EditorClip {
  return {
    id,
    kind: "text",
    name: id,
    text: id,
    fontId: "inter",
    startMs,
    durationMs: 1000,
    trimStartMs: 0,
  } as EditorClip
}

/** Three text clips on one lane, the first two picked, the third drawn with its menu. */
async function drawMenu({ readOnly = false } = {}) {
  const clips = [caption("one", 0), caption("two", 1000), caption("three", 2000)]
  const store = createEditorStore(
    createInitialEditorState({ aspect: "9:16", tracks: [{ id: "lane", muted: false, clips }] }),
    "My Short"
  )
  store.dispatch({ type: "SELECT_CLIP", clipId: "one" })
  store.dispatch({ type: "SELECT_CLIP", clipId: "two", additive: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => {
    root!.render(
      <EditorContext.Provider
        value={{
          store,
          dispatch: store.dispatch,
          clock: new PlaybackClock(),
          projectId: "project-1",
          videoId: "video-1",
          saveNow: async () => undefined,
          setVideoName: () => undefined,
        }}
      >
        {clips.map((clip) => (
          <ClipContextMenu key={clip.id} clip={clip} readOnly={readOnly}>
            <div data-chip={clip.id}>{clip.name}</div>
          </ClipContextMenu>
        ))}
      </EditorContext.Provider>
    )
  })
  return store
}

async function rightClick(clipId: string) {
  const chip = document.querySelector(`[data-chip="${clipId}"]`)!
  await act(async () => {
    chip.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 10, clientY: 10 }))
  })
}

function menuRows() {
  return [...document.querySelectorAll("[role=menuitem]")].map((row) => row.textContent?.trim())
}

async function choose(name: string) {
  const row = [...document.querySelectorAll<HTMLElement>("[role=menuitem]")].find(
    (item) => item.textContent?.trim() === name
  )
  if (!row) throw new Error(`No menu row "${name}"`)
  await act(async () => {
    row.click()
  })
}

const laneIds = (store: ReturnType<typeof createEditorStore>) =>
  store.getSnapshot().state.tracks.flatMap((track) => track.clips.map((clip) => clip.id))

describe("the right-click menu on a text clip", () => {
  it("opens the app's menu with Copy, Paste, Duplicate and Delete first", async () => {
    await drawMenu()
    await rightClick("one")
    expect(menuRows().slice(0, 4)).toEqual(["Copy", "Paste at the playhead", "Duplicate", "Delete"])
  })

  it("deletes every picked clip when the clip is among them", async () => {
    const store = await drawMenu()
    await rightClick("two")
    await choose("Delete")
    expect(laneIds(store)).toEqual(["three"])
    store.dispatch({ type: "UNDO" })
    expect(laneIds(store)).toEqual(["one", "two", "three"])
  })

  it("deletes only that clip when it isn't picked", async () => {
    const store = await drawMenu()
    await rightClick("three")
    await choose("Delete")
    expect(laneIds(store)).toEqual(["one", "two"])
  })

  it("gives a read-only view's text clip no menu at all", async () => {
    await drawMenu({ readOnly: true })
    await rightClick("one")
    expect(menuRows()).toEqual([])
  })
})
