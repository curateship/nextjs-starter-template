import assert from "node:assert/strict"
import { existsSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { test } from "node:test"

import {
  getMusicTrack,
  MUSIC_CATEGORIES,
  MUSIC_LENGTHS,
  MUSIC_TRACK_IDS,
  MUSIC_TRACKS,
  musicTrackUrl,
} from "../lib/music-library.ts"

const musicDir = new URL("../../public/music/", import.meta.url)

test("track ids are unique and match the id list", () => {
  const ids = MUSIC_TRACKS.map((track) => track.id)
  assert.equal(new Set(ids).size, ids.length, "duplicate track id")
  assert.deepEqual([...MUSIC_TRACK_IDS], ids)
})

test("every track has a valid category and a bundled file", () => {
  for (const track of MUSIC_TRACKS) {
    assert.ok(
      (MUSIC_CATEGORIES as readonly string[]).includes(track.category),
      `${track.id} has unknown category ${track.category}`
    )
    assert.ok(track.durationMs > 0, `${track.id} has a non-positive duration`)
    const file = fileURLToPath(new URL(track.fileName, musicDir))
    assert.ok(existsSync(file), `missing music asset for ${track.id}: ${track.fileName}`)
    assert.equal(musicTrackUrl(track.fileName), `/music/${track.fileName}`)
  }
})

test("getMusicTrack resolves known ids and rejects unknown ones", () => {
  assert.equal(getMusicTrack(MUSIC_TRACKS[0].id)?.id, MUSIC_TRACKS[0].id)
  assert.equal(getMusicTrack("not-a-track"), null)
  assert.equal(getMusicTrack(undefined), null)
})

test("each track falls into exactly one length bucket besides 'any'", () => {
  const buckets = MUSIC_LENGTHS.filter((bucket) => bucket.id !== "any")
  for (const track of MUSIC_TRACKS) {
    const matches = buckets.filter(
      (bucket) => track.durationMs >= bucket.minMs && track.durationMs < bucket.maxMs
    )
    assert.equal(matches.length, 1, `${track.id} matched ${matches.length} length buckets`)
  }
})
