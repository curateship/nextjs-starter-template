import { describe, expect, it } from "vitest"

import {
  cleanListingGallery,
  cleanListingHours,
  coordinatesFromGoogleMapsUrl,
  formatListingDayHours,
  listingHoursStatus,
  requireListingCoordinates,
} from "@/lib/directory/listing-details"

describe("listing details", () => {
  it("caps and cleans gallery images", () => {
    expect(
      cleanListingGallery([
        "https://images.example/one.jpg",
        "javascript:alert(1)",
        "https://images.example/one.jpg",
        ...Array.from(
          { length: 20 },
          (_, index) => `https://images.example/${index}.jpg`
        ),
      ])
    ).toHaveLength(12)
  })

  it("keeps valid weekday hours and closes malformed days", () => {
    const hours = cleanListingHours({
      monday: { open: "09:00", close: "17:30" },
      tuesday: { open: "noon", close: "17:00" },
    })
    expect(hours.monday).toEqual({ open: "09:00", close: "17:30" })
    expect(hours.tuesday).toBeNull()
    expect(hours.sunday).toBeNull()
  })

  it("ignores a second stretch saved before the feature was removed", () => {
    const hours = cleanListingHours({
      monday: {
        open: "12:00",
        close: "14:30",
        second: { open: "17:00", close: "22:00" },
      },
    })
    expect(hours.monday).toEqual({ open: "12:00", close: "14:30" })
    expect(formatListingDayHours(hours.monday)).toBe("12 PM–2:30 PM")
  })

  it("says a day that never shuts in words, not 12 AM to 12 AM", () => {
    const hours = cleanListingHours({
      thursday: { open: "00:00", close: "00:00" },
    })
    expect(formatListingDayHours(hours.thursday)).toBe("Open 24 hours")
    // A Thursday afternoon.
    expect(listingHoursStatus(hours, new Date(2026, 8, 17, 15, 0))).toBe(
      "Open now · all day"
    )
  })

  it("says when a place that has not opened yet opens", () => {
    const hours = cleanListingHours({
      wednesday: { open: "17:00", close: "22:00" },
    })
    // A Wednesday afternoon, before opening time.
    const afternoon = new Date(2026, 8, 16, 15, 30)
    expect(listingHoursStatus(hours, afternoon)).toBe(
      "Closed now · open 5 PM–10 PM"
    )
    const dinner = new Date(2026, 8, 16, 19, 0)
    expect(listingHoursStatus(hours, dinner)).toBe("Open now · closes 10 PM")
  })

  it("refuses partial and out-of-range coordinates", () => {
    expect(() => requireListingCoordinates("43.65", "")).toThrow(
      "Add both coordinates"
    )
    expect(() => requireListingCoordinates(91, -79)).toThrow(
      "Add both coordinates"
    )
    expect(requireListingCoordinates("", "")).toBeNull()
    expect(requireListingCoordinates("  ", "\t")).toBeNull()
  })

  it("extracts coordinates only from full Google Maps links", () => {
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://www.google.com/maps/place/Test/@43.6532,-79.3832,16z"
      )
    ).toEqual({ latitude: 43.6532, longitude: -79.3832 })
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://example.com/place/Test/@43.6532,-79.3832,16z"
      )
    ).toBeNull()
    expect(
      coordinatesFromGoogleMapsUrl(
        "https://www.google.example/maps/@43.6532,-79.3832,16z"
      )
    ).toBeNull()
  })

  it("states whether today's place is open", () => {
    const hours = cleanListingHours({
      monday: { open: "09:00", close: "17:00" },
    })
    expect(listingHoursStatus(hours, new Date(2026, 7, 17, 10, 0))).toContain(
      "Open now"
    )
    expect(listingHoursStatus(hours, new Date(2026, 7, 17, 18, 0))).toContain(
      "Closed now"
    )
  })

  it("keeps an overnight opening open after midnight", () => {
    const hours = cleanListingHours({
      monday: { open: "20:00", close: "02:00" },
    })
    expect(listingHoursStatus(hours, new Date(2026, 7, 18, 1, 0))).toContain(
      "Open now"
    )
  })
})
