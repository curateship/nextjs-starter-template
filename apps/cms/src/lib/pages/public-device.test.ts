import { describe, expect, it } from "vitest"

import {
  normalizeFrontPageRows,
  visibleFrontPageRows,
  type FrontPageRow,
} from "@/lib/pages/front-page"
import {
  normalizePublicDevice,
  publicDeviceRowClassName,
  showsOnDevice,
} from "@/lib/pages/public-device"
import {
  cleanPublicNavigationItems,
  publicNavigationForDevice,
  type PublicNavigationItem,
} from "@/lib/pages/public-navigation"

function row(extra: Record<string, unknown>) {
  return { id: "one", heading: "Heading", kind: "text", ...extra }
}

describe("public device choice", () => {
  it("reads anything that is not one of the three choices as everywhere", () => {
    expect(normalizePublicDevice("phone")).toBe("phone")
    expect(normalizePublicDevice("desktop")).toBe("desktop")
    expect(normalizePublicDevice("tablet")).toBe("all")
    expect(normalizePublicDevice(undefined)).toBe("all")
  })

  it("hides a row only on the screens it is not meant for", () => {
    expect(publicDeviceRowClassName("all")).toBe("")
    expect(publicDeviceRowClassName("desktop")).toBe("max-md:hidden")
    expect(publicDeviceRowClassName("phone")).toBe("md:hidden")
  })

  it("answers which header list an item belongs in", () => {
    expect(showsOnDevice("all", "desktop")).toBe(true)
    expect(showsOnDevice("all", "phone")).toBe(true)
    expect(showsOnDevice("desktop", "desktop")).toBe(true)
    expect(showsOnDevice("desktop", "phone")).toBe(false)
    expect(showsOnDevice("phone", "desktop")).toBe(false)
    expect(showsOnDevice("phone", "phone")).toBe(true)
  })
})

describe("hidden and per-device front page rows", () => {
  it("starts a row saved before these switches existed shown everywhere", () => {
    const [saved] = normalizeFrontPageRows([row({})])

    expect(saved.hidden).toBe(false)
    expect(saved.device).toBe("all")
  })

  it("hides a row only on an explicit true", () => {
    expect(normalizeFrontPageRows([row({ hidden: "yes" })])[0].hidden).toBe(
      false
    )
    expect(normalizeFrontPageRows([row({ hidden: true })])[0].hidden).toBe(true)
  })

  it("keeps a hidden row for the editor and drops it from the public page", () => {
    const rows = normalizeFrontPageRows([
      row({ id: "shown", heading: "Shown" }),
      row({ id: "staged", heading: "Staged", hidden: true }),
    ])

    expect(rows.map((entry) => entry.heading)).toEqual(["Shown", "Staged"])
    expect(visibleFrontPageRows(rows).map((entry) => entry.heading)).toEqual([
      "Shown",
    ])
  })

  it("leaves a per-device row on the page, because a class does the hiding", () => {
    const rows = normalizeFrontPageRows([
      row({ id: "phone-only", device: "phone" }),
    ])

    expect(rows[0].device).toBe("phone")
    expect(visibleFrontPageRows(rows)).toHaveLength(1)
  })

  it("reads a bad device value as everywhere", () => {
    expect(normalizeFrontPageRows([row({ device: "watch" })])[0].device).toBe(
      "all"
    )
  })
})

describe("per-device header menu items", () => {
  const menu: PublicNavigationItem[] = cleanPublicNavigationItems([
    { label: "Everywhere", href: "/all" },
    { label: "Desk", href: "/desk", device: "desktop" },
    { label: "Pocket", href: "/pocket", device: "phone" },
    {
      type: "group",
      label: "Deskgroup",
      links: [{ label: "Inside", href: "/inside" }],
      device: "desktop",
    },
  ])

  const labels = (items: PublicNavigationItem[]) =>
    items.flatMap((item) => ("label" in item ? [item.label] : []))

  it("keeps the choice on a saved menu item", () => {
    expect(labels(menu)).toEqual([
      "Everywhere",
      "Desk",
      "Pocket",
      "Deskgroup",
    ])
    // "Everywhere" is the absence of a choice, so the key is never written.
    expect(menu.map((item) => ("device" in item ? item.device : "absent"))).toEqual(
      ["absent", "absent", "desktop", "phone", "desktop"]
    )
  })

  it("builds each header list from the items meant for it", () => {
    expect(labels(publicNavigationForDevice(menu, "desktop"))).toEqual([
      "Everywhere",
      "Desk",
      "Deskgroup",
    ])
    expect(labels(publicNavigationForDevice(menu, "phone"))).toEqual([
      "Everywhere",
      "Pocket",
    ])
  })

  it("keeps Search in both lists, whatever else is chosen", () => {
    expect(publicNavigationForDevice(menu, "desktop")[0]).toMatchObject({
      type: "search",
    })
    expect(publicNavigationForDevice(menu, "phone")[0]).toMatchObject({
      type: "search",
    })
  })
})

describe("hiding every row", () => {
  it("leaves nothing for a visitor, which the front page reads as no rows", () => {
    const rows = normalizeFrontPageRows([
      row({ id: "one", heading: "One", hidden: true }),
      row({ id: "two", heading: "Two", hidden: true }),
    ])

    // The built-in pricing page is what an empty list draws, so hiding every
    // row brings it back rather than leaving a blank page. The doc says so.
    expect(rows).toHaveLength(2)
    expect(visibleFrontPageRows(rows)).toEqual([])
  })
})

describe("front page rows keep their shape", () => {
  it("normalizes every row with both new fields", () => {
    const rows: FrontPageRow[] = normalizeFrontPageRows([
      row({ id: "a", kind: "faq", items: [{ question: "Q", answer: "A" }] }),
    ])

    expect(rows[0]).toMatchObject({ hidden: false, device: "all" })
  })
})
