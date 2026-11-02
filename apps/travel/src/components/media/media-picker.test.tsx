// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mediaApi = vi.hoisted(() => ({
  listMedia: vi.fn(),
  uploadMedia: vi.fn(),
}))
const errorToast = vi.hoisted(() => ({
  dismiss: vi.fn(),
  show: vi.fn(),
}))

vi.mock("@/lib/api/media/media", () => ({
  getMediaErrorMessage: (error: unknown) => String(error),
  listMedia: mediaApi.listMedia,
  uploadMedia: mediaApi.uploadMedia,
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

/**
 * The picker is its own window, so its markup lands in a portal on `body`
 * rather than inside the element the test rendered into.
 */
function picker() {
  return document.body
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
    mediaApi.uploadMedia.mockReset()
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
            open
            onOpenChange={onOpenChange}
            onSelectMedia={onSelectMedia}
          />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    const tile = picker().querySelector<HTMLButtonElement>(
      'button[aria-label="Select first.png"]'
    )
    expect(tile).not.toBeNull()
    await act(async () => tile?.click())
    await act(async () => footerSelectButton(picker()).click())

    expect(onSelectMedia).toHaveBeenCalledWith(
      "https://example.com/first.png",
      "First"
    )
    expect(onOpenChange).toHaveBeenCalledWith(false)

    await act(async () => root.unmount())
    host.remove()
  })

  it("opens as its own window over the form that asked for it", async () => {
    mediaApi.listMedia.mockResolvedValue(page())
    const onOpenChange = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <Dialog open>
          <MediaPicker
            open
            onOpenChange={onOpenChange}
            onSelectMedia={vi.fn()}
          />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    // Nothing is drawn inside the form. The picker is a window of its own,
    // which is why a 96px picture field never has to hold a grid of tiles.
    expect(host.textContent).toBe("")
    const dialog = document.body.querySelector('[role="dialog"]')
    expect(dialog).not.toBeNull()
    expect(host.contains(dialog)).toBe(false)
    expect(dialog?.textContent).toContain("Select")

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
            open
            onOpenChange={onOpenChange}
            onSelectMedia={onSelectMedia}
          />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    await act(async () => {
      picker()
        .querySelector<HTMLButtonElement>(
          'button[aria-label="Select first.png"]'
        )
        ?.click()
    })

    const search = picker().querySelector<HTMLInputElement>(
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

    expect(picker().textContent).toContain("Nothing matched")
    expect(footerSelectButton(picker()).hasAttribute("aria-invalid")).toBe(
      false
    )
    await act(async () => footerSelectButton(picker()).click())

    expect(onSelectMedia).not.toHaveBeenCalled()
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(errorToast.show).toHaveBeenCalledWith(
      "Choose a file before selecting it."
    )

    await act(async () => root.unmount())
    host.remove()
  })

  it("shows how far a video has got, and the × cancels it quietly", async () => {
    mediaApi.listMedia.mockResolvedValue(page())
    // The preview is a blob address; jsdom has no such thing.
    URL.createObjectURL = vi.fn(() => "blob:preview")
    URL.revokeObjectURL = vi.fn()
    let uploadSignal: AbortSignal | undefined
    mediaApi.uploadMedia.mockImplementation(
      (
        _file: File,
        _altText: string,
        options: { onProgress: (fraction: number) => void; signal: AbortSignal }
      ) => {
        uploadSignal = options.signal
        options.onProgress(0.42)
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Upload cancelled", "AbortError"))
          )
        })
      }
    )
    const onSelectMedia = vi.fn()
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        <Dialog open>
          <MediaPicker open onOpenChange={vi.fn()} onSelectMedia={onSelectMedia} />
        </Dialog>
      )
    })
    await act(async () => await Promise.resolve())

    const input = picker().querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    const video = new File(["video"], "beach.mp4", { type: "video/mp4" })
    Object.defineProperty(input, "files", { value: [video], configurable: true })
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }))
    })

    const send = Array.from(picker().querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Upload and select"
    )
    expect(send).toBeDefined()
    await act(async () => send?.click())

    expect(mediaApi.uploadMedia).toHaveBeenCalledWith(video, "", expect.anything())
    expect(picker().textContent).toContain("Uploading, 42%")

    const cancel = Array.from(picker().querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Cancel upload"
    )
    expect(cancel).toBeDefined()
    await act(async () => cancel?.click())
    await act(async () => await Promise.resolve())

    expect(uploadSignal?.aborted).toBe(true)
    expect(picker().textContent).not.toContain("Uploading, 42%")
    expect(picker().textContent).not.toContain("beach.mp4")
    expect(errorToast.show).not.toHaveBeenCalled()
    expect(onSelectMedia).not.toHaveBeenCalled()

    await act(async () => root.unmount())
    host.remove()
  })
})
