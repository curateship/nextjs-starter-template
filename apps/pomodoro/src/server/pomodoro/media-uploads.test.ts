import { describe, expect, it } from "vitest"

import {
  detectUploadType,
  validatePomodoroUpload,
  validateUploadContentLength,
} from "@/server/pomodoro/media-uploads"
import { UPLOAD_LIMIT_BYTES } from "@/lib/pomodoro/media-limits"

/**
 * The gate every upload goes through. These are the checks that stand between
 * the bucket and whatever somebody chooses to send, so each refusal has a test
 * rather than a comment saying it is refused.
 */

/** The first bytes of a real file of each kind, which is all the sniff reads. */
const HEADERS = {
  png: [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
  jpeg: [0xff, 0xd8, 0xff, 0xe0],
  webp: [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WEBP")],
  mp3: [...ascii("ID3"), 3, 0, 0, 0],
  wav: [...ascii("RIFF"), 0, 0, 0, 0, ...ascii("WAVE")],
  ogg: [...ascii("OggS"), 0, 2, 0, 0],
  mp4: [0, 0, 0, 0x20, ...ascii("ftyp"), ...ascii("isom")],
  webm: [0x1a, 0x45, 0xdf, 0xa3, 1, 0, 0, 0],
}

function ascii(value: string) {
  return Array.from(value).map((character) => character.charCodeAt(0))
}

function bytes(header: number[]) {
  return new Uint8Array(header)
}

describe("detectUploadType", () => {
  it("names each of the eight file types from its first bytes", () => {
    expect(detectUploadType(bytes(HEADERS.png))?.mimeType).toBe("image/png")
    expect(detectUploadType(bytes(HEADERS.jpeg))?.mimeType).toBe("image/jpeg")
    expect(detectUploadType(bytes(HEADERS.webp))?.mimeType).toBe("image/webp")
    expect(detectUploadType(bytes(HEADERS.mp3))?.mimeType).toBe("audio/mpeg")
    expect(detectUploadType(bytes(HEADERS.wav))?.mimeType).toBe("audio/wav")
    expect(detectUploadType(bytes(HEADERS.ogg))?.mimeType).toBe("audio/ogg")
    expect(detectUploadType(bytes(HEADERS.mp4))?.mimeType).toBe("video/mp4")
    expect(detectUploadType(bytes(HEADERS.webm))?.mimeType).toBe("video/webm")
  })

  it("recognises nothing in a text file", () => {
    expect(detectUploadType(new TextEncoder().encode("not a png at all"))).toBe(
      null
    )
  })
})

describe("validatePomodoroUpload", () => {
  const png = {
    bytes: bytes(HEADERS.png),
    mimeType: "image/png",
    fileSize: 1000,
    purpose: "background" as const,
  }

  it("accepts a real png offered as a background", () => {
    expect(validatePomodoroUpload(png).kind).toBe("image")
  })

  it("refuses a text file renamed to .png", () => {
    expect(() =>
      validatePomodoroUpload({
        ...png,
        bytes: new TextEncoder().encode("still not a png"),
      })
    ).toThrow("INVALID_FILE_CONTENT")
  })

  it("refuses a real png that claims to be a jpeg", () => {
    expect(() =>
      validatePomodoroUpload({ ...png, mimeType: "image/jpeg" })
    ).toThrow("INVALID_FILE_CONTENT")
  })

  it("refuses an image offered as a sound loop, and the other way round", () => {
    expect(() => validatePomodoroUpload({ ...png, purpose: "sound" })).toThrow(
      "WRONG_KIND_FOR_PURPOSE"
    )
    expect(() =>
      validatePomodoroUpload({
        bytes: bytes(HEADERS.mp3),
        mimeType: "audio/mpeg",
        fileSize: 1000,
        purpose: "background",
      })
    ).toThrow("WRONG_KIND_FOR_PURPOSE")
  })

  it("holds each kind to its own size limit", () => {
    expect(() =>
      validatePomodoroUpload({
        ...png,
        fileSize: UPLOAD_LIMIT_BYTES.image + 1,
      })
    ).toThrow("FILE_TOO_LARGE")
    // The same number of bytes is fine as a video, which has a larger limit.
    expect(
      validatePomodoroUpload({
        bytes: bytes(HEADERS.mp4),
        mimeType: "video/mp4",
        fileSize: UPLOAD_LIMIT_BYTES.image + 1,
        purpose: "background",
      }).kind
    ).toBe("video")
  })

  it("refuses an empty file", () => {
    expect(() => validatePomodoroUpload({ ...png, fileSize: 0 })).toThrow(
      "FILE_TOO_LARGE"
    )
  })
})

describe("validateUploadContentLength", () => {
  it("accepts a plain length", () => {
    expect(validateUploadContentLength("2048")).toBe(2048)
  })

  it("refuses a request that never said how big it was", () => {
    // A chunked upload arrives with no length, so its size cannot be checked
    // until the whole body is already in memory. That is the hole.
    expect(() => validateUploadContentLength(null)).toThrow(
      "CONTENT_LENGTH_REQUIRED"
    )
  })

  it("refuses a length that is not a positive whole number", () => {
    for (const value of ["0", "-5", "abc", "1.5e400"]) {
      expect(() => validateUploadContentLength(value)).toThrow(
        "CONTENT_LENGTH_REQUIRED"
      )
    }
  })

  it("refuses a body larger than the largest single file", () => {
    expect(() =>
      validateUploadContentLength(String(UPLOAD_LIMIT_BYTES.video * 2))
    ).toThrow("FILE_TOO_LARGE")
  })
})
