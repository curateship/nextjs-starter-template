import { describe, expect, it } from "vitest"

import { parseGeocodedDirectoryPlace } from "@/server/directory/geocode"

describe("directory place geocoding", () => {
  it("returns a rounded point and Google's readable place label", () => {
    expect(
      parseGeocodedDirectoryPlace(
        {
          status: "OK",
          results: [
            {
              formatted_address: "Toronto, ON, Canada",
              geometry: {
                location: { lat: 43.65321, lng: -79.38318 },
              },
            },
          ],
        },
        "Toronto"
      )
    ).toEqual({
      latitude: 43.653,
      longitude: -79.383,
      label: "Toronto, ON, Canada",
    })
  })

  it("returns no place for an empty or invalid provider result", () => {
    expect(
      parseGeocodedDirectoryPlace({ status: "ZERO_RESULTS", results: [] }, "X")
    ).toBeNull()
    expect(
      parseGeocodedDirectoryPlace(
        {
          status: "OK",
          results: [{ geometry: { location: { lat: 95, lng: -79 } } }],
        },
        "X"
      )
    ).toBeNull()
  })
})
