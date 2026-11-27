/**
 * The Sounds panel's starter pack: thirty short sound effects that ship with
 * Video, made by `scripts/make-starter-sounds.mjs` from sums rather than
 * recorded, so every one is this app's own work and needs no credit.
 *
 * A starter sound on the timeline is a sound clip with `stockSound` set and
 * no file of anybody's: the browser plays it from `/sounds/<id>.mp3` and the
 * export reads the same file from the server's own folder. Nothing is copied
 * into anyone's media library, so nobody's library fills with whooshes.
 */

export const STOCK_SOUNDS = [
  { id: "whoosh", label: "Whoosh", group: "Moves", durationMs: 700 },
  { id: "fast-whoosh", label: "Fast whoosh", group: "Moves", durationMs: 350 },
  { id: "swipe", label: "Swipe", group: "Moves", durationMs: 220 },
  { id: "whip", label: "Whip", group: "Moves", durationMs: 150 },
  { id: "riser", label: "Riser", group: "Moves", durationMs: 2000 },
  { id: "pop", label: "Pop", group: "Pops and clicks", durationMs: 150 },
  { id: "bubble-pop", label: "Bubble pop", group: "Pops and clicks", durationMs: 140 },
  { id: "click", label: "Click", group: "Pops and clicks", durationMs: 40 },
  { id: "tick", label: "Tick", group: "Pops and clicks", durationMs: 60 },
  { id: "snap", label: "Finger snap", group: "Pops and clicks", durationMs: 120 },
  { id: "keyboard-tap", label: "Keyboard tap", group: "Pops and clicks", durationMs: 70 },
  { id: "typewriter", label: "Typewriter key", group: "Pops and clicks", durationMs: 120 },
  { id: "camera-shutter", label: "Camera shutter", group: "Pops and clicks", durationMs: 200 },
  { id: "ding", label: "Ding", group: "Bells and alerts", durationMs: 1600 },
  { id: "chime", label: "Chime", group: "Bells and alerts", durationMs: 1800 },
  { id: "success", label: "Success", group: "Bells and alerts", durationMs: 700 },
  { id: "notification", label: "Notification", group: "Bells and alerts", durationMs: 300 },
  { id: "coin", label: "Coin", group: "Bells and alerts", durationMs: 500 },
  { id: "beep", label: "Beep", group: "Bells and alerts", durationMs: 200 },
  { id: "error", label: "Wrong buzzer", group: "Bells and alerts", durationMs: 400 },
  { id: "impact", label: "Impact", group: "Hits", durationMs: 1000 },
  { id: "bass-drop", label: "Bass drop", group: "Hits", durationMs: 1300 },
  { id: "kick", label: "Kick drum", group: "Hits", durationMs: 450 },
  { id: "snare", label: "Snare", group: "Hits", durationMs: 300 },
  { id: "clap", label: "Clap", group: "Hits", durationMs: 300 },
  { id: "heartbeat", label: "Heartbeat", group: "Hits", durationMs: 900 },
  { id: "boing", label: "Boing", group: "Funny", durationMs: 800 },
  { id: "record-scratch", label: "Record scratch", group: "Funny", durationMs: 500 },
  { id: "glitch", label: "Glitch", group: "Funny", durationMs: 450 },
  { id: "laser", label: "Laser", group: "Funny", durationMs: 320 },
] as const

export type StockSound = (typeof STOCK_SOUNDS)[number]
export type StockSoundId = StockSound["id"]

export const STOCK_SOUND_IDS = STOCK_SOUNDS.map((sound) => sound.id) as [
  StockSoundId,
  ...StockSoundId[],
]

export function stockSoundUrl(id: StockSoundId) {
  return `/sounds/${id}.mp3`
}

export function findStockSound(id: string | undefined) {
  return STOCK_SOUNDS.find((sound) => sound.id === id) ?? null
}

export const SOUND_FILE_NOT_FOUND_MESSAGE = "That sound file is not in your library"
export const SOUND_NOT_SOUND_MESSAGE = "Only sound files can be sound effects"
