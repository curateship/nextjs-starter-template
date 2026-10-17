import { describe, expect, it } from "vitest"

import {
  chapterAccess,
  courseLock,
  SIGNED_OUT_VIEWER,
  type ChapterRules,
  type CourseRules,
  type CourseViewer,
} from "@/lib/courses/course-access"

const at = new Date("2099-03-10T12:00:00Z")
const free: CourseViewer = { signedIn: true, isAdmin: false, isPaid: false, planId: "free" }
const pro: CourseViewer = { signedIn: true, isAdmin: false, isPaid: true, planId: "pro" }
const admin: CourseViewer = { signedIn: true, isAdmin: true, isPaid: false, planId: null }

const chapter = (patch: Partial<ChapterRules> = {}): ChapterRules => ({
  status: "published",
  isPreview: false,
  opensAfterDays: null,
  publishAt: null,
  ...patch,
})
const course = (patch: Partial<CourseRules> = {}): CourseRules => ({
  access: "everyone",
  planIds: [],
  ...patch,
})

describe("courseLock", () => {
  it("asks a signed-out visitor to sign in for a members course", () => {
    expect(courseLock(course({ access: "members" }), SIGNED_OUT_VIEWER)).toBe("sign-in")
    expect(courseLock(course({ access: "members" }), free)).toBeNull()
  })

  it("asks a free member to upgrade for a paid course", () => {
    expect(courseLock(course({ access: "paid" }), free)).toBe("upgrade")
    expect(courseLock(course({ access: "paid" }), pro)).toBeNull()
  })

  it("narrows a paid course to the plans ticked on it", () => {
    expect(courseLock(course({ access: "paid", planIds: ["team"] }), pro)).toBe("upgrade")
    expect(courseLock(course({ access: "paid", planIds: ["pro", "team"] }), pro)).toBeNull()
  })

  it("never locks anything for an admin", () => {
    expect(courseLock(course({ access: "paid", planIds: ["team"] }), admin)).toBeNull()
  })
})

describe("chapterAccess", () => {
  it("hides drafts and chapters not out yet from everyone but an admin", () => {
    expect(chapterAccess(course(), chapter({ status: "draft" }), pro, null, at).kind).toBe("hidden")
    const later = chapter({ publishAt: new Date("2099-03-11T00:00:00Z") })
    expect(chapterAccess(course(), later, pro, null, at).kind).toBe("hidden")
    expect(chapterAccess(course(), later, admin, null, at).kind).toBe("open")
    const earlier = chapter({ publishAt: new Date("2099-03-09T00:00:00Z") })
    expect(chapterAccess(course(), earlier, pro, null, at).kind).toBe("open")
  })

  it("opens a free preview to anyone, whatever the course says", () => {
    const paid = course({ access: "paid" })
    expect(chapterAccess(paid, chapter({ isPreview: true }), SIGNED_OUT_VIEWER, null, at)).toEqual({
      kind: "open",
    })
    expect(chapterAccess(paid, chapter(), SIGNED_OUT_VIEWER, null, at)).toEqual({
      kind: "locked",
      reason: "sign-in",
      opensAt: null,
    })
    expect(chapterAccess(paid, chapter(), free, null, at)).toMatchObject({ reason: "upgrade" })
  })

  it("holds a chapter back counted from the day the member first opened the course", () => {
    const held = chapter({ opensAfterDays: 3 })
    const monday = new Date("2099-03-09T12:00:00Z")
    expect(chapterAccess(course(), held, free, monday, at)).toEqual({
      kind: "locked",
      reason: "waiting",
      opensAt: new Date("2099-03-12T12:00:00Z"),
    })
    const lastWeek = new Date("2099-03-01T12:00:00Z")
    expect(chapterAccess(course(), held, free, lastWeek, at).kind).toBe("open")
    // Opening the course for the first time starts the clock now.
    expect(chapterAccess(course(), held, free, null, at)).toMatchObject({ reason: "waiting" })
    // Somebody signed out has no clock, so is asked to sign in.
    expect(chapterAccess(course(), held, SIGNED_OUT_VIEWER, null, at)).toMatchObject({
      reason: "sign-in",
    })
  })
})
