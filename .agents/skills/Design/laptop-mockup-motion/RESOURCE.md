# Laptop Mockup Motion

A drop-in kit for putting **app windows on a MacBook desktop and flying a camera
over them** — a browser + terminal on a macOS desktop, driven by a synced pan/zoom
camera. Everything is plain **HTML/CSS + a tiny vanilla-JS camera**. No build step,
no framework, no network calls beyond the bundled images.

To see it: open **`template.html`** in any browser — it auto-plays the directed take
and loops. (Point Granular's preview at that file, or just double-click it.)

## What's in the box

```
laptop-mockup-motion/
├── RESOURCE.md          ← you are here (how an agent uses this kit)
├── SKILL.md             ← the deep guide: every knob, with worked examples
├── template.html        ← THE scene — the full composed, camera-driven motion. Start here.
├── windows/
│   ├── browser.html      ← the browser window on its own (extract / preview solo)
│   └── terminal.html     ← the terminal window on its own
└── assets/               ← MacBook frame, wallpapers (incl. macos-sonoma.jpg), dock + favicon icons
```

## The directed take (what `template.html` plays)

1. Establish on the whole laptop, on a minimalist dark-slate gradient backdrop.
2. Push in to the browser as it opens.
3. **One continuous sweep** left→right across the tabs — each tab grows in from the
   left under the moving lens (localhost last + active), high enough that the
   MacBook's top bezel shows.
4. Pan to the bottom-right; the **terminal opens as the camera arrives**, types
   `claude`, and **Claude Code boots** (mascot art + version/model/cwd + a ready prompt).
5. Continue to the dock, then zoom out for the finale — and loop.

## How to customise

- **Wallpaper** — one line in `template.html`'s `.desktop`: swap the `url()` for any
  file in `assets/` (default `macos-sonoma.jpg`; also `wallpaper-4k.png`, `wallpaper-grid.png`).
- **Windows** — edit the markup inside `.win.browser` / `.win.terminal`, or drop your
  own markup into a `.win` box. Position each with `left/top/width` (world is 1920×1241).
- **Tabs** — edit the `.tab` list (favicon in `assets/`, label, which one is `.hot`).
- **Terminal `claude` boot** — the typed command + Claude Code boot block live in the
  `.win.terminal` markup and the `typeClaude()` function; retime the typing/boot there.
- **Camera** — the take is `choreograph()` plus `toTerminal` / `toDock` / `toFinale`
  near the bottom of the `<script>`. Tweak the durations/holds and the framings.
- **Backdrop** — the `#stage` background (dot-matrix + cool glow + slate gradient).

`SKILL.md` documents each of these in depth, with the exact selectors and values.

## BINDING rules (keep these true when editing the kit)

- **Never hardcode the world transform / camera path.** Drive framing through the
  measured regions (`rectOf` / `camFor` / `tabSweep`) so changing the *layout*
  re-frames the camera automatically. The stage is a fixed **1920×1080**; the world
  plane is **1920×1241** (screen + welded bezel).
- **Interpolate the composed camera transform, not `cx`/`cy`/`z` separately.**
  `tweenCam` eases the final `translate()+scale()` in lockstep; easing pan and zoom
  apart makes the frame swing/"boomerang". The tab reveal uses the `E_SWEEP`
  trapezoidal cruise (ease out → constant velocity → ease in) so evenly-spaced tabs
  reveal at an even cadence.
- **Keep all assets local** — everything the scene needs is in `assets/`. No external
  fetches or fonts.
- **Honor `prefers-reduced-motion`** — it's already wired: the camera parks on the
  finished scene (all windows open, terminal booted) with no motion. Preserve that.
- **Public-safe:** this kit intentionally ships a browser + terminal window only — no
  proprietary app UI. Keep it that way if you publish it.

## Notes

One-shot kit: it produces no state and remembers nothing across runs — you install it,
open `template.html`, and edit. Duplicate the file per scene if you want variants.
