import assert from "node:assert/strict"
import test from "node:test"

import { resolveMediaPlaybackUrl } from "./media-url"

test("local media playback uses the public development path directly", () => {
  assert.equal(
    resolveMediaPlaybackUrl("/local-media/user/video.mp4"),
    "/local-media/user/video.mp4",
  )
})

test("remote and R2 media playback stays behind the media proxy", () => {
  assert.equal(
    resolveMediaPlaybackUrl("https://media.example.com/video.mp4"),
    "/api/media/proxy?url=https%3A%2F%2Fmedia.example.com%2Fvideo.mp4",
  )
  assert.equal(
    resolveMediaPlaybackUrl("r2://user/video.mp4"),
    "/api/media/proxy?url=r2%3A%2F%2Fuser%2Fvideo.mp4",
  )
})
