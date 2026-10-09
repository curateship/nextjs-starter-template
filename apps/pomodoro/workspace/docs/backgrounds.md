# Backgrounds

The Live scenes from the catalogue on `/backgrounds`, free and Pro, in the
order an admin set, and the chosen one draws behind every member screen's
content with a canvas-tinted shade so text stays readable. An admin adds and
edits them on the Themes admin page; see
[Themes and sounds in the admin](catalog-admin.md). Eight shipped with the
app: Lofi girl (an mp4 video), Ambient glow, Plain dark and Starry night free;
Rainy window, Night forest, Ocean waves and Fireplace for Pro.

- **Two tabs, By tag first and Pick one second**, and a Shuffle switch beside
  them. See [Shuffle and tags](shuffle-and-tags.md).
- **Any theme can be a film**, with its still as the poster and the fallback.
  A film that will not play, or anybody who asked for less movement, gets
  the still. Before 8 Oct 2026 only Lofi girl had a film.
- **A scene added in the last 14 days shows NEW**, beside PRO.
- **Lofi girl's own files ship with the app** and stay the last fallback,
  whatever happens to its catalogue row, so the default can always be drawn.

## Under the scenes

A line under the cards counts them, "1–8 of 8 backgrounds", the same line the
Sounds page has. Tyler asked for it on 7 Oct 2026 ("the theme page is missing
this"). It is the shared `CatalogPager` (`catalog-pager.tsx`): eight cards a
page, and Prev, page numbers and Next appear beside the count once there is a
second page.

## How it works

- **The theme belongs to the room you are in.** Your personal room's theme,
  or a hosted room's while you are in one. See
  [The personal room](personal-room.md). It is held in the room media store
  (`src/lib/pomodoro/room-media-store.ts`), serialized as `scene:<key>`, or
  `media:<uuid>` for one of your own uploads (see
  [Your own backgrounds and sounds](own-media-uploads.md)).
- **Clicking a scene opens a preview popover** with the scene in it. The page
  behind stays as it is. "Add to my personal room" in the popover saves it,
  and the theme in use is labelled "Currently selected".
- **The product shell renders the backdrop** under its content column
  (`SceneBackdrop` in `pomodoro-shell.tsx`), so it appears behind every
  frontend page and no shell file changes. The lofi scene is the one real
  video (`public/backgrounds/uploads-265816_small.mp4`, autoplay muted
  loop); the other scenes render their stills.
- **The scene fades out low.** It is an 860px band at the top of every page,
  and the page's content starts 560px down as before, so the picture runs on
  behind the title and fades into the page colour behind the first row of
  cards. Tyler, 8 Oct 2026: "Let the gradient flow lower", then "a bit
  higher". It used to be 720px tall and reached the page colour there, so the
  picture was gone by the title. The heights are in `pomodoro-shell.tsx`; the
  fade's stops are the `hero` shading in `scene-backdrop.tsx`. Zen mode keeps
  its own even wash.
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

**Every page is drawn with the right theme from the very first frame.** The
product layout (`src/routes/_pomodoro.tsx`) and the front page's loader read
the room you are in with the rest of the page's data. The server draws with
it, and the browser takes it into the room media store before its first
render, so the two agree and nothing swaps.

Before 6 Oct 2026 the server always drew the default lofi scene and the
browser asked for the real choice only after the page was up. Tyler, with rain
saved, saw the lofi girl and then rain on every load: 320ms on `/` and 570ms on
`/timer`, measured, longer on a slower connection. Every reader of the
background shares the loader's answer through `MediaBootstrapContext`: the
hero, the header's Theme pill, Zen mode and the backgrounds page.

- **The loader's answer is used once.** After the first render the store is the
  truth, so a background picked on the page is never put back by a stale page
  load.
- **A failed read draws the default**, the same as before.
- **A guest gets a random free scene on every visit**, picked by the loader,
  so a guest's first frame is right too.

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

- **Pro gating:** adding a locked scene to a free account's personal room is
  refused server-side (`UPGRADE_REQUIRED:premiumMedia` in
  `src/server/pomodoro/personal-room.ts`). A Pro host's scene still shows for
  a free member while they are in that room.
- **A locked card leads to the plans page.** It keeps the padlock, the faded
  picture and the Pro tag, and pressing it opens `/plans` for a member, or
  sign-in with a return to `/plans` for a guest (`use-open-plans.ts`). It is
  never a disabled button, so Tab reaches it and a screen reader hears
  "Fireplace, a Pro scene. See the plans". The tooltip with the reason stays
  for anyone hovering. A locked card used to be `disabled`, so a click did
  nothing and the keyboard skipped it.

Assets are first-party, copied from the old app into `public/backgrounds/`.
