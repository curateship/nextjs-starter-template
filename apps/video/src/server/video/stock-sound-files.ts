import { existsSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

import { findStockSound } from "@/lib/video/stock-sounds"

export const STOCK_SOUND_MISSING_MESSAGE =
  "A sound effect this export uses is missing from the server"

// The same files the browser plays from public/sounds, kept beside the
// server's fonts so the worker build copies them next to its bundle.
const SOUND_DIR = fileURLToPath(new URL("../assets/sounds", import.meta.url))

/** The file one starter sound is read from. A missing one fails by name. */
export function requireStockSoundFile(id: string) {
  const sound = findStockSound(id)
  const file = sound ? path.join(SOUND_DIR, `${sound.id}.mp3`) : null
  if (!file || !existsSync(file)) throw new Error(STOCK_SOUND_MISSING_MESSAGE)
  return file
}
