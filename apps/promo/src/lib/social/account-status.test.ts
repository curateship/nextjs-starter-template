import { describe, expect, it } from "vitest"

import type { ProfileCheck } from "@/lib/social/options"
import type { PostingState } from "@/server/social/posting"

import { accountStatus, commentReadiness } from "./account-status"

const NOW = new Date("2099-06-15T12:00:00Z")
const DAY_MS = 86_400_000
const daysAgo = (days: number) => new Date(NOW.getTime() - days * DAY_MS)

const check = (patch: Partial<ProfileCheck>): ProfileCheck => ({
  handle: "a_persona",
  signedInStatus: 200,
  signedInFound: true,
  signedOutStatus: 200,
  signedOutFound: true,
  suspended: false,
  readAt: NOW.toISOString(),
  ...patch,
})

/** Tyler's four statuses, 12 Oct 2026, worked out from the account. */
describe("an account's status", () => {
  const base = {
    statusOverride: null,
    profileCheck: null,
    warmUpEndsAt: null,
    lastPromoCommentAt: null,
    now: NOW,
  }

  it("is Warming up while the warm-up runs", () => {
    expect(accountStatus({ ...base, warmUpEndsAt: new Date(NOW.getTime() + 2 * DAY_MS) }).status).toBe("warming_up")
  })

  it("is Working with a Promo comment in the last 7 days, Ready without", () => {
    expect(accountStatus({ ...base, lastPromoCommentAt: daysAgo(1) }).status).toBe("working")
    expect(accountStatus({ ...base, lastPromoCommentAt: daysAgo(8) }).status).toBe("ready")
    expect(accountStatus(base).status).toBe("ready")
  })

  it("is Banned when Reddit marks it suspended, whatever its age", () => {
    const view = accountStatus({
      ...base,
      warmUpEndsAt: new Date(NOW.getTime() + DAY_MS),
      profileCheck: check({ suspended: true }),
    })
    expect(view).toEqual({ status: "banned", byHand: false, warning: null })
  })

  it("says Not read yet when the age was never read", () => {
    expect(accountStatus({ ...base, warmUpEndsAt: undefined }).status).toBeNull()
  })

  it("warns, and never says Banned, when only a stranger cannot load the profile", () => {
    const view = accountStatus({
      ...base,
      profileCheck: check({ signedOutStatus: 404, signedOutFound: false }),
    })
    expect(view.status).toBe("ready")
    expect(view.warning).toContain("shadowbanned account looks like")
  })

  it("lets a status set by hand win, and says so", () => {
    const view = accountStatus({
      ...base,
      statusOverride: "ready",
      warmUpEndsAt: new Date(NOW.getTime() + DAY_MS),
    })
    expect(view).toMatchObject({ status: "ready", byHand: true })
  })
})

/** The Projects dashboard's order, best to comment from first. */
describe("how soon an account may comment", () => {
  const posting = (patch: Partial<PostingState>): Pick<PostingState, "awake" | "warmUp" | "limit"> => ({
    awake: true,
    warmUp: { endsAt: null, ageUnknown: false },
    limit: null,
    ...patch,
  })
  const ready = { status: "ready" as const }

  it("puts awake with room first, then awake with none, asleep, warming up, banned", () => {
    const ranks = [
      commentReadiness(ready, posting({}), NOW),
      commentReadiness(ready, posting({ limit: { limit: "day", nextAllowedAt: new Date(NOW.getTime() + DAY_MS) } }), NOW),
      commentReadiness(ready, posting({ awake: false }), NOW),
      commentReadiness({ status: "warming_up" }, posting({ warmUp: { endsAt: new Date(NOW.getTime() + DAY_MS), ageUnknown: false } }), NOW),
      commentReadiness({ status: "banned" }, posting({}), NOW),
    ]
    expect(ranks).toEqual([0, 1, 2, 3, 4])
  })
})
