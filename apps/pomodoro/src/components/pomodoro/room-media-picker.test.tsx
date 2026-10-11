// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { describe, expect, it, vi } from "vitest"

import { RoomMediaPicker } from "@/components/pomodoro/room-media-picker"
import { roomMediaChoices } from "@/lib/pomodoro/room-media-choices"
import { seededCatalog } from "@/lib/pomodoro/catalog-fixture"

/**
 * Host a room's cards (Tyler, 11 Oct 2026: "I'd have no idea what i picked
 * when the media is just text").
 */

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
// A picked background plays its film, which asks about reduced motion.
window.matchMedia ??= (() => ({
  matches: false,
  addEventListener: () => {},
  removeEventListener: () => {},
})) as unknown as typeof window.matchMedia

const preview = {
  previewing: null,
  playing: false,
  failed: false,
  toggle: vi.fn(),
  stop: vi.fn(),
}

function draw(kind: "sound" | "background", canUsePremiumMedia: boolean) {
  const onPick = vi.fn()
  const onLocked = vi.fn()
  const host = document.createElement("div")
  document.body.replaceChildren(host)
  act(() =>
    createRoot(host).render(
      <RoomMediaPicker
        kind={kind}
        choices={roomMediaChoices(kind, seededCatalog, null, canUsePremiumMedia)}
        value=""
        preview={preview}
        filesState="ready"
        onRetryFiles={vi.fn()}
        onPick={onPick}
        onLocked={onLocked}
      />
    )
  )
  const card = (value: string) =>
    document.querySelector<HTMLButtonElement>(`[data-choice="${value}"]`)!
  return { onPick, onLocked, card }
}

describe("Host a room's cards", () => {
  it("sends a member without Pro to the plans from a Pro card, without picking it", () => {
    const { onPick, onLocked, card } = draw("background", false)
    expect(card("scene:fireplace").getAttribute("aria-label")).toBe(
      "Fireplace, a Pro background. See the plans"
    )
    act(() => card("scene:fireplace").click())
    expect(onLocked).toHaveBeenCalledTimes(1)
    expect(onPick).not.toHaveBeenCalled()
  })

  it("lets a Pro host pick a Pro card", () => {
    const { onPick, onLocked, card } = draw("background", true)
    act(() => card("scene:fireplace").click())
    expect(onPick).toHaveBeenCalledWith("scene:fireplace")
    expect(onLocked).not.toHaveBeenCalled()
  })

  it("draws a background mix as up to four of its pictures", () => {
    const { card } = draw("background", true)
    expect(
      [...card("shuffle").querySelectorAll("img")].map((image) => image.getAttribute("src"))
    ).toEqual([
      "/backgrounds/thumbs-lofi_girl.png",
      "/backgrounds/thumbs-ambient.png",
      "/backgrounds/thumbs-plain.png",
      "/backgrounds/thumbs-stars.png",
    ])
  })

  it("stops a playing preview when a sound mix is picked, since a mix has no one sound", () => {
    const { onPick, card } = draw("sound", true)
    preview.stop.mockClear()
    act(() => card("shuffle").click())
    expect(onPick).toHaveBeenCalledWith("shuffle")
    expect(preview.stop).toHaveBeenCalledTimes(1)
    expect(preview.toggle).not.toHaveBeenCalled()
  })
})
