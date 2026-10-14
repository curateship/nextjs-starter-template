// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { PhoneRecord, PhonesPage } from "@/lib/api/phones/phones"

const navigation = vi.hoisted(() => ({ navigate: vi.fn(), invalidate: vi.fn(async () => {}) }))
vi.mock("@tanstack/react-router", () => ({
  Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  useNavigate: () => navigation.navigate,
  useRouter: () => ({ invalidate: navigation.invalidate }),
}))
vi.mock("@/components/shell/shell-layout", () => ({
  useShellRuntime: () => ({ config: { dashboardRowsPerPage: 25 } }),
}))
const toasts = vi.hoisted(() => ({ errors: [] as string[] }))
vi.mock("@/lib/toast/error-toast", () => ({
  showErrorToast: (message: string) => toasts.errors.push(message),
  dismissErrorToast: () => {},
}))

const api = vi.hoisted(() => ({
  changePhones: vi.fn(),
  disconnectPhoneRack: vi.fn(),
  loadPhoneActions: vi.fn(),
  makePairingCode: vi.fn(),
  runPhoneAction: vi.fn(),
  savePhone: vi.fn(),
}))
vi.mock("@/lib/api/phones/phones", () => ({
  ...api,
  getPhoneErrorMessage: (error: unknown) => (error instanceof Error ? error.message : "failed"),
}))

import { TooltipProvider } from "@/components/ui/tooltip"

import { PhonesDashboard } from "./phones-dashboard"

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true })

function phone(patch: Partial<PhoneRecord>): PhoneRecord {
  return {
    id: "p1",
    name: "Pixel 8a",
    model: "Pixel 8a",
    androidVersion: "16",
    serial: "A1",
    simCarrier: "Mint Mobile",
    simNumber: "555 0100",
    connection: "sim",
    proxy: null,
    held: false,
    notes: "",
    folderId: null,
    labelId: null,
    tags: [],
    shelfSlot: "",
    usbPort: "usb:1-1",
    status: "connected",
    offlineReason: "",
    lastSeenAt: new Date(),
    accounts: [],
    createdAt: new Date(),
    ...patch,
  }
}

const PAGE: PhonesPage = {
  phones: [
    phone({ accounts: [{ id: "a1", platform: "reddit", handle: "quiet_builder", blocked: false }] }),
    phone({
      id: "p2",
      name: "Galaxy A15",
      serial: "B2",
      status: "offline",
      offlineReason: "Not plugged in",
      shelfSlot: "4",
      connection: "wifi",
      proxy: { id: "x1", label: "US home line", host: "gate.test" },
    }),
  ],
  racks: [
    {
      id: "r1",
      name: "Tyler's Mac",
      platform: "macOS 26.0",
      version: "2026.10.13.1",
      live: true,
      seenAt: new Date(),
      pairedAt: new Date(),
      updateNote: "Went back to 2026.10.13.1, because 0.0.0-broken stopped with code 1 before it checked in.",
      upToDate: true,
    },
  ],
  rackVersion: "2026.10.13.1",
  folders: [],
  labels: [],
  proxies: [{ id: "x1", label: "US home line", host: "gate.test" }],
}

/**
 * The Phones dashboard, rendered from the real components with the server
 * faked: what each row says, the rack window's code and Disconnect, and a
 * phone's window asking the rack for a check.
 */
describe("Phones dashboard", () => {
  let container: HTMLDivElement
  let root: ReturnType<typeof createRoot>

  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    for (const fn of Object.values(api)) fn.mockReset()
    navigation.navigate.mockReset()
    toasts.errors = []
    container = document.createElement("div")
    document.body.append(container)
    root = createRoot(container)
  })

  afterEach(() => {
    act(() => root.unmount())
    container.remove()
    vi.useRealTimers()
  })

  async function render(page: PhonesPage, openId?: string) {
    await act(async () => {
      root.render(
        <TooltipProvider>
          <PhonesDashboard initial={page} openId={openId} />
        </TooltipProvider>
      )
    })
  }

  const text = () => document.body.textContent ?? ""
  const button = (name: string) => {
    const found = Array.from(document.querySelectorAll("button")).find(
      (one) => one.textContent?.trim() === name || one.getAttribute("aria-label") === name
    )
    if (!found) throw new Error(`No button "${name}"`)
    return found
  }
  const click = async (name: string) => {
    await act(async () => {
      button(name).click()
    })
  }

  it("shows each phone with its account, status, slot and carrier", async () => {
    await render(PAGE)
    const rows = Array.from(container.querySelectorAll("tbody tr")).map((row) => row.textContent)
    expect(rows[0]).toContain("Galaxy A15")
    expect(rows[0]).toContain("Offline· slot 4")
    expect(rows[0]).toContain("Not plugged in")
    expect(rows[0]).toContain("Wi-Fi through US home line")
    expect(rows[1]).toContain("Pixel 8a")
    expect(rows[1]).toContain("Reddit: u/quiet_builder")
    expect(rows[1]).toContain("Connected")
    expect(rows[1]).toContain("Mint Mobile 555 0100")
  })

  it("says how to start when there are no phones and no rack", async () => {
    await render({ ...PAGE, phones: [], racks: [] })
    expect(text()).toContain("No phones yet. Press Rack to connect the computer the phones plug into")
  })

  it("makes a pairing code with the whole command, and disconnects the rack after asking", async () => {
    api.makePairingCode.mockResolvedValue({
      code: "ABCD-EFGH",
      expiresAt: new Date(),
      command: "curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH",
    })
    api.disconnectPhoneRack.mockResolvedValue(undefined)
    await render(PAGE)

    await click("Rack connected")
    expect(text()).toContain("macOS 26.0")
    expect(text()).toContain("2026.10.13.1, the newest")
    expect(text()).toContain("Went back to 2026.10.13.1")

    await click("Make a pairing code")
    expect(text()).toContain("curl -fsSL http://localhost:3018/api/rack/install.sh | bash -s -- ABCD-EFGH")

    await click("Disconnect this rack")
    expect(text()).toContain("Disconnect this rack?")
    expect(api.disconnectPhoneRack).not.toHaveBeenCalled()
    await click("Disconnect rack")
    expect(api.disconnectPhoneRack).toHaveBeenCalledWith("r1")
  })

  it("opens a phone's window and asks the rack to read the Android version", async () => {
    api.loadPhoneActions.mockResolvedValue([])
    api.runPhoneAction.mockResolvedValue({ id: "act1" })
    await render(PAGE, "p1")
    expect(text()).toContain("Where it sits")
    expect((document.getElementById("phone-usb") as HTMLInputElement).value).toBe("usb:1-1")

    const checks = Array.from(document.querySelectorAll('[role="tab"]')).find((tab) => tab.textContent === "Checks")!
    await act(async () => {
      checks.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }))
    })
    expect(text()).toContain("No checks run on this phone yet.")

    api.loadPhoneActions.mockResolvedValue([
      {
        id: "act1",
        action: "phone/android-version",
        status: "done",
        answer: "Settings says Android 16, the same as Android itself reports.",
        error: "",
        createdAt: new Date(),
        finishedAt: new Date(),
        screenshots: ["data:image/jpeg;base64,/9j/AAAA"],
      },
    ])
    await click("Read the Android version from Settings")
    expect(api.runPhoneAction).toHaveBeenCalledWith("p1", "phone/android-version")
    expect(text()).toContain("Settings says Android 16, the same as Android itself reports.")
    expect(document.querySelector('img[alt^="What the phone\'s screen showed"]')).not.toBeNull()
  })

  it("refuses to save a phone with no name, keeping what was typed", async () => {
    await render(PAGE, "p1")
    const name = document.getElementById("phone-name") as HTMLInputElement
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!
      setter.call(name, "")
      name.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click("Save changes")
    expect(api.savePhone).not.toHaveBeenCalled()
    expect(toasts.errors).toEqual(["Give the phone a name first."])
    expect(name.getAttribute("aria-invalid")).toBe("true")
  })
})
