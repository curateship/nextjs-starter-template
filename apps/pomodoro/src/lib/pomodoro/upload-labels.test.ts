import { describe, expect, it } from "vitest"

import {
  checkUploadLabels,
  isValidTrim,
  nameFromFileName,
  parseTagText,
  uploadedMessage,
} from "@/lib/pomodoro/upload-labels"

/**
 * The upload window's rules, which the server checks again with the same
 * functions, and the sentence a member reads once a file is up.
 */

describe("nameFromFileName", () => {
  it("drops the extension and keeps the rest", () => {
    expect(nameFromFileName("IMG_4021.mp4")).toBe("IMG_4021")
    expect(nameFromFileName("rain.on.glass.mp3")).toBe("rain.on.glass")
  })

  it("keeps a file that is only an extension rather than leaving nothing", () => {
    expect(nameFromFileName(".mp3")).toBe(".mp3")
  })

  it("cuts a long name to the 80 the column holds", () => {
    expect(nameFromFileName(`${"a".repeat(120)}.png`)).toHaveLength(80)
  })
})

describe("parseTagText", () => {
  it("lower-cases, trims and drops repeats", () => {
    expect(parseTagText("Rain, Night ,rain,, ")).toEqual({
      tags: ["rain", "night"],
      unusable: [],
    })
  })

  it("keeps aside a word that cannot be a tag instead of losing it", () => {
    expect(parseTagText("rain, #night").unusable).toEqual(["#night"])
    expect(parseTagText(`rain, ${"a".repeat(25)}`).unusable).toHaveLength(1)
  })
})

describe("checkUploadLabels", () => {
  it("trims the name and accepts up to eight tags", () => {
    expect(
      checkUploadLabels({ name: "  Rain on   my window ", tags: ["Rain", "night"] })
    ).toEqual({ ok: true, name: "Rain on my window", tags: ["rain", "night"] })
  })

  it("refuses an empty name, a long name, a ninth tag and an unusable tag", () => {
    const problem = (input: { name: string; tags: string[] }) => {
      const checked = checkUploadLabels(input)
      return checked.ok ? null : checked.problem
    }
    expect(problem({ name: "   ", tags: [] })).toBe("UPLOAD_NAME_EMPTY")
    expect(problem({ name: "a".repeat(81), tags: [] })).toBe("UPLOAD_NAME_TOO_LONG")
    expect(
      problem({ name: "a", tags: Array.from({ length: 9 }, (_, i) => `t${i}`) })
    ).toBe("UPLOAD_TAGS_TOO_MANY")
    expect(problem({ name: "a", tags: ["a".repeat(25)] })).toBe("UPLOAD_TAG_INVALID")
  })
})

describe("isValidTrim", () => {
  it("needs at least a second, starting at or after zero", () => {
    expect(isValidTrim({ startMs: 5000, endMs: 40000 })).toBe(true)
    expect(isValidTrim({ startMs: 5000, endMs: 5999 })).toBe(false)
    expect(isValidTrim({ startMs: -1, endMs: 5000 })).toBe(false)
    expect(isValidTrim({ startMs: 0.5, endMs: 5000 })).toBe(false)
  })
})

describe("uploadedMessage", () => {
  it("says a picture is ready at once", () => {
    expect(uploadedMessage("image", 4)).toBe("Your picture is ready.")
  })

  it("counts the files ahead and turns them into a rough wait", () => {
    expect(uploadedMessage("video", 0)).toBe(
      "Your clip is being prepared. Nothing is ahead of it, so it should be ready in under a minute. The bell will tell you."
    )
    expect(uploadedMessage("video", 1)).toContain("1 file is ahead of it")
    expect(uploadedMessage("audio", 2)).toBe(
      "Your sound is being prepared. 2 files are ahead of it, so it should be ready in about a minute. The bell will tell you."
    )
    // Ten clips in a row: the last waits for nine, about two and a half minutes.
    expect(uploadedMessage("video", 9)).toContain("in about 3 minutes")
  })
})

describe("nameFromPrompt", () => {
  it("keeps a short prompt and cuts a long one at a word break", async () => {
    const { nameFromPrompt } = await import("@/lib/pomodoro/upload-labels")
    expect(nameFromPrompt("  Rain on a tin roof   at night ")).toBe("Rain on a tin roof at night")
    const long = "Soft rain on a cabin roof while a fire crackles and an old radio hums somewhere far away"
    const name = nameFromPrompt(long)
    expect(name.length).toBeLessThanOrEqual(80)
    expect(long.startsWith(name)).toBe(true)
    expect(long[name.length]).toBe(" ")
    expect(nameFromPrompt("x".repeat(100))).toHaveLength(80)
  })
})
