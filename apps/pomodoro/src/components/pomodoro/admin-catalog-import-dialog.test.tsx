// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  importCatalogFromPixabay: vi.fn(),
  loadPixabayKeyStatus: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: { success: api.success } }))
vi.mock("@/lib/toast/error-toast", () => ({ showErrorToast: api.error }))
vi.mock("@/lib/api/pomodoro/admin-catalog", () => ({
  importCatalogFromPixabay: api.importCatalogFromPixabay,
  getCatalogAdminErrorMessage: () => "That did not work.",
}))
vi.mock("@/lib/api/pomodoro/admin-pixabay", () => ({
  loadPixabayKeyStatus: api.loadPixabayKeyStatus,
  getPixabayKeyErrorMessage: () => "The key could not be read.",
}))
vi.mock("@tanstack/react-router", () => ({
  Link: ({
    children,
    to,
    params,
  }: {
    children: React.ReactNode
    to: string
    params?: { tab: string }
  }) => <a href={params ? to.replace("$tab", params.tab) : to}>{children}</a>,
}))

import { AdminCatalogImportDialog } from "@/components/pomodoro/admin-catalog-import-dialog"
import { TooltipProvider } from "@/components/ui/tooltip"

/**
 * The Import from Pixabay window, drawn for real in jsdom with the server
 * functions stubbed: the key check, each line's problem as it is typed, what
 * Import sends, and what the admin is told afterwards.
 */

const PHOTO = "https://pixabay.com/photos/forest-fog-195893/"
const FILM = "https://pixabay.com/videos/rain-window-28470/"
const MUSIC = "https://pixabay.com/music/lofi-lofi-chill-vlog-beats-573883/"

const onClose = vi.fn()
const onImported = vi.fn(async () => undefined)

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  globalThis.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  } as unknown as typeof ResizeObserver
  for (const mock of Object.values(api)) mock.mockReset()
  onClose.mockReset()
  api.loadPixabayKeyStatus.mockResolvedValue({ configured: true, maskedTail: "••••abcd", unreadable: false })
})
afterEach(() => document.body.replaceChildren())

async function open(kind: "theme" | "sound") {
  const host = document.createElement("div")
  document.body.appendChild(host)
  await act(async () => {
    createRoot(host).render(
      <TooltipProvider>
        <AdminCatalogImportDialog kind={kind} open onClose={onClose} onImported={onImported} />
      </TooltipProvider>
    )
  })
}

const box = () => document.querySelector("textarea") as HTMLTextAreaElement

async function type(value: string) {
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set
    setter?.call(box(), value)
    box().dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function pressImport() {
  await act(async () => {
    document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  })
}

describe("Import from Pixabay", () => {
  it("on Themes with no key, points to Settings → Pixabay and offers nothing to import", async () => {
    api.loadPixabayKeyStatus.mockResolvedValue({ configured: false, maskedTail: null, unreadable: false })
    await open("theme")
    expect(document.body.textContent).toContain("Add the Pixabay API key in Settings → Pixabay first.")
    expect(document.querySelector('a[href="/admin/settings/pomodoro-pixabay"]')?.textContent).toBe(
      "Open the Pixabay settings"
    )
    expect(box()).toBeNull()
    expect([...document.querySelectorAll("button")].map((button) => button.textContent)).toContain("Done")
  })

  it("shows each line's problem as it is typed and sends only the good lines", async () => {
    await open("theme")
    await type([PHOTO, MUSIC, "", "12345", FILM].join("\n"))
    expect(document.body.textContent).toContain("2 of 4 lines are ready to import.")
    expect([...document.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      "Line 2 is a music link, paste it on Sounds.",
      "Line 4 is a number, not the page link.",
    ])

    api.importCatalogFromPixabay.mockResolvedValue({
      added: 1,
      refused: [{ line: 5, reason: "is already in the catalogue as Rain window" }],
    })
    await pressImport()

    expect(api.importCatalogFromPixabay).toHaveBeenCalledWith("theme", [
      { line: 1, url: PHOTO },
      { line: 5, url: FILM },
    ])
    expect(api.success).toHaveBeenCalledWith(
      "1 theme added as a draft. 3 were refused: line 2 is a music link, paste it on Sounds; line 4 is a number, not the page link; line 5 is already in the catalogue as Rain window."
    )
    expect(onImported).toHaveBeenCalled()
    expect(onClose).toHaveBeenCalled()
  })

  it("keeps more than three refused lines in the box with their reasons, and counts them in the toast", async () => {
    await open("theme")
    await type([PHOTO, MUSIC, "1", "2", "https://example.com/a-1/"].join("\n"))
    api.importCatalogFromPixabay.mockResolvedValue({
      added: 0,
      refused: [{ line: 1, reason: "is already in the catalogue as Forest fog" }],
    })
    await pressImport()

    expect(api.error).toHaveBeenCalledWith(
      "0 themes added as drafts. 5 were refused. Their lines are left in the window with the reasons."
    )
    expect(onClose).not.toHaveBeenCalled()
    expect(box().value).toBe([PHOTO, MUSIC, "1", "2", "https://example.com/a-1/"].join("\n"))
    expect(document.querySelector("li")?.textContent).toBe(
      "Line 1 is already in the catalogue as Forest fog."
    )
    expect(document.body.textContent).toContain("0 of 5 lines are ready to import.")
  })

  it("refuses to send nothing, and says why", async () => {
    await open("theme")
    await pressImport()
    expect(api.importCatalogFromPixabay).not.toHaveBeenCalled()
    expect(api.error).toHaveBeenCalledWith("Paste at least one pixabay.com link.")
    expect(box().getAttribute("aria-invalid")).toBe("true")
  })

  it("on Sounds needs no key and says each sound waits for its file", async () => {
    await open("sound")
    expect(api.loadPixabayKeyStatus).not.toHaveBeenCalled()
    await type(MUSIC)
    api.importCatalogFromPixabay.mockResolvedValue({ added: 1, refused: [] })
    await pressImport()
    expect(api.success).toHaveBeenCalledWith("1 sound added as a draft. It needs its file from Pixabay.")
  })
})
