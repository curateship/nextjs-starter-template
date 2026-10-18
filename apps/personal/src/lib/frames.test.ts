import { describe, expect, it } from "vitest"

import {
  closeAll,
  MAX_KEPT_FRAMES,
  NO_FRAMES,
  openFrame,
  openScreen,
  reloadOpen,
  showAddress,
} from "@/lib/frames"

const listings = "http://localhost:3015/admin/listings"
const dashboard = "http://localhost:3015/admin/dashboard"
const project = "http://localhost:3020/dashboard"
const video = "http://localhost:3016/admin"

describe("kept frames", () => {
  it("shows a kept frame again as it was, with no reload", () => {
    let state = openScreen(NO_FRAMES, listings, "Listings")
    const first = openFrame(state)!
    state = openScreen(state, project)
    state = openScreen(state, listings)
    const back = openFrame(state)!
    expect(back.id).toBe(first.id)
    expect(back.load).toBe(0)
    expect(back.title).toBe("Listings")
    expect(state.kept).toHaveLength(2)
  })

  it("loads the open screen again on a second click", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, listings)
    expect(state.kept).toHaveLength(1)
    expect(openFrame(state)!.load).toBe(1)
  })

  it("gives another screen of the same app a frame of its own", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, dashboard)
    expect(state.kept).toHaveLength(2)
    expect(openFrame(state)!.url).toBe(dashboard)
    expect(openFrame(state)!.load).toBe(0)
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

  it("reloads only the open frame", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, project)
    state = reloadOpen(state)
    expect(state.kept.map((frame) => frame.load)).toEqual([0, 1])
    expect(reloadOpen(closeAll(state))).toEqual(closeAll(state))
  })

  it("follows Back and Forward without reloading a frame already there", () => {
    let state = openScreen(NO_FRAMES, listings)
    state = openScreen(state, project)
    state = showAddress(state, listings)
    expect(openFrame(state)!.url).toBe(listings)
    expect(openFrame(state)!.load).toBe(0)
    expect(showAddress(state, listings)).toBe(state)
    state = showAddress(state, null)
    expect(state.openId).toBeNull()
    expect(state.kept).toHaveLength(2)
  })
})

describe("starting state", () => {
  it("is empty", () => {
    expect(openFrame(NO_FRAMES)).toBeNull()
    expect(closeAll(NO_FRAMES)).toBe(NO_FRAMES)
  })
})
