// @vitest-environment jsdom

import { act } from "react"
import { createRoot } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import type { AppNoticeDetail, NoticeToLink } from "@/lib/app-options"

const { describeNotice, detailsFor } = vi.hoisted(() => ({
  describeNotice: vi.fn(),
  detailsFor: vi.fn(),
}))

vi.mock("@/lib/app-options", () => ({
  appNoticeDescription: (notice: NoticeToLink) => describeNotice(notice),
  appNotificationDetails: (notices: readonly NoticeToLink[]) =>
    detailsFor(notices),
}))
vi.mock("@/lib/notification-action", () => ({
  isOwnAppHref: (href: string) => href.startsWith("/"),
}))

const { useAppNotificationDetails } = await import(
  "@/lib/hooks/use-app-notification-details"
)

const notice: NoticeToLink = {
  id: "n1",
  type: "app_activity",
  message: "Entered a trade: $431 of XBT at $86,194 (Ku1)",
  detail: "The order filled on the exchange.",
}

let host: HTMLDivElement
let root: ReturnType<typeof createRoot>
let seen: Record<string, AppNoticeDetail> = {}

function Probe({ notices }: { notices: readonly NoticeToLink[] }) {
  seen = useAppNotificationDetails(notices)
  return null
}

/**
 * How a row gets its look: the app says it on the spot, and the fetched answer
 * is laid over the top. The order matters more than it looks — spreading an
 * answer full of `undefined` over a drawn row would wipe it.
 */
describe("what the app says about its own notices", () => {
  beforeEach(() => {
    ;(
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true
    host = document.createElement("div")
    document.body.append(host)
    root = createRoot(host)
    seen = {}
    describeNotice.mockReset()
    detailsFor.mockReset()
    detailsFor.mockResolvedValue({})
  })

  afterEach(() => {
    act(() => root.unmount())
    host.remove()
  })

  it("draws from the app's own answer before anything is fetched", async () => {
    describeNotice.mockReturnValue({
      title: "Entered $431 of XBT",
      meta: ["@ $86,194", "Ku1", "filled"],
      categoryId: "trades",
    })
    detailsFor.mockReturnValue(new Promise(() => {}))

    await act(async () => root.render(<Probe notices={[notice]} />))

    expect(seen.n1).toMatchObject({
      title: "Entered $431 of XBT",
      categoryId: "trades",
    })
  })

  it("never lets a fetched answer blank what was already drawn", async () => {
    // The one that would break quietly. The fetched half is for the address,
    // and it says nothing about the heading — so spreading it whole would
    // replace a drawn heading with `undefined` and the row would lose its
    // words the moment the request landed.
    describeNotice.mockReturnValue({
      title: "Entered $431 of XBT",
      meta: ["@ $86,194", "Ku1", "filled"],
      categoryId: "trades",
    })
    detailsFor.mockResolvedValue({
      n1: { href: "/protocols/kucoin", title: undefined, meta: undefined },
    })

    await act(async () => root.render(<Probe notices={[notice]} />))
    await act(async () => undefined)

    expect(seen.n1).toMatchObject({
      title: "Entered $431 of XBT",
      meta: ["@ $86,194", "Ku1", "filled"],
      href: "/protocols/kucoin",
    })
  })

  it("drops an address that leads off this app and keeps the rest", async () => {
    describeNotice.mockReturnValue({ title: "Entered $431 of XBT" })
    detailsFor.mockResolvedValue({
      n1: { href: "https://example.com/steal", categoryId: "trades" },
    })

    await act(async () => root.render(<Probe notices={[notice]} />))
    await act(async () => undefined)

    expect(seen.n1.href).toBeUndefined()
    expect(seen.n1.title).toBe("Entered $431 of XBT")
    expect(seen.n1.categoryId).toBe("trades")
  })

  it("leaves a notice its own app says nothing about alone", async () => {
    describeNotice.mockReturnValue(null)

    await act(async () => root.render(<Probe notices={[notice]} />))
    await act(async () => undefined)

    expect(seen.n1).toBeUndefined()
  })
})
