import { describe, expect, it } from "vitest"

import {
  closeAll,
  MAX_KEPT_FRAMES,
  NO_FRAMES,
  openFrame,
  openScreen,
  reloadOpen,
  reportMove,
  showAddress,
  type Frames,
} from "@/lib/frames"

const listings = "http://localhost:3015/admin/listings"
const dashboard = "http://localhost:3015/admin/dashboard"
const project = "http://localhost:3020/dashboard"
const video = "http://localhost:3016/admin"

const underListings = (url: string) => url.startsWith(listings)

describe("kept frames", () => {
  it("shows a kept frame again as it was, with no reload", () => {
    let state = openScreen(NO_FRAMES, listings)
    const first = openFrame(state)!
    state = reportMove(state, first.id, "/admin/listings/abc", "Pasta night")
    state = openScreen(state, project)
    state = openScreen(state, listings, underListings)
    const back = openFrame(state)!
    expect(back.id).toBe(first.id)
    expect(back.load).toBe(0)
    expect(back.url).toBe(`${listings}/abc`)
    expect(back.title).toBe("Pasta night")
    expect(state.kept).toHaveLength(2)
  })

  it("reloads the open frame on a second click of its link", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = reportMove(state, openFrame(state)!.id, "/admin/listings/abc", "Pasta night")
    state = openScreen(state, listings, underListings)
    const open = openFrame(state)!
    expect(open.load).toBe(1)
    expect(open.frameUrl).toBe(listings)
    expect(open.url).toBe(listings)
    expect(open.title).toBe("")
  })

  it("drops the frame shown longest ago past three, and never re-sorts the rest", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, project)
    state = openScreen(state, dashboard)
    state = openScreen(state, listings) // shown again, so project is now the oldest
    state = openScreen(state, video)
    expect(state.kept).toHaveLength(MAX_KEPT_FRAMES)
    expect(state.kept.map((frame) => frame.url)).toEqual([listings, dashboard, video])
  })

  it("lets a hidden frame's moves change only that frame", () => {
    let state = openScreen(NO_FRAMES, listings)
    const hidden = openFrame(state)!.id
    state = openScreen(state, project)
    state = reportMove(state, hidden, "/admin/listings/xyz", "Taco Tuesday")
    expect(openFrame(state)!.url).toBe(project)
    expect(state.kept.find((frame) => frame.id === hidden)!.url).toBe(`${listings}/xyz`)
  })

  it("reloads the page the frame is on now, not the one its link opened", () => {
    let state = openScreen(NO_FRAMES, dashboard)
    state = reportMove(state, openFrame(state)!.id, "/admin/listings/abc", "Pasta night")
    state = reloadOpen(state)
    const open = openFrame(state)!
    expect(open.frameUrl).toBe(`${listings}/abc`)
    expect(open.load).toBe(1)
    expect(open.title).toBe("Pasta night")
    expect(reloadOpen(closeAll(state))).toEqual(closeAll(state))
  })

  it("follows Back and Forward without reloading a frame already there", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, project)
    const before = state
    expect(showAddress(state, project)).toBe(before)
    state = showAddress(state, listings)
    expect(openFrame(state)!.url).toBe(listings)
    expect(openFrame(state)!.load).toBe(0)
    state = showAddress(state, null)
    expect(openFrame(state)).toBeNull()
    expect(state.kept).toHaveLength(2)
  })
})

describe("starting state", () => {
  it("is empty", () => {
    const empty: Frames = NO_FRAMES
    expect(openFrame(empty)).toBeNull()
    expect(closeAll(empty)).toBe(empty)
  })
})
