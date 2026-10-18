// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mediaApi = vi.hoisted(() => ({
  uploadMedia: vi.fn(),
  loadAdminMediaPage: vi.fn(),
}))
const toasts = vi.hoisted(() => {
  const toast = Object.assign(vi.fn(), { success: vi.fn(), warning: vi.fn() })
  return { toast, showError: vi.fn() }
})

vi.mock("@tanstack/react-router", () => ({ useNavigate: () => vi.fn() }))
vi.mock("sonner", () => ({ toast: toasts.toast }))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: toasts.showError,
}))
vi.mock("@/lib/api/media/media", () => ({
  getMediaErrorMessage: (error: unknown) => String(error),
  updateMedia: vi.fn(),
  uploadMedia: mediaApi.uploadMedia,
}))
vi.mock("@/lib/api/media/admin-media", () => ({
  cleanOrphanedMedia: vi.fn(),
  deleteMediaAsAdminAction: vi.fn(),
  getAdminMediaErrorMessage: (error: unknown) => String(error),
  loadAdminMediaItem: vi.fn(),
  loadAdminMediaPage: mediaApi.loadAdminMediaPage,
  loadOrphans: vi.fn(),
}))

import { MediaLibraryPage } from "@/components/media/media-library-page"
import { TooltipProvider } from "@/components/ui/tooltip"

const emptyPage = {
  media: { media: [], total: 0, page: 1, page_size: 20, total_pages: 0 },
  owners: [],
  pageSize: 20,
}

type UploadOptions = {
  onProgress: (fraction: number) => void
  signal: AbortSignal
}

describe("MediaLibraryPage uploads", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    mediaApi.uploadMedia.mockReset()
    mediaApi.loadAdminMediaPage.mockReset().mockResolvedValue(emptyPage)
    toasts.toast.mockReset()
    toasts.showError.mockReset()
  })

  afterEach(() => {
    document.body.innerHTML = ""
  })

  it("shows how far the video going up has got, and Cancel stops it and the rest", async () => {
    let secondSignal: AbortSignal | undefined
    mediaApi.uploadMedia.mockImplementation(
      async (file: File, _altText: undefined, options: UploadOptions) => {
        if (file.name === "first.mp4") {
          options.onProgress(1)
          return {}
        }
        secondSignal = options.signal
        options.onProgress(0.42)
        return new Promise((_resolve, reject) => {
          options.signal.addEventListener("abort", () =>
            reject(new DOMException("Upload cancelled", "AbortError"))
          )
        })
      }
    )
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        // The app shell provides this around every page.
        <TooltipProvider>
          <MediaLibraryPage
            initialData={emptyPage}
            initialOwnerId="all"
            currentUserId="admin-1"
          />
        </TooltipProvider>
      )
    })

    const input = host.querySelector<HTMLInputElement>('input[type="file"]')
    expect(input).not.toBeNull()
    const files = ["first.mp4", "second.mp4", "third.mp4"].map(
      (name) => new File(["video"], name, { type: "video/mp4" })
    )
    Object.defineProperty(input, "files", { value: files, configurable: true })
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }))
    })
    await act(async () => await Promise.resolve())

    const status = host.querySelector('[role="status"]')
    expect(status?.textContent).toBe("1 of 3 uploaded, second.mp4 at 42%")

    const cancel = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Cancel"
    )
    expect(cancel).toBeDefined()
    await act(async () => cancel?.click())
    await act(async () => await Promise.resolve())

    expect(secondSignal?.aborted).toBe(true)
    // The third file is never started once Cancel is pressed.
    expect(mediaApi.uploadMedia).toHaveBeenCalledTimes(2)
    expect(host.querySelector('[role="status"]')).toBeNull()
    expect(toasts.toast).toHaveBeenCalledWith(
      "Upload cancelled. 1 file was uploaded before it stopped."
    )
    expect(toasts.showError).not.toHaveBeenCalled()
    // The finished file is in the library, so the list reloads.
    expect(mediaApi.loadAdminMediaPage).toHaveBeenCalled()

    await act(async () => root.unmount())
  })

  it("reads one file's progress on its own", async () => {
    mediaApi.uploadMedia.mockImplementation(
      (_file: File, _altText: undefined, options: UploadOptions) => {
        options.onProgress(0.075)
        return new Promise(() => undefined)
      }
    )
    const host = document.createElement("div")
    document.body.appendChild(host)
    const root = createRoot(host)

    await act(async () => {
      root.render(
        // The app shell provides this around every page.
        <TooltipProvider>
          <MediaLibraryPage
            initialData={emptyPage}
            initialOwnerId="all"
            currentUserId="admin-1"
          />
        </TooltipProvider>
      )
    })
    const input = host.querySelector<HTMLInputElement>('input[type="file"]')
    Object.defineProperty(input, "files", {
      value: [new File(["video"], "beach.mov", { type: "video/quicktime" })],
      configurable: true,
    })
    await act(async () => {
      input?.dispatchEvent(new Event("change", { bubbles: true }))
    })

    expect(host.querySelector('[role="status"]')?.textContent).toBe(
      "Uploading beach.mov, 7%"
    )

    await act(async () => root.unmount())
  })
})
