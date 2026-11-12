// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mediaApi = vi.hoisted(() => ({
  uploadMedia: vi.fn(),
  loadAdminMediaPage: vi.fn(),
}))
const toasts = vi.hoisted(() => {
  const toast = vi.fn()
  return { toast, showError: vi.fn() }
})

vi.mock("@tanstack/react-router", () => ({
  useNavigate: () => vi.fn(),
  getRouteApi: () => ({ useLoaderData: () => ({}) }),
  Link: () => null,
  useRouter: () => ({ invalidate: vi.fn() }),
}))
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

import type { AdminFrame } from "@/components/admin-dashboard/admin-dashboard"
import { MediaTab } from "@/components/admin-dashboard/media-tab"
import { UploadLine } from "@/components/media/upload-line"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { PauseGate } from "@/lib/media/upload-in-parts"

const emptyPage = {
  media: { media: [], total: 0, page: 1, page_size: 20, total_pages: 0 },
  owners: [],
  pageSize: 20,
  storage: { libraryBytes: 0, extras: [] },
}

type UploadOptions = {
  onProgress: (fraction: number) => void
  signal: AbortSignal
  gate: PauseGate
}

/** The Admin frame, cut down to the section's header and middle. */
const frame: AdminFrame = (panels) => (
  <>
    {panels.header}
    {panels.middle}
  </>
)

/** The section, and the upload line the shell layout draws beside every page. */
function renderPage(host: HTMLElement, { withPage = true } = {}) {
  const root = createRoot(host)
  const draw = (page: boolean) =>
    root.render(
      // The app shell provides this around every page.
      <TooltipProvider>
        {page ? (
          <MediaTab
            loaded={emptyPage}
            search={{ tab: "media" }}
            currentUserId="admin-1"
            heading={<h2>Media library</h2>}
            headingEnd={null}
            frame={frame}
          />
        ) : null}
        <UploadLine />
      </TooltipProvider>
    )
  draw(withPage)
  return { root, leavePage: () => draw(false) }
}

async function pickFiles(host: HTMLElement, files: File[]) {
  const input = host.querySelector<HTMLInputElement>('input[type="file"]')
  expect(input).not.toBeNull()
  Object.defineProperty(input, "files", { value: files, configurable: true })
  await act(async () => {
    input?.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await act(async () => await Promise.resolve())
}

const uploadLine = (host: HTMLElement) =>
  host.querySelector('[aria-label="Uploads"]')?.textContent ?? null

describe("the Media library's uploads", () => {
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

  it("counts the batch on the page, shows the file on the upload line, and Cancel stops the rest", async () => {
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
    let page!: ReturnType<typeof renderPage>
    await act(async () => {
      page = renderPage(host)
    })

    await pickFiles(
      host,
      ["first.mp4", "second.mp4", "third.mp4"].map(
        (name) => new File(["video"], name, { type: "video/mp4" })
      )
    )

    expect(host.querySelector('[role="status"]:not([aria-label])')?.textContent).toBe(
      "1 of 3 uploaded"
    )
    expect(uploadLine(host)).toBe("Uploading second.mp4, 42%")

    const cancel = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Cancel"
    )
    expect(cancel).toBeDefined()
    await act(async () => cancel?.click())
    await act(async () => await Promise.resolve())

    expect(secondSignal?.aborted).toBe(true)
    // The third file is never started once Cancel is pressed.
    expect(mediaApi.uploadMedia).toHaveBeenCalledTimes(2)
    expect(uploadLine(host)).toBeNull()
    expect(toasts.toast).toHaveBeenCalledWith(
      "Upload cancelled. 1 file was uploaded before it stopped."
    )
    expect(toasts.showError).not.toHaveBeenCalled()
    // The finished file is in the library, so the list reloads.
    expect(mediaApi.loadAdminMediaPage).toHaveBeenCalled()

    await act(async () => page.root.unmount())
  })

  it("keeps uploading after the page is left, and pauses from the upload line", async () => {
    let options!: UploadOptions
    let finish!: () => void
    mediaApi.uploadMedia.mockImplementation(
      (_file: File, _altText: undefined, given: UploadOptions) => {
        options = given
        given.onProgress(0.075)
        return new Promise((resolve) => {
          finish = () => resolve({})
        })
      }
    )
    const host = document.createElement("div")
    document.body.appendChild(host)
    let page!: ReturnType<typeof renderPage>
    await act(async () => {
      page = renderPage(host)
    })
    await pickFiles(host, [
      new File(["video"], "beach.mov", { type: "video/quicktime" }),
    ])

    // One file has no batch count on the page; the line says it all.
    expect(host.querySelector('[role="status"]:not([aria-label])')).toBeNull()
    expect(uploadLine(host)).toBe("Uploading beach.mov, 7%")

    // Moving to another page leaves the upload going.
    await act(async () => page.leavePage())
    expect(host.querySelector('input[type="file"]')).toBeNull()
    expect(options.signal.aborted).toBe(false)
    expect(uploadLine(host)).toBe("Uploading beach.mov, 7%")

    const pause = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Pause beach.mov"]'
    )
    await act(async () => pause?.click())
    expect(options.gate.paused).toBe(true)
    expect(uploadLine(host)).toBe("Paused beach.mov at 7%")

    const resume = host.querySelector<HTMLButtonElement>(
      'button[aria-label="Resume beach.mov"]'
    )
    await act(async () => resume?.click())
    expect(options.gate.paused).toBe(false)

    await act(async () => finish())
    await act(async () => await Promise.resolve())
    expect(uploadLine(host)).toBeNull()

    await act(async () => page.root.unmount())
  })
})
