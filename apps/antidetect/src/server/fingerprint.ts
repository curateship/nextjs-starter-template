// Coherent browser-fingerprint generation. The whole point of an antidetect
// browser is that every spoofed parameter agrees with the others and with the
// proxy's exit location — a US exit IP on a Moscow clock, or a "Windows" UA with
// a MacIntel platform, is an instant tell. Generation is deterministic given a
// numeric seed, so the dialog preview is byte-for-byte what gets saved, and
// "Regenerate" is just a new seed.
//
// This object is also the launch input: when Phase 1 wires Camoufox/itbrowser,
// these fields map straight onto the engine's fingerprint config. Browser major
// versions below should track the real engine binary once that lands.

export type FingerprintOs = "windows" | "macos" | "linux"
export type FingerprintEngine = "camoufox" | "chromium"

// What we know about a proxy's exit, harvested by the proxy connection test.
export type ProxyGeo = {
  country?: string | null
  timezone?: string | null
  city?: string | null
}

export type Fingerprint = {
  seed: number
  os: FingerprintOs
  browser: string
  userAgent: string
  platform: string
  screen: { width: number; height: number; colorDepth: number; pixelRatio: number }
  timezone: string
  locale: string
  languages: string[]
  webgl: { vendor: string; renderer: string }
  hardwareConcurrency: number
  deviceMemory: number
  canvasMode: "noise" | "off"
  webrtcMode: "proxy" | "real" | "disabled"
  geolocation: { lat: number; lng: number } | null
  fonts: string[]
}

// Browser majors paired with each engine. Camoufox is a Firefox fork; the
// chromium engine (itbrowser) reports Chrome. Keep these aligned with the binary.
const FIREFOX_MAJOR = 128
const CHROME_VERSION = "126.0.0.0"

const DEFAULT_TIMEZONE = "America/New_York"
const DEFAULT_LOCALE = "en-US"

// navigator.platform per OS (legacy, but still inspected by detectors).
const PLATFORM: Record<FingerprintOs, string> = {
  windows: "Win32",
  macos: "MacIntel",
  linux: "Linux x86_64",
}

// Real, current device resolutions with their matching devicePixelRatio.
const SCREENS: Record<
  FingerprintOs,
  ReadonlyArray<{ width: number; height: number; pixelRatio: number }>
> = {
  windows: [
    { width: 1920, height: 1080, pixelRatio: 1 },
    { width: 1536, height: 864, pixelRatio: 1.25 },
    { width: 1366, height: 768, pixelRatio: 1 },
    { width: 2560, height: 1440, pixelRatio: 1 },
    { width: 1440, height: 900, pixelRatio: 1 },
  ],
  macos: [
    { width: 1512, height: 982, pixelRatio: 2 }, // MacBook Pro 14"
    { width: 1470, height: 956, pixelRatio: 2 }, // MacBook Air 13" (M2/M3)
    { width: 1728, height: 1117, pixelRatio: 2 }, // MacBook Pro 16"
    { width: 2560, height: 1440, pixelRatio: 1 }, // external display
  ],
  linux: [
    { width: 1920, height: 1080, pixelRatio: 1 },
    { width: 1366, height: 768, pixelRatio: 1 },
    { width: 2560, height: 1440, pixelRatio: 1 },
  ],
}

// GPUs per OS; rendered into engine-appropriate WebGL vendor/renderer strings.
const GPUS: Record<
  FingerprintOs,
  ReadonlyArray<{ word: string; model: string }>
> = {
  windows: [
    { word: "Intel", model: "Intel(R) UHD Graphics 630" },
    { word: "Intel", model: "Intel(R) Iris(R) Xe Graphics" },
    { word: "NVIDIA", model: "NVIDIA GeForce GTX 1660" },
    { word: "NVIDIA", model: "NVIDIA GeForce RTX 3060" },
    { word: "AMD", model: "AMD Radeon RX 580" },
  ],
  macos: [
    { word: "Apple", model: "Apple M1" },
    { word: "Apple", model: "Apple M2" },
    { word: "Apple", model: "Apple M3" },
  ],
  linux: [
    { word: "Intel", model: "Mesa Intel(R) UHD Graphics (CML GT2)" },
    { word: "Intel", model: "Mesa Intel(R) Iris(R) Xe Graphics (TGL GT2)" },
    { word: "AMD", model: "AMD Radeon RX 6600 (RADV NAVI23)" },
  ],
}

// Plausible logical-core counts per OS class.
const CORES: Record<FingerprintOs, ReadonlyArray<number>> = {
  windows: [4, 8, 12, 16],
  macos: [8, 10, 12],
  linux: [4, 8, 16],
}

// navigator.deviceMemory is capped at 8 by the spec — never report more.
const MEMORY: ReadonlyArray<number> = [4, 8]

// Country (ISO-2) → a representative IANA timezone for that exit.
const COUNTRY_TIMEZONE: Record<string, string> = {
  US: "America/New_York",
  CA: "America/Toronto",
  GB: "Europe/London",
  IE: "Europe/Dublin",
  DE: "Europe/Berlin",
  FR: "Europe/Paris",
  NL: "Europe/Amsterdam",
  ES: "Europe/Madrid",
  IT: "Europe/Rome",
  SE: "Europe/Stockholm",
  PL: "Europe/Warsaw",
  RU: "Europe/Moscow",
  TR: "Europe/Istanbul",
  BR: "America/Sao_Paulo",
  MX: "America/Mexico_City",
  AU: "Australia/Sydney",
  JP: "Asia/Tokyo",
  KR: "Asia/Seoul",
  IN: "Asia/Kolkata",
  SG: "Asia/Singapore",
  HK: "Asia/Hong_Kong",
  AE: "Asia/Dubai",
  ZA: "Africa/Johannesburg",
}

// Country (ISO-2) → primary BCP-47 locale.
const COUNTRY_LOCALE: Record<string, string> = {
  US: "en-US",
  CA: "en-CA",
  GB: "en-GB",
  IE: "en-IE",
  DE: "de-DE",
  FR: "fr-FR",
  NL: "nl-NL",
  ES: "es-ES",
  IT: "it-IT",
  SE: "sv-SE",
  PL: "pl-PL",
  RU: "ru-RU",
  TR: "tr-TR",
  BR: "pt-BR",
  MX: "es-MX",
  AU: "en-AU",
  JP: "ja-JP",
  KR: "ko-KR",
  IN: "en-IN",
  SG: "en-SG",
  HK: "zh-HK",
  AE: "ar-AE",
  ZA: "en-ZA",
}

// Default installed-font sets, which are OS-determined (not randomized).
const FONTS: Record<FingerprintOs, ReadonlyArray<string>> = {
  windows: [
    "Arial", "Calibri", "Cambria", "Candara", "Comic Sans MS", "Consolas",
    "Constantia", "Corbel", "Courier New", "Ebrima", "Franklin Gothic",
    "Gabriola", "Georgia", "Impact", "Lucida Console", "Microsoft Sans Serif",
    "Palatino Linotype", "Segoe UI", "Tahoma", "Times New Roman",
    "Trebuchet MS", "Verdana",
  ],
  macos: [
    "Arial", "Avenir", "Avenir Next", "Geneva", "Helvetica", "Helvetica Neue",
    "Lucida Grande", "Menlo", "Monaco", "Optima", "Palatino", "PingFang SC",
    "San Francisco", "Times", "Times New Roman", "Verdana", "Courier",
    "Courier New", "Georgia", "Gill Sans",
  ],
  linux: [
    "Cantarell", "DejaVu Sans", "DejaVu Sans Mono", "DejaVu Serif", "FreeMono",
    "FreeSans", "FreeSerif", "Liberation Mono", "Liberation Sans",
    "Liberation Serif", "Noto Sans", "Noto Serif", "Ubuntu", "Ubuntu Mono",
  ],
}

// Deterministic PRNG (mulberry32) — same seed always yields the same fingerprint.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pick<T>(rng: () => number, arr: ReadonlyArray<T>): T {
  return arr[Math.floor(rng() * arr.length)]
}

export function randomSeed(): number {
  return Math.floor(Math.random() * 0x7fffffff)
}

function localeToLanguages(locale: string): string[] {
  const base = locale.split("-")[0]
  return base === locale ? [locale] : [locale, base]
}

// Chrome reports WebGL through ANGLE; Firefox reports the raw GPU. Chrome on
// macOS also famously freezes its OS token at 10_15_7.
function buildUserAgent(
  os: FingerprintOs,
  engine: FingerprintEngine,
  version: string
): string {
  if (engine === "camoufox") {
    const token =
      os === "windows"
        ? "Windows NT 10.0; Win64; x64"
        : os === "macos"
          ? "Macintosh; Intel Mac OS X 14.6"
          : "X11; Linux x86_64"
    return `Mozilla/5.0 (${token}; rv:${version}) Gecko/20100101 Firefox/${version}`
  }
  const token =
    os === "windows"
      ? "Windows NT 10.0; Win64; x64"
      : os === "macos"
        ? "Macintosh; Intel Mac OS X 10_15_7"
        : "X11; Linux x86_64"
  return `Mozilla/5.0 (${token}) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
}

function formatWebgl(
  engine: FingerprintEngine,
  os: FingerprintOs,
  gpu: { word: string; model: string }
): { vendor: string; renderer: string } {
  if (engine === "chromium") {
    const vendor = `Google Inc. (${gpu.word})`
    const renderer =
      os === "windows"
        ? `ANGLE (${gpu.word}, ${gpu.model} Direct3D11 vs_5_0 ps_5_0, D3D11)`
        : os === "macos"
          ? `ANGLE (Apple, ANGLE Metal Renderer: ${gpu.model}, Unspecified Version)`
          : `ANGLE (${gpu.word}, ${gpu.model}, OpenGL 4.6)`
    return { vendor, renderer }
  }
  // Firefox-style unmasked strings.
  const vendor =
    gpu.word === "Apple"
      ? "Apple"
      : gpu.word === "NVIDIA"
        ? "NVIDIA Corporation"
        : gpu.word === "AMD"
          ? "AMD"
          : "Intel Inc."
  return { vendor, renderer: gpu.model }
}

// Builds a coherent fingerprint. Timezone/locale follow the proxy's exit geo when
// known; everything else is picked deterministically from the seed.
export function generateFingerprint(input: {
  os: FingerprintOs
  engine: FingerprintEngine
  proxyGeo?: ProxyGeo | null
  seed?: number
}): Fingerprint {
  const seed = input.seed ?? randomSeed()
  const rng = mulberry32(seed)

  const country = (input.proxyGeo?.country ?? "").toUpperCase()
  const timezone =
    input.proxyGeo?.timezone || COUNTRY_TIMEZONE[country] || DEFAULT_TIMEZONE
  const locale = COUNTRY_LOCALE[country] || DEFAULT_LOCALE

  // Fixed call order keeps generation deterministic for a given seed.
  const screen = pick(rng, SCREENS[input.os])
  const gpu = pick(rng, GPUS[input.os])
  const cores = pick(rng, CORES[input.os])
  const memory = pick(rng, MEMORY)

  const isFirefox = input.engine === "camoufox"
  const version = isFirefox ? `${FIREFOX_MAJOR}.0` : CHROME_VERSION

  return {
    seed,
    os: input.os,
    browser: `${isFirefox ? "Firefox" : "Chrome"} ${
      isFirefox ? FIREFOX_MAJOR : CHROME_VERSION.split(".")[0]
    }`,
    userAgent: buildUserAgent(input.os, input.engine, version),
    platform: PLATFORM[input.os],
    screen: {
      width: screen.width,
      height: screen.height,
      colorDepth: 24,
      pixelRatio: screen.pixelRatio,
    },
    timezone,
    locale,
    languages: localeToLanguages(locale),
    webgl: formatWebgl(input.engine, input.os, gpu),
    hardwareConcurrency: cores,
    deviceMemory: memory,
    canvasMode: "noise",
    webrtcMode: "proxy",
    geolocation: null,
    fonts: [...FONTS[input.os]],
  }
}

// Normalizes a stored value into a full fingerprint. Rows created before
// Workstream B hold only `{ os }` — give them a stable default so the UI always
// has a coherent object to show (it gets persisted on the next save).
export function coerceFingerprint(
  value: unknown,
  os: FingerprintOs,
  engine: FingerprintEngine
): Fingerprint {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    typeof (value as { userAgent?: unknown }).userAgent === "string"
  ) {
    return value as Fingerprint
  }
  return generateFingerprint({ os, engine, seed: 1 })
}
