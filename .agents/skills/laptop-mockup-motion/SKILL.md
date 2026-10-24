---
name: laptop-mockup-motion
description: A MacBook motion-graphic kit in plain HTML/CSS/JS. A browser and terminal window on a macOS desktop with menu bar and dock, filmed by a pan/zoom camera (tabs open, Claude Code boots in the terminal, camera flies over the dock). Use when asked for a laptop mockup, a MacBook promo animation, or a product video scene showing an app on a Mac. Start from template.html in this folder.
---

# Laptop Mock-up Motion Graphic — skill

A drop-in kit for putting **app windows on a MacBook desktop and flying a camera
over them** — the reusable core of Granular's laptop promo scenes, packaged for
general use. Everything is plain HTML/CSS + a tiny vanilla-JS camera. No build
step, no framework, no network calls beyond the bundled images.

> Public-safe: this kit intentionally ships a **browser** window and a **terminal**
> window only. The proprietary Granular app window is **not** included.

## What's in the box

```
laptop-mockup-motion/
├── SKILL.md            ← you are here
├── template.html       ← the full composed scene (mockup + wallpaper + menu bar
│                          + dock + browser + terminal + pan/zoom camera). Start here.
├── windows/
│   ├── browser.html    ← the browser window on its own, with a looping
│   │                      NEW-TAB OPEN animation (extract / preview solo)
│   └── terminal.html   ← the terminal window on its own
└── assets/             ← MacBook frame, 4 wallpapers, dock + favicon icons
```

Open `template.html` in any browser — it auto-loops the camera tour. Reduced-motion
is honored (the camera parks on the establishing shot).

## The moving parts (what you asked this skill to carry)

| Piece | Where | Notes |
|---|---|---|
| **The mock-up** | `assets/macbook-frame.png` + `.laptopframe` in `template.html` | Photographic MacBook bezel welded over the screen; scales with the camera. |
| **Interchangeable backgrounds** | `.desktop { background: url(...) }` | Swap for any file in `assets/`: `wallpaper-4k.png` (green), `wallpaper-grid.png` (green grid), `wallpaper.svg`, `screen-wallpaper.png`. |
| **Pan/zoom animation** | the `<script>` in `template.html` | `cam{cx,cy,z}` → `applyCam()`; `tweenCam()` eases between shots; `rectOf`/`regionOf`/`camFor` frame elements; the `TOUR` array is the beat list. |
| **App windows** | `.win.browser`, `.win.terminal` | Reusable window chrome. Position each `.win` with `left/top/width`. |
| **Mac desktop** | `.desktop` | Full-bleed macOS desktop inside the screen. |
| **Apple menu bar** | `.menubar` | Apple logo + app name + menu items + wifi/battery/clock. |
| **App dock** | `.dock` | Glassmorphic dock, 14 app icons from `assets/`. |

## How to customise

**Swap the wallpaper** — one line in `template.html`:
```css
.desktop{ background:url("assets/wallpaper-grid.png") center/cover no-repeat, ...; }
```

**Change window content** — edit the markup inside `.win.browser` / `.win.terminal`
(tabs, URL in `.omni`, terminal lines). Or replace a window wholesale with your own
markup — just keep it inside a `.win` box.

**Move / add a window** — position with CSS:
```css
.win.browser { left:150px; top:150px; width:1000px; }   /* world is 1920×1241 */
```
To add a third window, add a `.win.myapp` box and give it left/top/width.

**Author the camera tour** — edit the `TOUR` array. Each beat frames whatever CSS
selectors you list in `reg`:
```js
{ reg:['.win.browser'], fill:0.86, zmax:1.45, dur:1500, hold:2200 }
```
- `reg`   — element(s) to frame (camera fits their union).
- `fill`  — how much of the frame they fill (0.8–0.9 leaves margin).
- `zmax`  — zoom ceiling (stops tight shots getting too close).
- `bias`  — `{dx,dy}` nudge in world px (e.g. bank headroom above a window).
- `dur`   — tween time (ms); `hold` — pause on the shot before the next beat.
Beats play in order and loop back to beat 0.

## The browser tab-opening animation (`windows/browser.html`)

The standalone browser window ships a looping **new-tab open** beat, the reusable
default motion for "someone opens a tab and a page loads":

1. the **+** button nudges,
2. a new tab **grows in from width 0** while the others make room,
3. its favicon + title **fade in** and it becomes the **active** tab,
4. the **address bar swaps** to the new URL,
5. a **load bar** sweeps under the toolbar,
6. the page **cross-fades** from the fresh "new tab" state to a loaded layout,
7. it holds, the tab **closes**, and the loop restarts.

**Customise what opens** — one object at the top of the `<script>`:
```js
var TAB = {
  fav: '../assets/globe.svg',   // favicon (any file in assets/)
  favFull: false,               // true for a square/photo favicon
  title: 'granular.build',      // tab label
  url: 'granular.build'         // address-bar text once it loads
};
```
Retime it in `openTab` / `closeTab` / `loop` (the grow is `.34s`, matching the
`.tab` transition — keep them in sync). `prefers-reduced-motion` parks on the
opened + loaded end state with no motion. To use it inside the full scene, port
this markup + script into the `.win.browser` block of `template.html` (the CSS is
the same class names) and let the camera push in on the browser as the tab opens.

## Invariants (keep these true)
- **Never hardcode the world transform.** Drive framing through `reg`/`fill`/`bias`/`zmax`
  so `rectOf`/`camFor` stay the single source of truth. Change the *layout*, and the
  camera re-frames itself.
- The stage is a fixed **1920×1080**; the world plane is **1920×1241** (screen + bezel).
- Keep all assets local (they're in `assets/`). No external fetches.
- Honor `prefers-reduced-motion` (already wired — the camera parks on the wide shot).

## Provenance
Extracted (not moved) from Granular's motion scenes: the welded-bezel rig + menu bar
+ dock from `scene-8.3-sprawl-laptop.html`, the pan/zoom camera from
`scene-cl-laptop.html`, and the browser window from `tabs-preview.html`. Those
originals are untouched.
