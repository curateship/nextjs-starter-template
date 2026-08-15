import { describe, expect, it } from "vitest"

import {
  cleanListingGallery,
  cleanListingHours,
  coordinatesFromGoogleMapsUrl,
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
