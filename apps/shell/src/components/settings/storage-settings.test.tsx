// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const api = vi.hoisted(() => ({
  load: vi.fn(),
  save: vi.fn(),
  test: vi.fn(),
}))

vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ reportSaveStatus: vi.fn() }),
}))
vi.mock("@/lib/toast/error-toast", () => ({
  dismissErrorToast: vi.fn(),
  showErrorToast: vi.fn(),
  useErrorToast: vi.fn(),
}))
vi.mock("@/lib/api/storage", () => ({
  clearStorage: vi.fn(),
  getStorageErrorMessage: (error: unknown) =>
    error instanceof Error && error.message === "INCOMPLETE"
      ? "Fill in the account ID, access key ID and bucket name first."
      : String(error),
  loadStorageSettings: api.load,
  saveStorage: api.save,
  testStorage: api.test,
}))

import { StorageSettings } from "@/components/settings/storage-settings"
import { TooltipProvider } from "@/components/ui/tooltip"
import type { StorageSettingsStatus } from "@/lib/api/storage"

const saved: StorageSettingsStatus = {
  accountId: "a".repeat(32),
  accessKeyId: "key-1",
  bucketName: "media",
  publicUrl: "https://media.example.com",
  envFields: [],
  secretConfigured: true,
  maskedSecret: "••••abcd",
  secretFromEnv: false,
  secretUnreadable: false,
  ready: true,
  anySaved: true,
}

function setInputValue(input: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(
    input,
    value
  )
  input.dispatchEvent(new Event("input", { bubbles: true }))
}

function field(id: string) {
  const input = document.querySelector<HTMLInputElement>(`#storage-${id}`)
  if (!input) throw new Error(`no ${id} box`)
  return input
}

/** Leaves a box the way a browser does, so React's onBlur hears it. */
async function leave(input: HTMLInputElement) {
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
  await act(async () => await Promise.resolve())
}

async function render() {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  await act(async () => {
    root.render(
      <TooltipProvider>
        <StorageSettings />
      </TooltipProvider>
    )
  })
  await act(async () => await Promise.resolve())
  return async () => {
    await act(async () => root.unmount())
    host.remove()
  }
}

describe("StorageSettings", () => {
  beforeEach(() => {
    ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
    vi.useFakeTimers({ shouldAdvanceTime: true })
    api.load.mockReset().mockResolvedValue(saved)
    api.save.mockReset().mockImplementation(async (input) => ({ ...saved, ...input }))
    api.test.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    document.body.innerHTML = ""
  })

  it("typing alone saves nothing, even after the old 1.2 second wait", async () => {
    const close = await render()

    await act(async () => setInputValue(field("bucketName"), "media-ne"))
    await act(async () => vi.advanceTimersByTime(5000))

    expect(api.test).not.toHaveBeenCalled()
    expect(api.save).not.toHaveBeenCalled()
    await close()
  })

  it("leaving a box with failing details keeps them off the saved settings", async () => {
    api.test.mockResolvedValue({ result: "rejected", reason: "NoSuchBucket" })
    const close = await render()

    await act(async () => setInputValue(field("bucketName"), "wrong-bucket"))
    await leave(field("bucketName"))

    expect(api.test).toHaveBeenCalledWith(
      expect.objectContaining({ bucketName: "wrong-bucket" })
    )
    expect(api.save).not.toHaveBeenCalled()
    const verdict = document.querySelector("#storage-verdict")
    expect(verdict?.getAttribute("role")).toBe("alert")
    expect(verdict?.textContent).toBe(
      "Not saved, so the bucket in use stays in use. Cloudflare turned the request away: NoSuchBucket"
    )
    expect(field("bucketName").value).toBe("wrong-bucket")
    expect(field("bucketName").getAttribute("aria-invalid")).toBe("true")
    await close()
  })

  it("an incomplete set is held back with the reason, not a toast", async () => {
    api.test.mockRejectedValue(new Error("INCOMPLETE"))
    const close = await render()

    await act(async () => setInputValue(field("accessKeyId"), ""))
    await leave(field("accessKeyId"))

    expect(api.save).not.toHaveBeenCalled()
    expect(document.querySelector("#storage-verdict")?.textContent).toContain(
      "Fill in the account ID, access key ID and bucket name first."
    )
    await close()
  })

  it("details that pass are saved once and show a tick", async () => {
    api.test.mockResolvedValue({ result: "ok" })
    const close = await render()

    await act(async () => setInputValue(field("bucketName"), "media-new"))
    await leave(field("bucketName"))

    expect(api.save).toHaveBeenCalledTimes(1)
    expect(api.save).toHaveBeenCalledWith(
      expect.objectContaining({ bucketName: "media-new", secretAccessKey: undefined })
    )
    const verdict = document.querySelector("#storage-verdict")
    expect(verdict?.getAttribute("role")).toBe("status")
    expect(verdict?.querySelector("svg")).not.toBeNull()
    expect(verdict?.textContent).toContain("It works.")
    await close()
  })

  it("tabbing through untouched boxes tests and saves nothing", async () => {
    const close = await render()

    for (const id of ["accountId", "accessKeyId", "bucketName", "publicUrl"]) {
      await leave(field(id))
    }
    // A trailing slash is stored stripped, so it is not a change either.
    await act(async () => setInputValue(field("publicUrl"), "https://media.example.com/"))
    await leave(field("publicUrl"))

    expect(api.test).not.toHaveBeenCalled()
    expect(api.save).not.toHaveBeenCalled()
    await close()
  })
})
