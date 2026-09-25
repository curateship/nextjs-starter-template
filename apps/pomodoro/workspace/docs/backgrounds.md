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
  `scene:<key>` — later `media:<uuid>` for own uploads.
- **The product shell renders the backdrop** under its content column
  (`SceneBackdrop` in `pomodoro-shell.tsx`), so it appears behind every
  frontend page and no shell file changes. The lofi scene is the one real
  video (`public/backgrounds/uploads-265816_small.mp4`, autoplay muted
  loop); the other scenes render their stills.
- **Failures fall back:** a scene or upload whose file errors falls back to
  the default (Lofi girl) and saves that, so a deleted upload cannot leave
  a black screen.
- **Pro gating:** saving a locked scene on a free account is refused
  server-side (`UPGRADE_REQUIRED:premiumMedia` in
  `src/lib/api/pomodoro/backgrounds.ts`); locked cards say why on the page.

Assets are first-party, copied from the old app into `public/backgrounds/`.
