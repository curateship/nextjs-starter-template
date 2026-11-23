import type { Browser } from "playwright-core"

/**
 * Opens a Google Maps link in a hidden browser on the server and reads the
 * venue's panel once it has drawn: its name, category, address, phone,
 * website and main photo (Tyler, 3 Nov 2026: "When i say step further I mean
 * that the app takes another step to visit the google link and then capture
 * the image"). The page a server fetches holds none of this; Google draws it
 * in the browser, so a browser has to load it.
 *
 * A link with no place in it (only a name and a pin) shows no panel, so the
 * name is searched at the pin instead, which opens that venue's panel.
 *
 * Only Google addresses are opened; fonts and map tiles aren't downloaded. A
 * search that lists several places opens the first. A link holding a place
 * reads in a few seconds; one that has to be searched takes longer. One page at a time, and
 * the browser closes after a minute of nothing to do.
 */

export type Venue = {
  name: string
  category: string | null
  address: string | null
  phone: string | null
  website: string | null
  /** The main photo's address on Google's picture host, sized for a card. */
  photoUrl: string | null
}

const PANEL_MS = 7_000
/** More fills than this waiting skip the browser, so one person pasting fast can't hold everyone up. */
const MAX_WAITING = 4
const IDLE_MS = 60_000

let browser: Promise<Browser> | null = null
let idleTimer: ReturnType<typeof setTimeout> | null = null
let queue: Promise<unknown> = Promise.resolve()
let waiting = 0

async function openBrowser() {
  if (idleTimer) clearTimeout(idleTimer)
  browser ??= import("playwright-core").then(({ chromium }) =>
    chromium.launch({
      // The live server's own Chromium; locally, the one Playwright installed.
      executablePath: process.env.TRAVEL_CHROMIUM_PATH?.trim() || undefined,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    })
  )
  return browser.catch((error: unknown) => {
    browser = null
    throw error
  })
}

function closeWhenIdle() {
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    const open = browser
    browser = null
    void open?.then((b) => b.close()).catch(() => undefined)
  }, IDLE_MS)
}

/** Reads the venue's panel inside the hidden page. Plain text, so the build can't add to it. */
const READ_PANEL = `(() => {
  const text = (selector) => {
    const element = document.querySelector(selector)
    const value = element ? element.innerText : ""
    return value.replace(/[\\uE000-\\uF8FF]/g, "").trim() || null
  }
  const hero = document.querySelector('button[jsaction*="heroHeaderImage"] img')
  const anyPhoto = Array.from(document.images)
    .map((image) => image.src)
    .find((src) => /googleusercontent\\.com\\/(p|gps-cs-s|grass-cs|gps-proxy)\\//.test(src))
  const site = document.querySelector('a[data-item-id="authority"]')
  return {
    name: text("h1") || "",
    category: text('button[jsaction*="category"]'),
    address: text('button[data-item-id="address"]'),
    phone: text('button[data-item-id^="phone"]'),
    website: site ? site.href : null,
    photoUrl: (hero && hero.src) || anyPhoto || null,
  }
})()`

/** A photo address at card size: Google's "=w408-h306-k-no" ending asks for a size. */
export function largerPhoto(src: string) {
  return src.replace(/=w\d+-h\d+[^/?#]*$/, "=w1200-h900-k-no")
}

/** Whether an address belongs to Google, the only place the hidden browser goes. */
export function isGoogle(url: URL) {
  // Google's own country endings only (google.com, google.co.jp, google.com.au,
  // google.de), so a look-alike such as google.evil.io can't pass.
  return (
    url.protocol === "https:" &&
    /(^|\.)google\.(com|[a-z]{2}|co\.[a-z]{2}|com\.[a-z]{2})$|(^|\.)(gstatic|googleapis|googleusercontent|ggpht)\.com$/.test(url.hostname)
  )
}

/** A search for the venue at its pin, which opens its panel when the link itself held no place. */
export function searchAddress(name: string, lat: number | null, lng: number | null) {
  const at = lat !== null && lng !== null ? `/@${lat},${lng},17z` : ""
  return `https://www.google.com/maps/search/${encodeURIComponent(name)}${at}?hl=en`
}

/** Reads the venue at a Google Maps address, or null when no panel shows. Never throws. */
export function readVenue(page: URL, fallback: { name: string | null; lat: number | null; lng: number | null }) {
  if (waiting >= MAX_WAITING) return Promise.resolve(null)
  waiting += 1
  const run = queue.then(() => readVenueNow(page, fallback)).finally(() => {
    waiting -= 1
  })
  queue = run.catch(() => undefined)
  return run
}

async function readVenueNow(
  address: URL,
  fallback: { name: string | null; lat: number | null; lng: number | null }
): Promise<Venue | null> {
  let context: Awaited<ReturnType<Browser["newContext"]>> | null = null
  try {
    const opened = await openBrowser()
    context = await opened.newContext({ locale: "en-US", viewport: { width: 1200, height: 900 } })
    const page = await context.newPage()
    await page.route("**/*", (route) => {
      const request = route.request()
      let url: URL
      try {
        url = new URL(request.url())
      } catch {
        return route.abort()
      }
      if (!isGoogle(url)) return route.abort()
      // Map tiles, fonts and video aren't needed. Google's photo host stays
      // open: the panel only gives its photo an address once it starts loading.
      const type = request.resourceType()
      if (type === "font" || type === "media") return route.abort()
      if (type === "image" && !/googleusercontent\.com$|ggpht\.com$/.test(url.hostname)) return route.abort()
      return route.continue()
    })
    const tries = [address.toString()]
    if (fallback.name) tries.push(searchAddress(fallback.name, fallback.lat, fallback.lng))
    for (const next of tries) {
      await page.goto(next, { waitUntil: "domcontentloaded", timeout: 20_000 })
      // Some countries are asked about cookies first; the least is chosen.
      const reject = page.getByRole("button", { name: /reject all/i })
      if (await reject.isVisible().catch(() => false)) await reject.click().catch(() => undefined)
      const heading = page.locator("h1").filter({ hasText: /\S/ }).first()
      // A real wait: `isVisible` answers at once and ignores a timeout.
      const drawn = await heading
        .waitFor({ state: "visible", timeout: PANEL_MS })
        .then(() => true)
        .catch(() => false)
      if (!drawn) continue
      // A search that matched several places shows a "Results" list; the first is the nearest match.
      if ((await heading.innerText().catch(() => "")).trim() === "Results") {
        // Opened at its own address, so the page holds that one place's panel and nothing else.
        const href = await page.locator('a.hfpxzc[href*="/maps/place/"]').first().getAttribute("href").catch(() => null)
        if (!href) continue
        const place = new URL(href, "https://www.google.com")
        if (!isGoogle(place)) continue
        await page.goto(place.toString(), { waitUntil: "domcontentloaded", timeout: 20_000 })
        const opened = await page
          .locator("h1")
          .filter({ hasText: /\S/ })
          .first()
          .waitFor({ state: "visible", timeout: PANEL_MS })
          .then(() => true)
          .catch(() => false)
        if (!opened) continue
      }
      // The hero photo gets its address a moment after the heading draws.
      await page
        .locator('button[jsaction*="heroHeaderImage"] img[src*="googleusercontent"]')
        .first()
        .waitFor({ state: "attached", timeout: 3_000 })
        .catch(() => undefined)
      // Sent as plain text: the build adds helpers to compiled functions that
      // the hidden page doesn't have, so a compiled callback fails there.
      const venue = (await page.evaluate(READ_PANEL)) as Venue
      if (!venue.name || venue.name === "Results") continue
      return { ...venue, photoUrl: venue.photoUrl ? largerPhoto(venue.photoUrl) : null }
    }
    return null
  } catch {
    // No browser on this server, or Google didn't load: the link's own name and pin still fill in.
    return null
  } finally {
    await context?.close().catch(() => undefined)
    closeWhenIdle()
  }
}
