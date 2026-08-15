import { describe, expect, it } from "vitest"

import {
  categoryJsonLd,
  directoryDescription,
  directoryHead,
  directoryTitle,
  jsonLdText,
  listingJsonLd,
  listingPageShareImage,
  siteUrlFor,
} from "@/lib/directory/public-seo"

/**
 * What a public directory page says about itself.
 *
 * Two things are worth a test here rather than a look in a browser: that a
 * page names **its own site** rather than the deployment, and that a listing's
 * title cannot escape the JSON-LD block and become markup.
 */

const site = { siteName: "Alpha", siteUrl: "https://alpha.example.com" }

describe("titles and descriptions", () => {
  it("names the page and then the site", () => {
    expect(directoryTitle("Joe's Diner", "Alpha")).toBe("Joe's Diner · Alpha")
  })

  it("leaves out a part that is missing rather than a stray separator", () => {
    expect(directoryTitle("Directory", "")).toBe("Directory")
    expect(directoryTitle("Directory", undefined)).toBe("Directory")
  })

  it("takes the first description there is", () => {
    expect(directoryDescription("", "  ", "The fallback")).toBe("The fallback")
  })

  it("cuts a long description rather than handing over a paragraph", () => {
    const long = "a".repeat(400)
    const cut = directoryDescription(long)

    expect(cut.length).toBeLessThanOrEqual(160)
    expect(cut.endsWith("…")).toBe(true)
  })

  it("adds no description tags at all when there is nothing to say", () => {
    const head = directoryHead("Directory · Alpha", "")

    expect(head.meta).toEqual([{ title: "Directory · Alpha" }])
    expect(head.links).toContainEqual({
      rel: "alternate",
      type: "application/rss+xml",
      title: "New listings",
      href: "/feed.xml",
    })
  })

  it("uses a listing image when the page has one", () => {
    expect(
      directoryHead(
        "Joe's Diner · Alpha",
        "Breakfast all day",
        "https://images.example.com/joe.jpg"
      ).meta
    ).toContainEqual({
      property: "og:image",
      content: "https://images.example.com/joe.jpg",
    })
  })

  it("uses a listing photo before a drawn picture", () => {
    expect(
      listingPageShareImage({
        featuredImage: "https://images.example.com/joe.jpg",
        siteUrl: "https://alpha.example.com",
        slug: "joes-diner",
        version: "1-old",
      })
    ).toBe("https://images.example.com/joe.jpg")
  })

  it("describes a drawn listing picture at its exact size and type", () => {
    const image = listingPageShareImage({
      featuredImage: "",
      siteUrl: "https://alpha.example.com",
      slug: "joes-diner",
      version: "1-card",
    })
    const meta = directoryHead(
      "Joe's Diner · Alpha",
      "Breakfast all day",
      image
    ).meta

    expect(meta).toContainEqual({
      property: "og:image",
      content:
        "https://alpha.example.com/directory/share-image/joes-diner?v=1-card",
    })
    expect(meta).toContainEqual({
      property: "og:image:type",
      content: "image/svg+xml",
    })
    expect(meta).toContainEqual({
      property: "og:image:width",
      content: "1200",
    })
    expect(meta).toContainEqual({
      property: "og:image:height",
      content: "630",
    })
    expect(meta).toContainEqual({
      name: "twitter:image",
      content:
        "https://alpha.example.com/directory/share-image/joes-diner?v=1-card",
    })
  })
})

describe("addresses", () => {
  it("builds one on the site being visited, with no doubled slash", () => {
    expect(
      siteUrlFor("https://alpha.example.com/", "/directory/joes-diner")
    ).toBe("https://alpha.example.com/directory/joes-diner")
  })
})

describe("the block a search engine reads", () => {
  const listing = {
    ...site,
    title: "Joe's Diner",
    slug: "joes-diner",
    description: "Breakfast all day",
    image: "https://images.example.com/joe.jpg",
    createdAt: new Date("2026-01-02T03:04:05.000Z"),
    updatedAt: new Date("2026-02-03T04:05:06.000Z"),
  }

  it("names the visited site, never the deployment", () => {
    const graph = listingJsonLd(listing)["@graph"] as Record<string, unknown>[]

    expect(graph[0]).toEqual({
      "@type": "Organization",
      name: "Alpha",
      url: "https://alpha.example.com",
    })
    expect(graph[1]?.url).toBe("https://alpha.example.com/directory/joes-diner")
  })

  it("writes dates in the one format a search engine reads", () => {
    const graph = listingJsonLd(listing)["@graph"] as Record<string, unknown>[]

    expect(graph[1]?.datePublished).toBe("2026-01-02T03:04:05.000Z")
    expect(graph[1]?.dateModified).toBe("2026-02-03T04:05:06.000Z")
  })

  it("leaves out what a listing does not have", () => {
    const graph = listingJsonLd({
      ...listing,
      description: "",
      image: "",
    })["@graph"] as Record<string, unknown>[]

    expect(graph[1]).not.toHaveProperty("description")
    expect(graph[1]).not.toHaveProperty("image")
  })

  it("upgrades a pinned listing to LocalBusiness with hours and photos", () => {
    const graph = listingJsonLd({
      ...listing,
      gallery: ["https://images.example.com/inside.jpg"],
      hours: { monday: { open: "09:00", close: "17:00" } },
      address: "12 Queen Street",
      latitude: 43.6532,
      longitude: -79.3832,
    })["@graph"] as Record<string, unknown>[]

    expect(graph[1]).toMatchObject({
      "@type": "LocalBusiness",
      address: "12 Queen Street",
      image: [
        "https://images.example.com/joe.jpg",
        "https://images.example.com/inside.jpg",
      ],
      geo: {
        "@type": "GeoCoordinates",
        latitude: 43.6532,
        longitude: -79.3832,
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: "https://schema.org/Monday",
          opens: "09:00",
          closes: "17:00",
        },
      ],
    })
  })

  it("keeps the exact WebPage shape without coordinates", () => {
    expect(
      listingJsonLd({
        ...listing,
        gallery: ["https://images.example.com/inside.jpg"],
        hours: { monday: { open: "09:00", close: "17:00" } },
      })
    ).toEqual(listingJsonLd(listing))
  })

  it("never adds an admin-set rating to search-engine markup", () => {
    const ratedListing = { ...listing, rating: 4.5 }

    expect(listingJsonLd(ratedListing)).toEqual(listingJsonLd(listing))
    expect(jsonLdText(listingJsonLd(ratedListing))).not.toContain(
      "aggregateRating"
    )
  })

  it("describes a category as the list of things it is", () => {
    const graph = categoryJsonLd({
      ...site,
      name: "Food",
      slug: "food",
      description: "Places to eat",
    })["@graph"] as Record<string, unknown>[]

    expect(graph[1]).toEqual({
      "@type": "CollectionPage",
      name: "Food",
      url: "https://alpha.example.com/directory/category/food",
      description: "Places to eat",
    })
  })

  it("cannot be escaped by a title that closes the script tag", () => {
    const text = jsonLdText(
      listingJsonLd({ ...listing, title: "</script><img onerror=x>" })
    )

    // The one character that could turn data into markup is gone, and what is
    // left still parses as the same data.
    expect(text).not.toContain("<")
    expect(JSON.parse(text)).toMatchObject({
      "@graph": [{}, { name: "</script><img onerror=x>" }],
    })
  })
})
