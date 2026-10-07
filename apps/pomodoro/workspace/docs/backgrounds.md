# Backgrounds

Eight scenes on `/backgrounds` — Lofi girl (an mp4 video), Ambient glow,
Plain dark and Starry night free; Rainy window, Night forest, Ocean waves
and Fireplace for Pro — and the chosen one draws behind every member
screen's content with a canvas-tinted shade so text stays readable.

## How it works

- **The choice is a module store** (`src/lib/pomodoro/background-store.ts`),
  like the sound engine: the page picks, every product screen draws, no
  provider around the shell's tree, saves debounced. It lives on
  `user_preferences.selected_background` (migration 0087), serialized as
  `scene:<key>`, or `media:<uuid>` for one of your own uploads (see
  [Your own backgrounds and sounds](own-media-uploads.md)).
- **The product shell renders the backdrop** under its content column
  (`SceneBackdrop` in `pomodoro-shell.tsx`), so it appears behind every
  frontend page and no shell file changes. The lofi scene is the one real
  video (`public/backgrounds/uploads-265816_small.mp4`, autoplay muted
  loop); the other scenes render their stills.
- **Failures fall back:** a scene or upload whose file errors falls back to
  the default (Lofi girl) and saves that, so a deleted upload cannot leave
  a black screen. Lofi girl is the default, so it cannot fall back to itself:
  when its film will not load, the scene is drawn as its own first frame
  (`thumbs-lofi_girl.png`), which is a picture rather than a black hero.
- **A film that failed before the page came alive still counts.** The server
  sends the `<video>` tag, the browser gives up on the file during hydration,
  and the error event is over before React has a listener on the element, so
  `onError` alone missed the usual case. The element remembers its own failure,
  so `SceneBackdrop` asks the element once on the way in as well.

## The first frame is the saved background

**A signed-in member's page is drawn with their own background from the very
first frame.** The product layout (`src/routes/_pomodoro.tsx`) and the front
page's loader read the saved choice with the rest of the page's data. The
server draws with it, and the browser takes it into the background store
before its first render, so the two agree and nothing swaps.

Before 6 Oct 2026 the server always drew the default lofi scene and the
browser asked for the real choice only after the page was up. Tyler, with rain
saved, saw the lofi girl and then rain on every load: 320ms on `/` and 570ms on
`/timer`, measured, longer on a slower connection. Every reader of the
background shares the loader's answer through `SavedBackgroundContext`: the
hero, the header's Theme popover, Zen mode and the backgrounds page.

- **The loader's answer is used once.** After the first render the store is the
  truth, so a background picked on the page is never put back by a stale page
  load.
- **A failed read draws the default**, the same as before.
- **A guest who picked a scene still sees the default first.** A guest's choice
  lives in the browser, so the server cannot know it while it draws the page.
  Fixing that would mean keeping the choice in a cookie as well.

## Reduce Motion

Nobody who has asked their computer for less movement gets a looping film
behind their timer.

- **macOS calls it Reduce Motion**, Windows calls it Show animations, and both
  land in the `prefers-reduced-motion: reduce` media query.
  `src/lib/pomodoro/use-reduced-motion.ts` reads it and follows a change, the
  same query the sound engine reads to decide whether a fade snaps.
- **The scene does not change, only its movement.** Lofi girl becomes its own
  still frame; an uploaded film is held on its first frame rather than swapped
  for something else. Nobody loses the picture they chose.
- **Changing the setting takes effect without a reload.** Switching it on stops
  the film, switching it off starts it. An uploaded film's element is rebuilt
  when the setting flips, because a film already playing does not stop just
  because `autoPlay` turned false.
- **The server renders as though motion is fine**, since it cannot know the
  setting, and the first paint in the browser corrects it.

- **Pro gating:** saving a locked scene on a free account is refused
  server-side (`UPGRADE_REQUIRED:premiumMedia` in
  `src/lib/api/pomodoro/backgrounds.ts`); locked cards say why on the page.

Assets are first-party, copied from the old app into `public/backgrounds/`.
