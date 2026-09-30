# Backgrounds

Eight scenes on `/backgrounds` — Lofi girl (an mp4 video), Ambient glow,
Plain dark and Starry night free; Rainy window, Night forest, Ocean waves
and Fireplace for Pro — and the chosen one draws behind every member
screen's content with a canvas-tinted shade so text stays readable.

## How it works

- **The choice is a module store** (`src/lib/pomodoro/background-store.ts`),
  like the sound engine: the page picks, every `PomodoroScreen` draws, no
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
