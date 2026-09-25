import assert from "node:assert/strict"
import test from "node:test"

import { isBrokenImage } from "./broken-image"

const PHOTO = "https://cdn.example.com/listing.jpg"

test("isBrokenImage spots a picture that finished with nothing to show", () => {
  assert.equal(isBrokenImage({ complete: true, naturalWidth: 0 }, PHOTO), true)
})

test("isBrokenImage leaves a picture that loaded alone", () => {
  assert.equal(isBrokenImage({ complete: true, naturalWidth: 1200 }, PHOTO), false)
})

test("isBrokenImage waits for a picture that is still loading", () => {
  // Still in flight: `onError` will report it if it fails, so claiming it is
  // broken here would blank a photo that is about to arrive.
  assert.equal(isBrokenImage({ complete: false, naturalWidth: 0 }, PHOTO), false)
})

test("isBrokenImage leaves SVGs alone, whatever their case or query string", () => {
  // Some browsers report no natural size for an SVG that draws perfectly well.
  for (const src of [
    "https://cdn.example.com/logo.svg",
    "https://cdn.example.com/logo.SVG",
    "/api/media/proxy?url=r2%3A%2F%2Fsite%2Flogo.svg",
  ]) {
    assert.equal(isBrokenImage({ complete: true, naturalWidth: 0 }, src), false)
  }
})
