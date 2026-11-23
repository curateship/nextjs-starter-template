// @vitest-environment jsdom

import * as React from "react"
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({ upload: vi.fn() }))

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn(() => "error"), dismiss: vi.fn() },
}))
vi.mock("@/lib/api/pomodoro/media-uploads", () => ({
  getPomodoroUploadErrorMessage: () => "error",
  isUploadCancelled: () => false,
  suggestPomodoroUploadLabels: vi.fn(async () => null),
  uploadPomodoroMedia: api.upload,
}))
// The parts of the window this test does not reach.
vi.mock("@/components/pomodoro/pixabay-import-panel", () => ({
  PixabayImportPanel: () => null,
}))
vi.mock("@/components/pomodoro/share-fields", () => ({ ShareFields: () => null }))
vi.mock("@/components/pomodoro/tags-field", () => ({ TagsField: () => null }))
vi.mock("@/components/pomodoro/trim-strip", () => ({ TrimStrip: () => null }))
vi.mock("@/components/ui/field-label", () => ({
  FieldLabel: ({ children }: { children: React.ReactNode }) => (
    <label>{children}</label>
  ),
}))

import { UploadWindow } from "@/components/pomodoro/upload-window"
import type { UploadLibrary } from "@/lib/api/pomodoro/media-uploads"

const library = {
  limitBytes: 10_000_000,
  usedBytes: 0,
  suggestLabels: false,
  knownTags: [],
  uploads: [],
} as unknown as UploadLibrary

let root: Root
const footerButtons = () =>
  [...document.querySelectorAll('[data-slot="dialog-footer"] button')].map(
    (element) => element.textContent
  )

async function choose(file: File) {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]')
  if (!input) throw new Error("No file input")
  Object.defineProperty(input, "files", { value: [file], configurable: true })
  await act(async () => {
    input.dispatchEvent(new Event("change", { bubbles: true }))
  })
}

describe("the upload window's footer", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    URL.createObjectURL = vi.fn(() => "blob:preview")
    URL.revokeObjectURL = vi.fn()
    api.upload.mockReset()
    const host = document.createElement("div")
    document.body.appendChild(host)
    root = createRoot(host)
  })
  afterEach(() => {
    act(() => root.unmount())
    document.body.replaceChildren()
  })

  it("keeps Cancel and Upload when every file was refused, never Done", async () => {
    await act(async () => {
      root.render(
        <UploadWindow
          open
          onClose={() => undefined}
          purpose="sound"
          library={library}
          onUploaded={() => undefined}
        />
      )
    })
    // A picture is the wrong kind for the sounds tab, so the browser refuses it.
    await choose(new File(["x"], "photo.png", { type: "image/png" }))

    expect(document.body.textContent).toContain("wrong kind for here")
    expect(footerButtons()).not.toContain("Done")
    expect(footerButtons()).toContain("Cancel")

    const upload = [
      ...document.querySelectorAll<HTMLButtonElement>(
        '[data-slot="dialog-footer"] button'
      ),
    ].find((element) => element.textContent?.startsWith("Upload"))
    if (!upload) throw new Error("No Upload button")
    await act(async () => upload.click())
    expect(api.upload).not.toHaveBeenCalled()
    expect(document.body.textContent).toContain(
      "None of these files can be uploaded."
    )
  })
})
