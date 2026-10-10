import type { MediaCatalog } from "@/lib/pomodoro/catalog"

/**
 * For tests only: the sixteen items migration 0123 seeds, as the catalogue
 * hands them to a page. A test that needs the real list reads it from a test
 * database instead; this is for the pure functions that take a catalogue.
 */
const theme = (key: string, label: string, still: string, locked: boolean) => ({
  key,
  label,
  hint: "",
  descriptor: "static",
  locked,
  tags: [] as string[],
  stillUrl: `/backgrounds/thumbs-${still}.png`,
  videoUrl: null,
  publishedAt: "2026-01-01T00:00:00.000Z",
})

const sound = (key: string, label: string, locked: boolean) => ({
  key,
  label,
  hint: "",
  descriptor: "ambient",
  locked,
  tags: [] as string[],
  fileUrl: `/sounds/audio-${key}.mp3`,
  volume: 100,
  publishedAt: "2026-01-01T00:00:00.000Z",
})

export const seededCatalog: MediaCatalog = {
  themes: [
    { ...theme("lofi", "Lofi girl", "lofi_girl", false), videoUrl: "/backgrounds/uploads-265816_small.mp4" },
    theme("ambient", "Ambient glow", "ambient", false),
    theme("plain", "Plain dark", "plain", false),
    theme("stars", "Starry night", "stars", false),
    theme("rain", "Rainy window", "rain", true),
    theme("forest", "Night forest", "forest", true),
    theme("ocean", "Ocean waves", "ocean", true),
    theme("fireplace", "Fireplace", "fireplace", true),
  ],
  sounds: [
    sound("lofi", "Lofi beats", false),
    sound("rain", "Rain", false),
    sound("cafe", "Café ambience", false),
    sound("brown", "Brown noise", false),
    sound("forest", "Forest birds", true),
    sound("ocean", "Ocean waves", true),
    sound("fire", "Fireplace", true),
    sound("piano", "Soft piano", true),
  ],
}
