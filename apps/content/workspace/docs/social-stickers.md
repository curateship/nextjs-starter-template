# Social stickers

Three ready-made stickers sit under Social in the Elements panel: a comment
reply, a Subscribe button and a "Link in bio" tag. A fourth, a question box,
was built on 4 Nov 2026 and taken out the same day (Tyler: "Remove the
question box"). Each one
lands at the playhead, and you place it like a circle: drag it on the preview,
or drag a corner dot to make it bigger or smaller. They are video only; a
carousel has none (Tyler, 4 Nov 2026: "Video only").

## The four

- **Comment reply.** A reply to a viewer's comment, in TikTok, Instagram or
  YouTube's look. TikTok's says "Reply to Sam's comment" over the words with a
  bubble tail. Instagram's has the name over the words, "Reply" under them and
  a heart. YouTube's is dark, with "@sam · 1 day ago", a thumbs up and Reply.
  The words wrap to at most five lines and end in "…" past that.
- **Subscribe button.** YouTube's red Subscribe with the bell, TikTok's Follow
  or Instagram's blue Follow, beside your name and picture. It plays a short
  film: a cursor comes in at 0.4 seconds, presses the button at 1.1 seconds,
  the button turns to Subscribed or Following, and the cursor fades by 1.9
  seconds. A Click sound lands on a lane of its own at the 1.1-second press.
  The sticker and the click are put down as one Undo step. The click is a
  sound clip of its own, so it can be moved or deleted, and it does not follow
  the sticker if the sticker is moved.
- **Choosing the click sound.** The Subscribe sticker's settings have a Click
  sound picker (Tyler, 4 Nov 2026: "I want to choose a sound in the
  archive"): No sound, any of the 30 starter sounds, or one of your own from
  the Sounds panel, shown as "Yours: …". The sound clip carries the sticker's
  id (`pressFor`), so choosing another swaps that clip in place, No sound
  deletes it, and choosing one when there is none lays it on a lane of its
  own at the press. Each is one Undo. A guest sent from Project has the
  starter sounds only. Copying the sticker together with its click and
  pasting gives the pasted sticker the pasted click. A click copied, pasted,
  duplicated or split on its own is an ordinary sound, linked to no sticker,
  and deleting the sticker leaves its click on the timeline.
- **Link in bio.** A white pill with a link symbol and editable words, at most
  24 letters, and an arrow pointing down or up.

## Name and picture

A new sticker starts with your profile's name and picture (Tyler, 4 Nov 2026:
"Profile, then edit"). Both can be changed on each sticker in the "Who it's
from" card, and the picture comes from your media library. With no picture
the sticker shows the name's first letter on a purple circle. A guest sent
from Project starts with their own name and no picture, and can't pick one,
because a guest has no media library.

The sticker keeps the picture's address. The export turns that address back
into one of the owner's own files before reading it (`social-pictures.ts`), so
a sticker can never pull in somebody else's picture. If the file has been
deleted, the export draws the first letter instead of failing.

## Arriving

Every sticker arrives with Pop and can use None, Rise or Bounce instead. These
are the caption entrances, a quarter second long (`caption-animations.ts`).
Fades and timing are the same as on any shape.

## How it is drawn

A sticker is a shape clip with `shape` set to `comment`, `subscribe` or
`link-in-bio` (`src/lib/video/social-stickers.ts`). Its box is a
shape's two points, and the sticker is drawn as big as fits in that box, in
its middle. Changing the words or the name grows or shrinks the box's height
to the sticker's new shape, keeping its width.

The preview and the export draw the same SVG from that file. The preview puts
it in the stage's shape layer. The export draws it to a picture with resvg in
Inter SemiBold, one picture per frame while it arrives or its cursor moves,
then one still for the rest. Lines are cut by an estimate of the letters'
width, not by measuring, so both ends break them in the same places. While a
sticker is picked and the video is paused, the preview shows it just after it
has arrived, so the Subscribe button reads "Subscribe" and has no cursor.

## Where it lives

- The Elements panel's Social section: `TextPanel` in `studio-panels.tsx`.
- The settings: `social-sticker-inspector.tsx`.
- Tests: `social-stickers.test.ts`, `render-social.test.ts` (a real export:
  red before the press, grey after, the picture drawn, the name in white),
  and the Undo test in `editor-store.test.ts`.
