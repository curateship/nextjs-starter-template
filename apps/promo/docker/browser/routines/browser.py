"""What the browser itself gives away, read from inside a page.

This module belongs to no network. Its routines are asked for as
`/browser/identity` and `/browser/site_check`, the same way Reddit's are
asked for as `/reddit/search`, and they run in a tab of their own that is
closed afterwards, so the tab a person may be signing in to is never moved.

- `identity` reads the machine a site believes it is talking to: the
  operating system and browser it claims, the screen, the graphics card, the
  fonts it can draw, the clock and the languages.
- `site_check` reads what a website sees on the network side: the outside
  address and its country, from the same echo service the app's proxy test
  uses, and every address the browser offers for a video call, which is the
  usual way a real address leaks past a proxy. It returns the identity too.

Neither decides anything. The app compares the readings with the proxy.
"""

import json

# ipinfo echoes the address the request came from, its country and its clock
# zone. The app's own proxy test asks the same service, so the two readings
# can be compared like for like.
ECHO_URL = "https://ipinfo.io/json"

NAV_TIMEOUT_MS = 30_000

# Fonts worth asking about: common on one system and absent on another, so the
# list a page can draw says which machine it believes it is on.
FONT_PROBES = [
    "Arial", "Arial Black", "Bahnschrift", "Calibri", "Cambria", "Candara",
    "Comic Sans MS", "Consolas", "Constantia", "Corbel", "Courier New",
    "Ebrima", "Franklin Gothic Medium", "Gabriola", "Gadugi", "Georgia",
    "Impact", "Ink Free", "Lucida Console", "Lucida Sans Unicode",
    "Malgun Gothic", "Marlett", "Microsoft Sans Serif", "MS Gothic",
    "Palatino Linotype", "Segoe Print", "Segoe Script", "Segoe UI",
    "Segoe UI Emoji", "SimSun", "Sitka Text", "Sylfaen", "Tahoma",
    "Times New Roman", "Trebuchet MS", "Verdana", "Yu Gothic",
    "Helvetica", "Helvetica Neue", "Menlo", "Monaco", "Geneva",
    "Avenir", "Futura", "Gill Sans", "Optima", "Papyrus", "SF Pro",
    "DejaVu Sans", "Liberation Sans", "Noto Sans", "Ubuntu", "Cantarell",
]

IDENTITY_SCRIPT = """
async (fonts) => {
  const gl = document.createElement("canvas").getContext("webgl")
  let gpuVendor = "", gpuRenderer = ""
  if (gl) {
    const info = gl.getExtension("WEBGL_debug_renderer_info")
    gpuVendor = String(info ? gl.getParameter(info.UNMASKED_VENDOR_WEBGL) : gl.getParameter(gl.VENDOR))
    gpuRenderer = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER))
  }
  await document.fonts.ready
  // A font is there when text drawn in it measures differently from the
  // fallback. document.fonts.check() answers true for anything it is not
  // sure about, so it cannot be used for this.
  const canvas = document.createElement("canvas").getContext("2d")
  const sample = "mmmmmmmmmmlli1WQ@#"
  const width = (family) => { canvas.font = "72px " + family; return canvas.measureText(sample).width }
  const bases = ["monospace", "serif", "sans-serif"]
  const baseWidths = bases.map(width)
  const found = fonts.filter((font) =>
    bases.some((base, i) => width('"' + font + '", ' + base) !== baseWidths[i])
  )
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    oscpu: navigator.oscpu || "",
    hardwareConcurrency: navigator.hardwareConcurrency,
    screen: { width: screen.width, height: screen.height, colorDepth: screen.colorDepth },
    devicePixelRatio: window.devicePixelRatio,
    gpuVendor,
    gpuRenderer,
    fonts: found,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    languages: Array.from(navigator.languages || []),
  }
}
"""

# Collects every address the browser offers for a peer-to-peer connection. A
# STUN server is asked so the "what is my address from outside" candidate is
# gathered as well as the local ones. Eight seconds is longer than gathering
# takes behind a slow residential proxy.
WEBRTC_SCRIPT = """
async () => {
  const addresses = new Set()
  let pc
  try {
    pc = new RTCPeerConnection({ iceServers: [{ urls: "stun:stun.l.google.com:19302" }] })
  } catch (error) {
    return { available: false, addresses: [], error: String(error) }
  }
  pc.createDataChannel("check")
  pc.onicecandidate = (event) => {
    const line = event.candidate && event.candidate.candidate
    if (!line) return
    const parts = line.split(" ")
    if (parts.length > 4) addresses.add(parts[4])
  }
  await pc.setLocalDescription(await pc.createOffer())
  await new Promise((resolve) => {
    const done = () => resolve()
    pc.onicegatheringstatechange = () => { if (pc.iceGatheringState === "complete") done() }
    setTimeout(done, 8000)
  })
  pc.close()
  return { available: true, addresses: Array.from(addresses) }
}
"""


def _in_new_tab(page, work):
    """Runs `work` in a tab of its own and always closes it."""
    tab = page.context.new_page()
    try:
        return work(tab)
    finally:
        try:
            tab.close()
        except Exception:  # noqa: BLE001 - the reading is what matters
            pass


def _read_identity(tab):
    if tab.url in ("", "about:blank"):
        tab.goto("about:blank")
    return tab.evaluate(IDENTITY_SCRIPT, FONT_PROBES)


def browser_identity(page, args=None):
    """The machine a site believes it is talking to."""
    return _in_new_tab(page, _read_identity)


def browser_site_check(page, args=None):
    """The outside address a site sees, any address a video call offers, and
    the identity, all read in the same tab a moment apart."""

    def work(tab):
        tab.goto(ECHO_URL, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)
        text = tab.evaluate("() => document.body ? document.body.innerText : ''")
        try:
            echo = json.loads(text)
        except ValueError:
            echo = {}
        return {
            "address": echo.get("ip") or "",
            "country": echo.get("country") or "",
            "addressTimezone": echo.get("timezone") or "",
            "webrtc": tab.evaluate(WEBRTC_SCRIPT),
            "identity": tab.evaluate(IDENTITY_SCRIPT, FONT_PROBES),
        }

    return _in_new_tab(page, work)


ROUTINES = {
    "identity": browser_identity,
    "site_check": browser_site_check,
}
