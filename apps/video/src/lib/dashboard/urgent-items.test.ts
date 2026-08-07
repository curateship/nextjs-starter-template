import { describe, expect, it } from "vitest"
import { BellIcon } from "lucide-react"

import {
  cleanDismissedUrgent,
  keepUndismissedUrgent,
  keepUrgentInRange,
  MAX_DISMISSED_URGENT,
  MAX_DISMISSED_URGENT_SENT,
  urgentDismissKey,
  type UrgentItem,
} from "@/lib/dashboard/urgent-items"

function urgent(
  id: string,
  title: string,
  since: Date | null = null
): UrgentItem {
  return {
    id,
    icon: BellIcon,
    title,
    detail: "",
    action: "Open",
    to: "/admin",
    since,
  }
}

const NOW = new Date("2026-08-06T12:00:00.000Z")
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000)

describe("urgentDismissKey", () => {
  it("takes the row's words with it, so a changed fact is a new row", () => {
    const three = urgent("suspended", "3 suspended accounts")
    const thirty = urgent("suspended", "30 suspended accounts")

    expect(urgentDismissKey(three)).not.toEqual(urgentDismissKey(thirty))
    expect(keepUndismissedUrgent([thirty], [urgentDismissKey(three)])).toEqual([
      thirty,
    ])
  })

  it("keeps the same fact dismissed", () => {
    const item = urgent("email-off", "Email is switched off")
    expect(keepUndismissedUrgent([item], [urgentDismissKey(item)])).toEqual([])
  })
})

describe("cleanDismissedUrgent", () => {
  it("answers with nothing for anything that is not a list of words", () => {
    expect(cleanDismissedUrgent(undefined)).toEqual([])
    expect(cleanDismissedUrgent("email-off")).toEqual([])
    expect(cleanDismissedUrgent({ 0: "email-off" })).toEqual([])
  })

  it("drops entries that are not usable keys", () => {
    expect(
      cleanDismissedUrgent(["a:one", 7, null, "", { id: "b" }, "c:two"])
    ).toEqual(["a:one", "c:two"])
  })

  it("drops a key long enough to be somebody filling the settings up", () => {
    expect(cleanDismissedUrgent(["x".repeat(401)])).toEqual([])
    expect(cleanDismissedUrgent(["x".repeat(400)])).toHaveLength(1)
  })

  it("keeps each key once", () => {
    expect(cleanDismissedUrgent(["a:one", "a:one", "b:two"])).toEqual([
      "a:one",
      "b:two",
    ])
  })

  it("leaves room to dismiss one more at the cap", () => {
    // The card sends what it holds plus the row just dismissed, so a full list
    // arrives one over the cap. The request ceiling has to be above the cap or
    // the 51st row could never be put away at all.
    expect(MAX_DISMISSED_URGENT_SENT).toBeGreaterThan(MAX_DISMISSED_URGENT)

    const full = Array.from({ length: MAX_DISMISSED_URGENT }, (_, i) =>
      `row-${i}:title`
    )
    const oneMore = [...full, "new-row:title"]

    expect(oneMore.length).toBeLessThanOrEqual(MAX_DISMISSED_URGENT_SENT)
    expect(cleanDismissedUrgent(oneMore)).toContain("new-row:title")
  })

  it("keeps the newest keys once past the cap", () => {
    const keys = Array.from({ length: MAX_DISMISSED_URGENT + 10 }, (_, i) =>
      `row-${i}:title`
    )
    const kept = cleanDismissedUrgent(keys)

    expect(kept).toHaveLength(MAX_DISMISSED_URGENT)
    expect(kept.at(-1)).toBe(keys.at(-1))
    expect(kept).not.toContain(keys[0])
  })
})

describe("keepUrgentInRange", () => {
  it("cuts a row older than the range", () => {
    const old = urgent("feedback", "Old", daysAgo(20))
    const fresh = urgent("notifications", "Fresh", daysAgo(2))

    expect(keepUrgentInRange([old, fresh], 7, NOW)).toEqual([fresh])
    expect(keepUrgentInRange([old, fresh], 30, NOW)).toEqual([old, fresh])
  })

  it("keeps a row the app records no date for, whatever the range", () => {
    const dateless = urgent("email-off", "Email is switched off", null)

    expect(keepUrgentInRange([dateless], 7, NOW)).toEqual([dateless])
    expect(keepUrgentInRange([dateless], 30, NOW)).toEqual([dateless])
  })

  it("keeps a row dated ahead of today, like an announcement due to go live", () => {
    const scheduled = urgent("announcement", "Goes live", daysAgo(-14))
    expect(keepUrgentInRange([scheduled], 7, NOW)).toEqual([scheduled])
  })

  it("keeps a row landing exactly on the edge of the range", () => {
    const edge = urgent("feedback", "Edge", daysAgo(7))
    expect(keepUrgentInRange([edge], 7, NOW)).toEqual([edge])
  })
})
