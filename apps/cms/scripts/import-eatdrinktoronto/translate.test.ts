import { describe, expect, it } from "vitest"

import {
  contactLinksFromCore,
  droppedBlocks,
  htmlToWrittenBody,
  imageUrlsFromListing,
  isPrivateAddress,
  mergeDirectoryBlocks,
  ratingFromCore,
  safeSlug,
  stableJson,
  translateListing,
  validateCategoryTree,
} from "./translate.mjs"

describe("eatdrinktoronto import translation", () => {
  it("merges only listing values supported by the old template", () => {
    const merged = mergeDirectoryBlocks(
      {
        core: {
          id: "core",
          type: "directory-core",
          content: { address: "template", claimEnabled: true },
        },
      },
      {
        core: {
          content: {
            address: "listing",
            claimEnabled: false,
            menuLinks: [{ type: "phone", value: "123" }],
          },
        },
      }
    )
    expect(merged.core.content).toEqual({
      address: "listing",
      claimEnabled: true,
      menuLinks: [{ type: "phone", value: "123" }],
    })
  })

  it("turns rich text into a safe document and strips executable content", () => {
    expect(
      htmlToWrittenBody(
        "<p>Hello <strong>Toronto</strong></p><script>alert(1)</script><p>Again</p>"
      )
    ).toEqual({
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [{ type: "text", text: "Hello Toronto" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "Again" }] },
      ],
    })
    expect(
      htmlToWrittenBody(`<p>${"a".repeat(20_001)}</p>`).content[0].content[0]
        .text
    ).toHaveLength(20_000)
  })

  it("maps contact values and drops claim actions", () => {
    const links = contactLinksFromCore({
      address: "1 Queen St",
      phone: "416-555-0100",
      menuLinks: [
        { type: "claim", value: "claim" },
        { type: "website", value: "example.com" },
      ],
      socialLinks: [
        { platform: "Instagram", url: "https://instagram.com/place" },
      ],
    })
    expect(links.menuLinks.map((link) => link.type)).toEqual([
      "website",
      "phone",
    ])
    expect(links.socialLinks).toHaveLength(1)
  })

  it("maps a listing and reports unsupported values", () => {
    const blocks = {
      core: {
        type: "directory-core",
        content: { name: "Cafe", address: "Toronto", rating: 4.6 },
      },
      body: {
        type: "directory-rich-text",
        content: { body: "<p>Good coffee.</p>" },
      },
      hours: {
        type: "directory-opening-hours",
        content: { hoursText: "Monday: 9-5" },
      },
      map: {
        type: "directory-google-map",
        content: { locationQuery: "Toronto" },
      },
      custom: {
        type: "directory-custom",
        content: { values: { patio: true } },
      },
      related: {
        type: "directory-related-listing",
        content: { itemsToShow: 3 },
      },
    }
    expect(
      translateListing(
        { title: "Fallback", slug: "cafe", displayOrder: 2 },
        blocks
      )
    ).toMatchObject({
      title: "Cafe",
      metaDescription: "Good coffee.",
      rating: 4.6,
      status: "published",
    })
    expect(
      translateListing(
        { title: "Draft cafe", slug: "draft-cafe", status: "draft" },
        blocks
      ).status
    ).toBe("draft")
    expect(
      droppedBlocks(blocks, { latitude: 43.6, longitude: -79.3 })
    ).toMatchObject({
      openingHours: [{ type: "directory-opening-hours" }],
    })
    expect(droppedBlocks(blocks, { latitude: 43.6 }).coordinates).toHaveLength(
      2
    )
    expect(droppedBlocks(blocks).unsupportedCore).toEqual([])
    expect(droppedBlocks(blocks).custom).toHaveLength(2)
    expect(
      imageUrlsFromListing(
        { featuredImage: "https://old.example/cover.jpg" },
        {
          gallery: {
            type: "directory-custom",
            content: { values: { photo: "https://old.example/other.png" } },
          },
        }
      )
    ).toEqual([
      "https://old.example/cover.jpg",
      "https://old.example/other.png",
    ])
  })

  it("ports valid Directory ratings and reports invalid source values", () => {
    expect(ratingFromCore(4.8)).toBe(4.8)
    expect(ratingFromCore("4.6")).toBe(4.6)
    expect(ratingFromCore(0)).toBe(0)
    expect(ratingFromCore(6)).toBeNull()
    expect(
      droppedBlocks({
        core: { type: "directory-core", content: { rating: "six" } },
      }).unsupportedCore
    ).toEqual([{ type: "directory-core-rating", rating: "six" }])
  })

  it("refuses broken category trees and private download addresses", () => {
    expect(() => validateCategoryTree([{ id: "a", parentId: "b" }])).toThrow(
      "missing parent"
    )
    expect(() =>
      validateCategoryTree([
        { id: "a", parentId: "b" },
        { id: "b", parentId: "a" },
      ])
    ).toThrow("cycle")
    expect(isPrivateAddress("127.0.0.1")).toBe(true)
    expect(isPrivateAddress("::ffff:127.0.0.1")).toBe(true)
    expect(isPrivateAddress("::ffff:7f00:1")).toBe(true)
    expect(isPrivateAddress("169.254.169.254")).toBe(true)
    expect(isPrivateAddress("8.8.8.8")).toBe(false)
    expect(safeSlug("Joe's Café", "fallback")).toBe("joes-caf")
    expect(stableJson({ z: 1, a: { y: 2, x: 3 } })).toEqual({
      a: { x: 3, y: 2 },
      z: 1,
    })
  })
})
