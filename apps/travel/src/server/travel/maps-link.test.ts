import { PGlite } from "@electric-sql/pglite"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { TRAVEL_ERRORS } from "@/lib/travel/errors"
import type { CustomShellDb } from "@/server/db"
import type { CustomShellUser } from "@/server/schema"
import { createTestDatabase, insertUser } from "@/server/test-support"
import { readVenue } from "@/server/travel/maps-browser"
import {
  builtinOf,
  builtinOfCategory,
  fillFromMapsLink,
  isMapsLink,
  linkPicture,
  readLinkClues,
} from "@/server/travel/maps-link"
import { createActivity, createTrip, loadTripPage } from "@/server/travel/trips"
import { listTypes } from "@/server/travel/types"

// The hidden browser never opens in a test; each test says what it would have read.
vi.mock("@/server/travel/maps-browser", () => ({ readVenue: vi.fn(async () => null) }))

let client: PGlite
let database: CustomShellDb
let anna: CustomShellUser
let ben: CustomShellUser

beforeEach(async () => {
  ;({ client, db: database } = await createTestDatabase())
  anna = await insertUser(database)
  ben = await insertUser(database)
  vi.stubEnv("GOOGLE_MAPS_API_KEY", "test-key")
})

afterEach(async () => {
  vi.unstubAllGlobals()
  vi.unstubAllEnvs()
  await client.close()
})

const LONG =
  "https://www.google.com/maps/place/Senso-ji/@35.7147651,139.7966553,17z/data=!3m1!4b1!4m6!3m5!1s0x60188ec1!8m2!3d35.7147651!4d139.7966553"

describe("reading a Google Maps link", () => {
  it("knows Google's addresses from anything else", () => {
    expect(isMapsLink(LONG)).toBe(true)
    expect(isMapsLink("https://maps.app.goo.gl/AbC123")).toBe(true)
    expect(isMapsLink("https://www.google.co.jp/maps/place/Kyoto")).toBe(true)
    expect(isMapsLink("https://evil.example/maps/place/x")).toBe(false)
    expect(isMapsLink("http://maps.app.goo.gl/AbC123")).toBe(false)
    expect(isMapsLink("https://www.google.com/search?q=senso-ji")).toBe(false)
    expect(isMapsLink("https://google.com.evil.example/maps")).toBe(false)
  })

  it("reads the name and the pin's position", () => {
    expect(readLinkClues(new URL(LONG))).toEqual({ name: "Senso-ji", lat: 35.7147651, lng: 139.7966553, placeId: null })
    expect(readLinkClues(new URL("https://www.google.com/maps/search/?api=1&query=Fuunji&query_place_id=ChIJabc"))).toMatchObject({
      name: "Fuunji",
      placeId: "ChIJabc",
    })
  })

  it("turns Google's kinds of place into the built-in types", () => {
    expect(builtinOf(["buddhist_temple", "tourist_attraction"])).toBe("sight")
    expect(builtinOf(["ramen_restaurant"])).toBe("food")
    expect(builtinOf(["lodging"])).toBe("hotel")
    expect(builtinOf(["airport"])).toBe("flight")
    expect(builtinOf(["bank"])).toBe("other")
  })
})

describe("the picture a link carries, with no key", () => {
  const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0])
  function stubPage(html: string, asked: string[] = []) {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        asked.push(url)
        if (url.startsWith("https://www.google.com/maps")) return new Response(html, { headers: { "content-type": "text/html" } })
        return new Response(JPEG, { headers: { "content-type": "image/jpeg" } })
      })
    )
    return asked
  }

  it("takes a place photo from the page when there is one", async () => {
    const asked = stubPage('<script>["https://lh5.googleusercontent.com/p/AF1QipAbc-123"]</script>')
    expect(await linkPicture(new URL(LONG))).toEqual({ mimeType: "image/jpeg", data: JPEG })
    expect(asked[1]).toBe("https://lh5.googleusercontent.com/p/AF1QipAbc-123=w1200-h800-k-no")
  })

  it("falls back to the map snapshot in the link's preview", async () => {
    const asked = stubPage(
      '<meta content="https://maps.google.com/maps/api/staticmap?center=35.7%2C139.8&amp;zoom=17&amp;size=900x900" property="og:image">'
    )
    expect(await linkPicture(new URL(LONG))).toEqual({ mimeType: "image/jpeg", data: JPEG, isMap: true })
    expect(asked[1]).toBe("https://maps.google.com/maps/api/staticmap?center=35.7%2C139.8&zoom=17&size=900x900")
  })

  it("never downloads a preview from anywhere but Google", async () => {
    const asked = stubPage('<meta content="https://evil.example/x.jpg" property="og:image">')
    expect(await linkPicture(new URL(LONG))).toBeNull()
    expect(asked).toHaveLength(1)
  })
})

describe("filling an activity from a link", () => {
  it("with no key, fills from the venue the hidden browser read", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "")
    vi.mocked(readVenue).mockResolvedValueOnce({
      name: "Fuunji Shinjuku",
      category: "Ramen restaurant",
      address: "2 Chome-14-3 Yoyogi, Shibuya, Tokyo",
      phone: "+81 3-6413-8480",
      website: "https://www.fu-unji.com/?utm_source=gbp?utm_medium=organic",
      photoUrl: "https://lh3.googleusercontent.com/grass-cs/ABC=w1200-h900-k-no",
    })
    const asked: string[] = []
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        asked.push(String(input))
        return new Response(new Uint8Array([0xff, 0xd8, 0xff]), { headers: { "content-type": "image/jpeg" } })
      })
    )
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "New place" }, database)
    const link = "https://www.google.com/maps/place/Fuunji/@35.6866,139.6983,17z"
    expect(await fillFromMapsLink(anna.id, { activityId: id, link }, database)).toMatchObject({
      title: "Fuunji Shinjuku",
      partial: false,
    })
    const activity = (await loadTripPage(anna.id, tripId, database)).activities[0]
    const food = (await listTypes(anna.id, database)).find((type) => type.builtin === "food")!
    expect(activity.typeId).toBe(food.id)
    expect(activity.place?.address).toBe("2 Chome-14-3 Yoyogi, Shibuya, Tokyo")
    expect(activity.phone).toBe("+81 3-6413-8480")
    expect(activity.website).toBe("https://www.fu-unji.com/")
    // The venue's photo is downloaded from Google's picture host (storage isn't set up in tests, so it isn't kept).
    expect(asked).toContain("https://lh3.googleusercontent.com/grass-cs/ABC=w1200-h900-k-no")
  })

  it("reads Google's categories as the built-in types", () => {
    expect(builtinOfCategory("Ramen restaurant")).toBe("food")
    expect(builtinOfCategory("Buddhist temple")).toBe("sight")
    expect(builtinOfCategory("Hotel")).toBe("hotel")
    expect(builtinOfCategory("Train station")).toBe("transport")
    expect(builtinOfCategory("International airport")).toBe("flight")
    expect(builtinOfCategory("Bank")).toBe("other")
  })

  it("fills name, type, place, hours, website and phone; no storage means no picture", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.endsWith(":searchText")) return Response.json({ places: [{ id: "ChIJsensoji" }] })
        if (url.includes("/photos/")) return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/jpeg" } })
        return Response.json({
          id: "ChIJsensoji",
          displayName: { text: "Senso-ji" },
          formattedAddress: "2-3-1 Asakusa, Taito City, Tokyo",
          location: { latitude: 35.7148, longitude: 139.7967 },
          regularOpeningHours: { periods: [{ open: { day: 1, hour: 6, minute: 0 }, close: { day: 1, hour: 17, minute: 0 } }] },
          websiteUri: "https://www.senso-ji.jp/",
          internationalPhoneNumber: "+81 3-3842-0181",
          primaryType: "buddhist_temple",
          photos: [{ name: "places/ChIJsensoji/photos/abc" }],
        })
      })
    )
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "New place" }, database)
    const result = await fillFromMapsLink(anna.id, { activityId: id, link: LONG }, database)
    expect(result).toEqual({ title: "Senso-ji", photo: false, partial: false })
    const activity = (await loadTripPage(anna.id, tripId, database)).activities[0]
    const sight = (await listTypes(anna.id, database)).find((type) => type.builtin === "sight")!
    expect(activity.title).toBe("Senso-ji")
    expect(activity.typeId).toBe(sight.id)
    expect(activity.place).toMatchObject({ address: "2-3-1 Asakusa, Taito City, Tokyo", placeId: "ChIJsensoji" })
    expect(activity.openingHours?.[1]).toEqual([{ open: "06:00", close: "17:00" }])
    expect(activity.website).toBe("https://www.senso-ji.jp/")
    expect(activity.phone).toBe("+81 3-3842-0181")
  })

  it("refuses a link that isn't Google Maps or someone else's activity", async () => {
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "x" }, database)
    await expect(fillFromMapsLink(anna.id, { activityId: id, link: "https://evil.example/maps" }, database)).rejects.toThrow(
      TRAVEL_ERRORS.notMapsLink
    )
    await expect(fillFromMapsLink(ben.id, { activityId: id, link: LONG }, database)).rejects.toThrow(
      TRAVEL_ERRORS.activityNotFound
    )
  })

  it("with no key, fills the name, address and pin the link itself carries", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "")
    // The page has no picture and Wikipedia has no article, so nothing is downloaded or saved.
    const fetched = vi.fn(async (input: string | URL) =>
      String(input).includes("wikipedia.org") ? Response.json({}) : new Response("<html></html>", { headers: { "content-type": "text/html" } })
    )
    vi.stubGlobal("fetch", fetched)
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "New place" }, database)
    const link =
      "https://www.google.com/maps/place/Fuunji,+2-14-3+Yoyogi,+Shibuya+City/@35.6866,139.6983,17z/data=!3d35.6866!4d139.6983"
    expect(await fillFromMapsLink(anna.id, { activityId: id, link }, database)).toEqual({
      title: "Fuunji",
      photo: false,
      partial: true,
    })
    const activity = (await loadTripPage(anna.id, tripId, database)).activities[0]
    expect(activity.title).toBe("Fuunji")
    expect(activity.place).toEqual({ name: "Fuunji", address: "2-14-3 Yoyogi, Shibuya City", lat: 35.6866, lng: 139.6983, placeId: null })
    expect(fetched.mock.calls.every(([url]) => /google\.com\/maps|wikipedia\.org/.test(String(url)))).toBe(true)
  })

  it("follows a short link through Google's cookie question to the place", async () => {
    vi.stubEnv("GOOGLE_MAPS_API_KEY", "")
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: string | URL) => {
        const url = String(input)
        if (url.startsWith("https://maps.app.goo.gl/")) {
          return new Response(null, {
            status: 302,
            headers: { location: `https://consent.google.com/m?continue=${encodeURIComponent(LONG)}` },
          })
        }
        if (url.startsWith("https://www.google.com/maps")) return new Response("<html></html>")
        throw new Error(`unexpected ${url}`)
      })
    )
    const { id: tripId } = await createTrip(anna.id, { name: "Tokyo", days: 3, currency: "JPY", startDate: null }, database)
    const { id } = await createActivity(anna.id, { tripId, day: 1, title: "New place" }, database)
    expect((await fillFromMapsLink(anna.id, { activityId: id, link: "https://maps.app.goo.gl/AbC123" }, database)).title).toBe("Senso-ji")
  })
})
