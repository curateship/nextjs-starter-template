import { describe, expect, it } from "vitest"

import {
  closeAll,
  DEFAULT_KEPT_FRAMES,
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
    expect(state.kept).toHaveLength(DEFAULT_KEPT_FRAMES)
    expect(state.kept.map((frame) => frame.url)).toEqual([listings, dashboard, video])
  })

  it("keeps as many frames as the cap it is given", () => {
    let state = openScreen(NO_FRAMES, listings, "", null, 5)
    for (const url of [project, dashboard, video]) state = openScreen(state, url, "", null, 5)
    expect(state.kept).toHaveLength(4)
    // Lowered back to three: the next screen opened drops the two shown longest ago.
    state = openScreen(state, "http://localhost:3016/carousels", "", null, 3)
    expect(state.kept.map((frame) => frame.url)).toEqual([
      dashboard,
      video,
      "http://localhost:3016/carousels",
    ])
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

describe("the screen that stays loaded", () => {
  const trade = "https://trade.barelycompany.com/protocols/hyper-liquid"

  it("is never dropped, and three other screens stay loaded beside it", () => {
    let state = openScreen(NO_FRAMES, trade, "Trade", trade)
    for (const url of [listings, project, dashboard, video]) {
      state = openScreen(state, url, "", trade)
    }
    expect(state.kept.map((frame) => frame.url)).toEqual([trade, project, dashboard, video])
    const back = openScreen(state, trade, "", trade)
    expect(openFrame(back)!.url).toBe(trade)
    expect(openFrame(back)!.load).toBe(0)
  })

  it("drops back to three once it stops staying loaded", () => {
    let state = openScreen(NO_FRAMES, trade, "", trade)
    for (const url of [listings, project, dashboard]) state = openScreen(state, url, "", trade)
    expect(state.kept).toHaveLength(4)
    state = openScreen(state, video)
    expect(state.kept.map((frame) => frame.url)).toEqual([project, dashboard, video])
  })

  it("is kept when Back or Forward opens another screen", () => {
    let state = openScreen(NO_FRAMES, trade, "", trade)
    for (const url of [listings, project, dashboard]) state = openScreen(state, url, "", trade)
    state = showAddress(state, video, "", trade)
    expect(state.kept.map((frame) => frame.url)).toEqual([trade, project, dashboard, video])
  })
})

describe("starting state", () => {
  it("is empty", () => {
    expect(openFrame(NO_FRAMES)).toBeNull()
    expect(closeAll(NO_FRAMES)).toBe(NO_FRAMES)
  })
})
