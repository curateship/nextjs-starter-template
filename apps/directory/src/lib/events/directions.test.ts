import { describe, expect, it } from "vitest"

import { eventDirectionsUrl } from "@/lib/events/directions"

describe("the Directions link", () => {
  it("goes to the exact position when there is one", () => {
    expect(
      eventDirectionsUrl({
        position: { latitude: 43.648, longitude: -79.3897 },
        placeName: "The Rex",
        placeAddress: "194 Queen St W",
      })
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=43.648%2C-79.3897"
    )
  })

  it("sends the name and address as words without a position", () => {
    expect(
      eventDirectionsUrl({
        position: null,
        placeName: "The Rex",
        placeAddress: "194 Queen St W, Toronto",
      })
    ).toBe(
      "https://www.google.com/maps/dir/?api=1&destination=The+Rex%2C+194+Queen+St+W%2C+Toronto"
    )
  })

  it("has no link with nothing to go on", () => {
    expect(
      eventDirectionsUrl({ position: null, placeName: " ", placeAddress: "" })
    ).toBeNull()
  })
})
