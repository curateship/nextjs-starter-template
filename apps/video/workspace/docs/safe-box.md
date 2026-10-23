# Safe box

Captions can keep out of the strips TikTok, Instagram Reels and YouTube
Shorts cover with their own buttons, names and captions, so the words are never
under the TikTok caption or the Reels like button.

## How it works

- **Pick a platform** in the caption look's "Keep clear of", on Settings,
  Captions or in the Captions window ([caption-look.md](caption-look.md)).
- **New captions land inside that platform's box** when the Captions, Voice or
  Another language window writes them, or a voiceover or Brief to video scene
  lays them. Tyler chose on 21 Oct 2026 that captions move when they are
  written, not at each export.
- **Captions already on a project stay where they are.** Picking another
  platform later moves nothing; write the captions again, or move them by
  hand.
- **Tall 9:16 projects only.** Tyler chose that for the stage guides on
  23 Sep 2026, because the platforms say nothing about other shapes, and again
  on 21 Oct 2026. On any other shape the pick changes nothing, and the
  Captions window says so under the pick.
- **The stage draws the box** as a faint dashed line on a tall project while a
  platform is picked in Settings. It is drawn over the picture and is never
  part of the export.

## Where a caption lands in the box

`placeInSafeBox` in `src/lib/video/safe-box.ts`:

- **Across:** the middle of the box, wrapping no wider than the box, or 90% of
  the frame when the box is wider than that. TikTok's right strip of 164
  pixels moves a caption's middle from 50 to 42 out of 100 across and narrows
  its lines to 85 out of 100.
- **Down:** at the look's "How far down", unless its top or bottom edge would
  be outside the box; then it moves just far enough to be inside.
- **Its height** is guessed from how many lines its words take at the face's
  average letter width, plus its box and outline. The guess leans wide, so it
  allows for a line too many before one too few.
- **A caption too tall for the box** sits in the box's middle.

One worked number: TikTok covers the bottom 350 of 1920 pixels, so the box
ends 81.8 out of 100 of the way down. A one-line Plain caption is 99 design
pixels tall (64 × 1.15 for the line plus 64 × 0.4 for the box), half of which
is 4.6 out of 100 of the frame. Asked for 78 down, its bottom edge would be at
82.6, inside the strip, so it lands at 77.2 instead.

## The numbers

Each platform has four numbers: how far in from the top, bottom, left and
right its own things reach, in pixels on a 1080 by 1920 frame. They are on
Settings, Captions, "Platform safe boxes", and save themselves as they are
typed. "Starting numbers" puts one platform back.

None of the platforms publishes these as a spec of its own, which is why they
are settings anyone can change. They start from figures gathered in the task on
21 Oct 2026, taking the cautious end of each range:

| Platform | Top | Bottom | Left | Right | Where they came from |
| --- | ---: | ---: | ---: | ---: | --- |
| TikTok | 0 | 350 | 0 | 164 | Bottom 320 to 350 and right 120 to 164 are covered; no figure for top or left |
| Instagram Reels | 269 | 450 | 65 | 120 | Bottom 310 to 450 and right 120; Meta's ads spec gives top 14 out of 100 (269) and sides 6 out of 100 (65) |
| YouTube Shorts | 0 | 300 | 0 | 48 | Bottom 300 and right about 48; no figure for top or left |

- **Meta's bottom figure** of 35 out of 100 (672 pixels) is for ads, so the
  Reels range's 450 is used instead.
- **The limits:** left and right together may cover at most 756 of the 1080
  pixels, and top and bottom together at most 1536 of the 1920, so a caption
  always has room. A number past them is marked and not saved, and leaving the
  field says why. That platform keeps its last box while the others still
  save.
- **Where they are kept:** `video_settings.safe_boxes` (`drizzle/0140`). Until
  somebody changes a number, the starting numbers apply.

## Not in it

Nothing but captions moves: text typed by hand, stickers and pictures stay
where they are put. Wide shapes have no box.
