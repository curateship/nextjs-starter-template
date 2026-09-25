// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mediaApi = vi.hoisted(() => ({
  listMedia: vi.fn(),
}))
const errorToast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  show: vi.fn(),
}))

vi.mock("@/lib/api/media/media", () => ({
  getMediaErrorMessage: (error: unknown) => String(error),
  listMedia: mediaApi.listMedia,
  uploadMedia: vi.fn(),
}))

vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: errorToast.dismiss,
  showErrorToast: errorToast.show,
}))

import { MediaPicker } from "@/components/media/media-picker"
import { Dialog } from "@/components/ui/dialog"

const firstFile = {
  id: "media-1",
  filename: "first.png",
  original_name: "first.png",
  alt_text: "First",
  file_size: 100,
  mime_type: "image/png",
  file_type: "image" as const,
  url: "https://example.com/first.png",
  created_at: "2026-08-29T12:00:00.000Z",
  updated_at: "2026-08-29T12:00:00.000Z",
}

function page(media = [firstFile]) {
  return {
    media,
    total: media.length,
    page: 1,
    page_size: 12,
    total_pages: media.length ? 1 : 0,
  }
}

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype,
    "value"
  )?.set
  setter?.call(input, value)
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function footerSelectButton(host: HTMLElement) {
  const button = Array.from(host.querySelectorAll("button")).find(
    (candidate) => candidate.textContent?.trim() === "Select"
  )
  if (!button) throw new Error("Select button was not rendered")
  return button
}

describe("MediaPicker", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    mediaApi.listMedia.mockReset()
    errorToast.show.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("selects the highlighted file on the normal path", async () => {
    mediaApi.listMedia.mockResolvedValue(page())
    const onSelectMedia = vi.fn()
    const onOpenChange = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <Dialog open>
          <MediaPicker
            inline
            open
            onOpenChange={onOpenChange}
            onSelectMedia={onSelectMedia}
          />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    const tile = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Select first.png"]'
    )
    expect(tile).not.toBeNull()
    await act(async () => tile?.click())
    await act(async () => footerSelectButton(host).click())

    expect(onSelectMedia).toHaveBeenCalledWith(
      "https://example.com/first.png",
      "First"
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)

    await act(async () => root.unmount())
    host.remove()
  })

  it("closes an inline picker on Escape without closing its owner", async () => {
    mediaApi.listMedia.mockResolvedValue(page())
    const onOpenChange = vi.fn()
    const ownerKeyDown = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    document.addEventListener("keydown", ownerKeyDown)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <Dialog open>
          <MediaPicker
            inline
            open
            onOpenChange={onOpenChange}
            onSelectMedia={vi.fn()}
          />
        </Dialog>
      )
    })

    const escape = new KeyboardEvent("keydown", {
      key: "Escape",
      bubbles: true,
      cancelable: true,
    })
    await act(async () => document.body.dispatchEvent(escape))

    expect(escape.defaultPrevented).toBe(true)
    expect(onOpenChange).toHaveBeenCalledWith(false)
    expect(ownerKeyDown).not.toHaveBeenCalled()

    document.removeEventListener("keydown", ownerKeyDown)
    await act(async () => root.unmount())
    host.remove()
  })

  it("refuses a file after a search removes it from the visible results", async () => {
    vi.useFakeTimers()
    mediaApi.listMedia
      .mockResolvedValueOnce(page())
      .mockResolvedValueOnce(page([]))
    const onSelectMedia = vi.fn()
    const onOpenChange = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <Dialog open>
          <MediaPicker
            inline
            open
            onOpenChange={onOpenChange}
            onSelectMedia={onSelectMedia}
          />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    await act(async () => {
      host
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select first.png"]'
        )
        ?.click()
    })

    const search = host.querySelector<HTMLInputElement>(
      'input[aria-label="Search media"]'
    )
    expect(search).not.toBeNull()
    await act(async () => {
      if (search) setInputValue(search, "something else")
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(250)
    })
    await act(async () => await Promise.resolve())

    expect(host.textContent).toContain("Nothing matched")
    expect(footerSelectButton(host).hasAttribute("aria-invalid")).toBe(false)
    await act(async () => footerSelectButton(host).click())

    expect(onSelectMedia).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(errorToast.show).toHaveBeenCalledWith(
      "Choose a file before selecting it."
    )

    await act(async () => root.unmount())
    host.remove()
  })
})
