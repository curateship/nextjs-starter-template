import { PGlite } from "@electric-sql/pglite"
import { eq } from "drizzle-orm"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { blankListingHours } from "@/lib/directory/listing-details"
import { setPageVisibility } from "@/server/content/pages"
import type { DirectoryEmail } from "@/server/directory/mail"
import { createListing, updateListing } from "@/server/directory/listings"
import {
  followEmail,
  FOLLOW_MAIL_QUIET_MS,
  runFollowMailPass,
} from "@/server/promotions/follow-mail"
import {
  buildUnfollowUrl,
  handleUnfollowLink,
  isFollowing,
  setFollowing,
} from "@/server/promotions/follows"
import {
  createPromotion,
  type PromotionInput,
} from "@/server/promotions/promotions"
import { dealsPublishedSince } from "@/server/promotions/public"
import { listingFollows, sitePromotions } from "@/server/promotions/schema"
import {
  createTestDatabase,
  insertUser,
  insertWorkspace,
  type TestDatabase,
} from "@/server/test-support"

/**
 * Following a listing for its deals: the button's state, one email per
 * listing per day naming every new deal, and the one-tap unfollow link.
 */

let client: PGlite
let database: TestDatabase
let siteId: string
let adminId: string
let followerId: string
let listingId: string
let sent: DirectoryEmail[]

// Friday 9 Oct 2026, 9 AM in Toronto, the test site's time zone.
const followedAt = new Date("2026-10-09T13:00:00Z")
const HOUR = 60 * 60 * 1000
const later = (hours: number) => new Date(followedAt.getTime() + hours * HOUR)

const send = async (email: DirectoryEmail) => {
  sent.push(email)
  return { delivered: true }
}

function input(overrides: Partial<PromotionInput> = {}): PromotionInput {
  return {
    title: "Lunch special",
    listingId,
    description: "",
    coverImage: "",
    code: "",
    smallPrint: "",
    dealType: "percent_off",
    amount: "20",
    headline: "",
    status: "published",
    startDate: "2026-10-01",
    endDate: null,
    ...overrides,
  }
}

/** A published deal, first published at `at`. */
async function publish(title: string, at: Date, overrides: Partial<PromotionInput> = {}) {
  const deal = await createPromotion(siteId, adminId, input({ title, ...overrides }), database)
  await database
    .update(sitePromotions)
    .set({ publishedAt: at })
    .where(eq(sitePromotions.id, deal.id))
  return deal
}

const pass = (at: Date) => runFollowMailPass(database, at, send)

beforeEach(async () => {
  vi.stubEnv("CUSTOM_SHELL_SECRET_ENCRYPTION_KEY", "test-signing-key")
  const testDb = await createTestDatabase()
  client = testDb.client
  database = testDb.db
  siteId = (await insertWorkspace(database, { name: "Eat Drink Toronto" })).id
  adminId = (await insertUser(database)).id
  followerId = (await insertUser(database, { email: "fan@example.com" })).id
  const listing = await createListing(siteId, { title: "Ramen Ya" }, database)
  await updateListing(siteId, listing.id, { status: "published" }, database)
  listingId = listing.id
  sent = []
})

afterEach(async () => {
  vi.unstubAllEnvs()
  await client.close()
})

describe("following", () => {
  it("is saved, so the button is right after a reload, and undone", async () => {
    expect(await isFollowing(siteId, followerId, listingId, database)).toBe(false)
    await setFollowing(siteId, followerId, { listingId, following: true }, database)
    await setFollowing(siteId, followerId, { listingId, following: true }, database)
    expect(await isFollowing(siteId, followerId, listingId, database)).toBe(true)
    expect(await database.select().from(listingFollows)).toHaveLength(1)
    await setFollowing(siteId, followerId, { listingId, following: false }, database)
    expect(await isFollowing(siteId, followerId, listingId, database)).toBe(false)
  })

  it("refuses a draft listing and another site's listing", async () => {
    const draft = await createListing(siteId, { title: "Not open" }, database)
    await expect(
      setFollowing(siteId, followerId, { listingId: draft.id, following: true }, database)
    ).rejects.toThrow("That listing is no longer on this site.")
    const otherSite = (await insertWorkspace(database, { name: "Beta" })).id
    await expect(
      setFollowing(otherSite, followerId, { listingId, following: true }, database)
    ).rejects.toThrow("That listing is no longer on this site.")
  })
})

describe("the email", () => {
  beforeEach(async () => {
    await setFollowing(siteId, followerId, { listingId, following: true }, database, followedAt)
  })

  it("names both deals published on one day in one email", async () => {
    await publish("Lunch special", later(1))
    await publish("Happy hour", later(1.5), { amount: "10" })
    expect((await pass(later(3))).sent).toBe(1)
    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({
      to: "fan@example.com",
      subject: "2 new deals at Ramen Ya",
      unsubscribeLabel: "Stop following Ramen Ya",
    })
    expect(sent[0]!.lines.join("\n")).toContain("20% off: Lunch special")
    expect(sent[0]!.lines.join("\n")).toContain("10% off: Happy hour")
    // A second pass has nothing left to say.
    await pass(later(4))
    expect(sent).toHaveLength(1)
  })

  it("waits for an hour of quiet, so a long sitting is still one email", async () => {
    await publish("Lunch special", later(1))
    await publish("Happy hour", later(1.9))
    await pass(new Date(later(1.9).getTime() + FOLLOW_MAIL_QUIET_MS - 1))
    expect(sent).toHaveLength(0)
    await pass(new Date(later(1.9).getTime() + FOLLOW_MAIL_QUIET_MS))
    expect(sent).toHaveLength(1)
  })

  it("sends at most one email a day, and the next day's names what came after", async () => {
    await publish("Lunch special", later(1))
    await pass(later(3))
    await publish("Happy hour", later(5))
    // 4 PM and 9 PM that Friday: already emailed today.
    await pass(later(7))
    await pass(later(12))
    expect(sent).toHaveLength(1)
    // Saturday morning, the site's next day.
    await pass(later(24))
    expect(sent).toHaveLength(2)
    expect(sent[1]!.subject).toBe("New deal at Ramen Ya: 20% off")
    expect(sent[1]!.lines.join("\n")).toContain("Happy hour")
    expect(sent[1]!.lines.join("\n")).not.toContain("Lunch special")
  })

  it("never sends deals from before the follow", async () => {
    await publish("Old deal", new Date(followedAt.getTime() - HOUR))
    await pass(later(3))
    expect(sent).toHaveLength(0)
  })

  it("leaves out a deal that ended before its email went", async () => {
    const ended = await publish("Gone already", later(1))
    await database
      .update(sitePromotions)
      .set({ endedAt: later(1.5) })
      .where(eq(sitePromotions.id, ended.id))
    await pass(later(3))
    expect(sent).toHaveLength(0)
    // And it does not hold up the day: a deal tomorrow still goes.
    await publish("Lunch special", later(20))
    await pass(later(24))
    expect(sent).toHaveLength(1)
  })

  it("never sends a draft or a deal at a listing taken back to draft", async () => {
    await publish("Draft", later(1), { status: "draft" })
    await pass(later(3))
    await publish("Lunch special", later(4))
    await updateListing(siteId, listingId, { status: "draft" }, database)
    await pass(later(30))
    expect(sent).toHaveLength(0)
  })

  it("sends nothing while the Deals page is off, and catches up once it is on", async () => {
    await setPageVisibility(siteId, { path: "/deals", visibility: "off" }, database)
    await publish("Lunch special", later(1))
    await pass(later(3))
    expect(sent).toHaveLength(0)
    await setPageVisibility(siteId, { path: "/deals", visibility: "everyone" }, database)
    await pass(later(4))
    expect(sent).toHaveLength(1)
  })

  it("tries again later when a send fails, and sends it once", async () => {
    await publish("Lunch special", later(1))
    await runFollowMailPass(database, later(3), async () => {
      throw new Error("The email could not be sent.")
    })
    // Still claimed by the failed send.
    await pass(new Date(later(3).getTime() + 5 * 60 * 1000))
    expect(sent).toHaveLength(0)
    await pass(new Date(later(3).getTime() + 11 * 60 * 1000))
    expect(sent).toHaveLength(1)
  })

  it("still finds a busy listing's new deal when a quiet listing's follower is far behind", async () => {
    const busy = await createListing(siteId, { title: "Busy Bar" }, database)
    await updateListing(siteId, busy.id, { status: "published" }, database)
    const regular = (await insertUser(database, { email: "regular@example.com" })).id
    await setFollowing(siteId, regular, { listingId: busy.id, following: true }, database, followedAt)
    await publish("Old news", later(1), { listingId: busy.id })
    await pass(later(3))
    expect(sent.map((email) => email.to)).toEqual(["regular@example.com"])
    // The quiet listing's follower still points at the morning. Reading from
    // there must not pull the busy listing's old deal back in.
    const fresh = await publish("Tomorrow's deal", later(26), { listingId: busy.id })
    const deals = await dealsPublishedSince(
      siteId,
      [
        { listingId, after: followedAt },
        { listingId: busy.id, after: later(1) },
      ],
      database
    )
    expect(deals.map((deal) => deal.id)).toEqual([fresh.id])
  })

  it("reaches every follower on a site with more than one page of them", async () => {
    for (let i = 0; i < 501; i += 1) {
      const id = (await insertUser(database, { email: `fan${i}@example.com` })).id
      await setFollowing(siteId, id, { listingId, following: true }, database, followedAt)
    }
    await publish("Lunch special", later(1))
    await pass(later(3))
    // The 501 plus the follower from beforeEach.
    expect(new Set(sent.map((email) => email.to)).size).toBe(502)
  }, 60_000)

  it("goes to nobody once they unfollow", async () => {
    await setFollowing(siteId, followerId, { listingId, following: false }, database)
    await publish("Lunch special", later(1))
    await pass(later(3))
    expect(sent).toHaveLength(0)
  })
})

describe("what the email says", () => {
  const deal = {
    id: "d1",
    listingId: "l1",
    title: "Lunch special",
    headline: "20% off",
    slug: "lunch-special",
    startDate: "2026-10-09",
    endDate: "2026-10-16",
    times: blankListingHours(),
    endedAt: null,
    publishedAt: new Date(),
  }
  const site = {
    siteName: "Eat Drink Toronto",
    siteUrl: "https://edt.example.com",
    listingTitle: "Ramen Ya",
  }

  it("links one deal straight to its page", () => {
    const email = followEmail({ ...site, listingUrl: null, deals: [deal] })
    expect(email.subject).toBe("New deal at Ramen Ya: 20% off")
    expect(email.action).toEqual({
      label: "See the deal",
      url: "https://edt.example.com/deals/lunch-special",
    })
  })

  it("links several to the listing, or to the Deals page when the directory is closed", () => {
    const two = [deal, { ...deal, id: "d2", slug: "happy-hour" }]
    expect(
      followEmail({ ...site, listingUrl: "https://edt.example.com/directory/ramen-ya", deals: two }).action.url
    ).toBe("https://edt.example.com/directory/ramen-ya")
    expect(followEmail({ ...site, listingUrl: null, deals: two }).action.url).toBe(
      "https://edt.example.com/deals"
    )
  })
})

describe("the unfollow link", () => {
  it("unfollows in one tap with no sign-in", async () => {
    await setFollowing(siteId, followerId, { listingId, following: true }, database)
    const [follow] = await database.select().from(listingFollows)
    const url = buildUnfollowUrl("https://edt.example.com", follow!.id)
    const answer = await handleUnfollowLink(new Request(url), database)
    expect(answer.status).toBe(200)
    expect(await answer.text()).toContain("deals at Ramen Ya")
    expect(await isFollowing(siteId, followerId, listingId, database)).toBe(false)
    // Tapping it again is not an error.
    expect((await handleUnfollowLink(new Request(url), database)).status).toBe(200)
  })

  it("refuses a link whose signature is wrong", async () => {
    await setFollowing(siteId, followerId, { listingId, following: true }, database)
    const [follow] = await database.select().from(listingFollows)
    const answer = await handleUnfollowLink(
      new Request(`https://edt.example.com/api/listing-unfollow?f=${follow!.id}&t=${"0".repeat(32)}`),
      database
    )
    expect(answer.status).toBe(400)
    expect(await isFollowing(siteId, followerId, listingId, database)).toBe(true)
  })
})
