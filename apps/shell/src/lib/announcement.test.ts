import { describe, expect, it } from "vitest"

import {
  isVisitorAnnouncementDismissed,
  rememberVisitorAnnouncementDismissal,
  visitorAnnouncementDismissalKey,
  type VisitorAnnouncement,
} from "@/lib/announcement"

const announcement: VisitorAnnouncement = {
  id: "announcement-1",
  title: "Holiday hours",
  body: "We are closed next week.",
  level: "info",
  updatedAt: "2026-08-12T12:00:00.000Z",
}

describe("visitor announcement dismissals", () => {
  it("remembers the exact version that was dismissed", () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
    }

    rememberVisitorAnnouncementDismissal(storage, announcement)

    expect(values.get(visitorAnnouncementDismissalKey(announcement.id))).toBe(
      announcement.updatedAt
    )
    expect(isVisitorAnnouncementDismissed(storage, announcement)).toBe(true)
  })

  it("shows an edited announcement again", () => {
    const storage = {
      getItem: () => announcement.updatedAt,
    }

    expect(
      isVisitorAnnouncementDismissed(storage, {
        ...announcement,
        updatedAt: "2026-08-12T13:00:00.000Z",
      })
    ).toBe(false)
  })

  it("keeps working when browser storage is blocked", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }

    expect(isVisitorAnnouncementDismissed(blocked, announcement)).toBe(false)
    expect(() =>
      rememberVisitorAnnouncementDismissal(blocked, announcement)
    ).not.toThrow()
  })
})
