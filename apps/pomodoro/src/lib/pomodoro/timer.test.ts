import { describe, expect, it } from "vitest"

import {
  createTimer,
  cycleSessionLabel,
  elapsedFocusLabel,
  elapsedSeconds,
  focusWouldBeLost,
  pauseTimer,
  startTimer,
} from "@/lib/pomodoro/timer"

describe("the session label on the dashboard", () => {
  it("names the focus you are in, counting to the rhythm's number", () => {
    expect(cycleSessionLabel("focus", 0, 4)).toBe(
      "Session 1 of 4 before the long break"
    )
    expect(cycleSessionLabel("focus", 3, 4)).toBe(
      "Session 4 of 4 before the long break"
    )
    expect(cycleSessionLabel("focus", 1, 2)).toBe(
      "Session 2 of 2 before the long break"
    )
  })

  it("names the focus that comes next while a break runs", () => {
    expect(cycleSessionLabel("short", 1, 4)).toBe(
      "Next: session 2 of 4 before the long break"
    )
  })

  it("points a long break at the first focus of the new cycle", () => {
    expect(cycleSessionLabel("long", 4, 4)).toBe(
      "Next: session 1 of 4 before the long break"
    )
    expect(cycleSessionLabel("long", 2, 2)).toBe(
      "Next: session 1 of 2 before the long break"
    )
  })

  it("never counts past the rhythm, even on a count left over from a longer one", () => {
    expect(cycleSessionLabel("focus", 6, 2)).toBe(
      "Session 2 of 2 before the long break"
    )
    expect(cycleSessionLabel("focus", -3, 4)).toBe(
      "Session 1 of 4 before the long break"
    )
  })
})

describe("what a phase switch would throw away", () => {
  const start = 1_700_000_000_000

  it("has nothing to lose on a focus nobody has started", () => {
    const timer = createTimer("focus", 25)
    expect(elapsedSeconds(timer, start)).toBe(0)
    expect(focusWouldBeLost(timer, start)).toBe(false)
  })

  it("counts the minutes spent in a running focus", () => {
    const running = startTimer(createTimer("focus", 25), start)
    expect(elapsedSeconds(running, start + 19 * 60_000)).toBe(19 * 60)
    expect(focusWouldBeLost(running, start + 19 * 60_000)).toBe(true)
  })

  it("still counts the time spent in a focus that is paused midway", () => {
    const paused = pauseTimer(
      startTimer(createTimer("focus", 25), start),
      start + 5 * 60_000
    )
    expect(elapsedSeconds(paused)).toBe(5 * 60)
    expect(focusWouldBeLost(paused)).toBe(true)
  })

  it("never asks about a break, however far into it you are", () => {
    const running = startTimer(createTimer("short", 5), start)
    expect(focusWouldBeLost(running, start + 4 * 60_000)).toBe(false)
    const longBreak = startTimer(createTimer("long", 15), start)
    expect(focusWouldBeLost(longBreak, start + 60_000)).toBe(false)
  })

  it("counts the whole phase once the countdown has run out", () => {
    const finished = startTimer(createTimer("focus", 25), start)
    expect(elapsedSeconds(finished, start + 25 * 60_000)).toBe(25 * 60)
  })

  it("writes the spent time in whole minutes", () => {
    expect(elapsedFocusLabel(19 * 60)).toBe("19 minutes")
    expect(elapsedFocusLabel(60)).toBe("1 minute")
    expect(elapsedFocusLabel(119)).toBe("1 minute")
  })

  it("says so rather than reading zero minutes", () => {
    expect(elapsedFocusLabel(30)).toBe("Less than a minute")
    expect(elapsedFocusLabel(0)).toBe("Less than a minute")
    expect(elapsedFocusLabel(-5)).toBe("Less than a minute")
  })
})
