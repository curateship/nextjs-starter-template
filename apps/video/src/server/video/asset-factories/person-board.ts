import sharp from "sharp"

import { BOARD_TILES } from "@/lib/video/extras"
import { getFromR2 } from "@/server/media/storage"

/**
 * The person board: an actor's angles and what they wear and hold, stitched
 * into one picture so they take one of the 3 places Google gives a request
 * (see workspace/docs/extras.md). Made for each request and never saved.
 */

const TILE_WIDTH = 576
const TILE_HEIGHT = 768
const GAP = 16
const WHITE = { r: 255, g: 255, b: 255, alpha: 1 }
/** Matches the ceiling the other picture resizers work to. */
const MAX_INPUT_PIXELS = 25_000_000
/** A reference picture's longest side when it goes with an AI shot. */
const REFERENCE_LONGEST_SIDE = 1536

/** A picture made here rather than read from Media, with the files it shows. */
type BoardPicture = {
  bytes: Uint8Array
  mimeType: "image/jpeg"
  tileMediaIds: string[]
}

type StoredPicture = { id: string; storagePath: string }

export async function readStoredPicture(storagePath: string) {
  const object = await getFromR2(storagePath)
  const bytes = await object.Body?.transformToByteArray()
  if (!bytes?.byteLength) throw new Error("Reference image could not be read")
  return bytes
}

/**
 * Lays pictures out on a plain white grid, two to a row, each tile the same
 * size. A picture is shrunk to fit its tile whole, never cropped, so a whole
 * outfit stays in view. No text is drawn on it, because a model copies text.
 */
export async function stitchBoard(pictures: Uint8Array[]) {
  if (pictures.length < 2 || pictures.length > BOARD_TILES) {
    throw new Error(`A board holds 2 to ${BOARD_TILES} pictures`)
  }
  const columns = 2
  const rows = Math.ceil(pictures.length / columns)
  const tiles = await Promise.all(
    pictures.map((picture) =>
      sharp(picture, { failOn: "error", limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize(TILE_WIDTH, TILE_HEIGHT, { fit: "contain", background: WHITE })
        .flatten({ background: WHITE })
        .png()
        .toBuffer()
    )
  )
  const board = await sharp({
    create: {
      width: columns * TILE_WIDTH + (columns + 1) * GAP,
      height: rows * TILE_HEIGHT + (rows + 1) * GAP,
      channels: 3,
      background: WHITE,
    },
  })
    .composite(
      tiles.map((tile, index) => ({
        input: tile,
        left: GAP + (index % columns) * (TILE_WIDTH + GAP),
        top: GAP + Math.floor(index / columns) * (TILE_HEIGHT + GAP),
      }))
    )
    .jpeg({ quality: 90 })
    .toBuffer()
  return new Uint8Array(board)
}

/** The board of these Media files, in the order given. */
export async function buildPersonBoard(
  tiles: StoredPicture[]
): Promise<BoardPicture> {
  const pictures = await Promise.all(
    tiles.map((tile) => readStoredPicture(tile.storagePath))
  )
  return {
    bytes: await stitchBoard(pictures),
    mimeType: "image/jpeg",
    tileMediaIds: tiles.map((tile) => tile.id),
  }
}

/**
 * A reference picture redrawn small enough for an AI shot, which takes them inline
 * in one request: at most 1536 pixels on its longest side, as a JPEG. Three
 * 4 MB photos come out well under a megabyte each.
 */
export async function shrinkReference(bytes: Uint8Array) {
  const shrunk = await sharp(bytes, {
    failOn: "error",
    limitInputPixels: MAX_INPUT_PIXELS,
  })
    .rotate()
    .resize(REFERENCE_LONGEST_SIDE, REFERENCE_LONGEST_SIDE, {
      fit: "inside",
      withoutEnlargement: true,
    })
    .flatten({ background: WHITE })
    .jpeg({ quality: 88 })
    .toBuffer()
  return { bytes: new Uint8Array(shrunk), mimeType: "image/jpeg" as const }
}
