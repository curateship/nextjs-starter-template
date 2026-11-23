import { describe, expect, it } from "vitest"

import { uploadRefusal } from "@/lib/pomodoro/media-limits"

const MB = 1024 * 1024
const PLENTY = 2048 * MB

describe("uploadRefusal", () => {
  it("names the size and the limit for a file over its kind's limit", () => {
    expect(uploadRefusal({ size: 150 * MB, type: "video/mp4" }, PLENTY)).toBe(
      "This clip is 150 MB. Clips can be up to 100 MB."
    )
    expect(uploadRefusal({ size: 12 * MB, type: "image/png" }, PLENTY)).toBe(
      "This picture is 12 MB. Pictures can be up to 10 MB."
    )
    expect(uploadRefusal({ size: 31 * MB, type: "audio/x-wav" }, PLENTY)).toBe(
      "This sound is 31 MB. Sounds can be up to 30 MB."
    )
  })

  it("lets a file exactly at its limit through", () => {
    expect(uploadRefusal({ size: 100 * MB, type: "video/webm" }, PLENTY)).toBe(
      null
    )
  })

  it("refuses a file bigger than the space left", () => {
    expect(uploadRefusal({ size: 50 * MB, type: "video/mp4" }, 40 * MB)).toBe(
      "This clip is 50 MB and you have 40 MB of space left. Delete something you no longer use first."
    )
  })

  it("never says a negative amount of space is left", () => {
    expect(uploadRefusal({ size: 2 * MB, type: "image/jpeg" }, -5 * MB)).toBe(
      "This picture is 2.0 MB and you have 0 B of space left. Delete something you no longer use first."
    )
  })

  it("leaves a file of unknown type to the server, except for space", () => {
    expect(uploadRefusal({ size: 500 * MB, type: "" }, PLENTY)).toBe(null)
    expect(uploadRefusal({ size: 500 * MB, type: "" }, 10 * MB)).toBe(
      "This file is 500 MB and you have 10 MB of space left. Delete something you no longer use first."
    )
  })
})
