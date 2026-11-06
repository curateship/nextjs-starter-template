# Editor chrome

The video editor keeps the shell's own chrome. It draws its panels inside the
shell layout and changes nothing about the navigation around them.

## The sidebar keeps its right border

The navigation sidebar carries the same 1px right border on the editor screen
as it does on every other screen. That line comes from the shell's sidebar
component and is coloured by Settings → Styling → Divider lines.

Between 9 Aug 2026 and 20 Sep 2026 it did not. `studio.css` carried a rule that
set `border-right-width: 0` on the sidebar whenever a studio was open, on the
grounds that the content gutter already parted the navigation from the
workspace. Tyler asked for the line back on 20 Sep 2026, so the rule is gone.

**The rule: the editor never switches off a piece of shell chrome.** If a shell
line looks wrong on this screen, the fix belongs to the shell or to the editor's
own layout, not to a rule that hides the shell's line on one route.

## The lines the editor does draw

`studio.css` still draws three of its own, and only in flat mode, where cards
have no chrome of their own:

- `.studio-flat-stage-left` and `.studio-flat-stage-right` put a line down each
  side of the picture, on the stage body so they never cut through the header
  controls.
- `.studio-flat-timeline` puts a line above the timeline.

All three use `--border`, so they follow the divider colour the user picked.

## One gutter inside the side panels

Every panel a rail tab opens on the left, and the inspector on the right, keeps
12px between its edge and the first card and 12px between one card and the
next. Tyler asked for this on 1 Nov 2026, pointing at the AI clip panel: "All
cards or spacing from the rails tabs should use that same gutter spacing." The
carousel editor's panels follow the same rule.

In code that is `p-3` on the panel's scrolling body and `gap-3` on each list of
cards; the Text and Media panels set it inline as 12. Gaps between whole
sections, such as Your sounds and the library in Sounds, are larger on purpose
and are not the gutter.

## One Sounds button for music, sounds and voices

Music, Sounds and Voices were three buttons on the editor's left menu until
4 Nov 2026. Now they are one button, **Sounds**, with the three as tabs in its
header, where the panel's title was. Tyler: "Combine music, voices and sound
into one Rail tab with just "Sounds" and in the sounds panel, add the 3 tabs
here", pointing at the title.

- **The order:** Voices, Music, Sounds. Voices moved first on 4 Nov 2026
  (Tyler: "put voices as first tab").
- **Which tab opens first:** Voices, the first of the three. The editor holds the
  tab picked, so going to Media and back keeps it (`studio-editor.tsx`,
  `soundsTab`).
- **Each tab keeps its own buttons** at the header's right end: Music's +,
  Sounds' upload +, and Voices' search and +.
- **A narrow panel shows a picker instead of the tabs.** The three tabs and
  Voices' two buttons need about 280px. The left panel opens at its narrowest,
  which on a 1440px screen leaves the header 108px, so below 280px the header
  shows one Music, Sounds or Voices picker in the tabs' place. It is a
  container query on the header (`sounds-tabs.tsx`), so it follows the panel's
  own width, not the window's.
- **The tab ids** are the old panels' ids (`music`, `sounds`, `voiceovers`,
  `src/lib/video/sounds-tabs.ts`), so a doc that says "the Music panel" or "the
  Voices panel" means that tab.

The menu now reads Videos, Media, Sounds, Ads ([ads.md](ads.md)), Elements,
Transcript, AI tools, Templates ([templates.md](templates.md), since 5 Nov
2026), AI clip, Thumbnail, then Copy, Exports and History at the foot.

## The Transcript panel

Two cards. Tyler, 5 Nov 2026: "caption and transcript should be in the
transcript panel. Also "Tighten the clip" in ai tools should be moved into
transript panel too."

- **Whole video:** the Captions and Tighten tiles, which were in AI tools
  until then. They open the same windows as before and work on the whole
  video's voice line, not on the picked clip. A read-only editor stops them
  before the window opens.
- **This clip's words:** the picked clip's words, to search, cut or fix
  (`saved-transcripts.md`, `fix-a-word.md`).
- **Why together:** all three read the same words, written down once per
  file and kept, so whichever runs first pays and the others are free.
- **The tile** is `ToolTile` in `studio-ai-panel.tsx`, shared with AI tools so
  a tool looks the same in either panel. The panel is
  `src/components/video-editor/studio-transcript-panel.tsx`.

## The Elements panel

Words, shapes, the social stickers and your own stickers. It was called Text,
then Graphics from 4 Nov 2026, then Elements from 5 Nov 2026 (Tyler: 'Rename
grahpics to "Elements"'). Its id stays `text`, because saved editor views name
it.

- **Each section is its own card:** Styles, Shapes, Social and Stickers, each
  in the same grey card the inspector on the right uses (`InspectorCard`).
  Tyler, 5 Nov 2026: "All the sections should be in its own cards."
- **A card can be shut** with the arrow beside its name, and it stays shut
  after a reload.
- **The add buttons and the sticker tiles are white** on the grey card, like
  the inspector's fields (Tyler, 5 Nov 2026: "bg should be white"). The
  carousel editor's Text panel draws the same sticker tiles, so they are white
  there too.
- **The add buttons are tighter than before the cards:** 10px by 12px of
  padding, 8px apart, so "Big Title" still fits on one line when the panel is
  at its narrowest.
- **A guest sent from Project** has no Stickers card, because stickers are the
  owner's own list.
- **Where it lives:** `TextPanel` in `src/components/video-editor/studio-panels.tsx`.

## Shut or open every inspector card at once

The inspector's header, on the right, has one button that shuts every card in
it, and on the next press opens them all again (Tyler, 4 Nov 2026: "add an icon
in the inspector panel to collapse and uncollapse all the cards at once"). It is
the shell's own `InspectorCollapseAllButton` from
`src/components/shared/inspector-card.tsx`, the one the page editor uses. Each
card still remembers its own state, so a panel shut from the header stays shut
after a reload, and cards that appear when another clip is picked open as they
were last left.

## No loading circle in the side panels

A rail tab's panel stays blank under its header until its list arrives, then
draws it. It never shows a spinning circle. Tyler, 2 Nov 2026: "remove the
circle loading screen in the left panels because the content is not slow
enough so the loading circle just causes a flicker instead." That covers the
video editor's Videos, Music, Sounds, Voiceovers (and Your voices),
AI clip (and its Carousels card), Copy, Exports and History panels, the
carousel editor's Carousels and Media panels, and the sticker list in both.

A failed load still says so, with a Try again button. The spinners left are on
buttons while they work, on a file still being got ready, and inside windows
such as Move to project, which are not side panels.

## The Videos and Carousels tabs keep their list when you switch

The editor is drawn afresh for every video or carousel you open, so the
Videos and Carousels tabs used to empty and load again on each switch. They
now keep what they last showed for that project: the list, the search, the
filter and how far down it was scrolled. The new one draws that at once and
then reads the list again quietly, so a change made elsewhere still shows up.
The memory lasts until the page is reloaded (`remembered` in
`src/components/video-assets/pieces-panel.tsx`).

The player in the middle measures its space before it is first drawn, in both
editors, so a switch goes straight from one video or slide to the next. It
used to draw one empty frame first while it waited to measure (Tyler, 2 Nov
2026: "the player in the middle still flashes"). Footage still has to load
in the new video, so a clip can show black for a moment until its first
frame arrives.

## The playhead runs the full height of the timeline

The red playhead, and the alignment line that appears while a clip is being
dragged, reach the bottom edge of the timeline panel however few lanes the
project has.

Both lines are drawn `top: 0; bottom: 0` inside the timeline's scrolling
content, so their height is the height of that content. With three lanes in a
tall panel the content stopped under the last lane and the playhead stopped with
it, well short of the panel's edge. The content now carries `min-height: 100%`
(`src/components/video-editor/studio-timeline.tsx:287`), so it is always at
least as tall as the box it scrolls in. A project with enough lanes to scroll is
unaffected, because the lanes are already taller than that.

## The parts the editor borrows from the shell

Every panel header in the studio and in the carousel studio comes from the
shell's `src/components/shared/dashboard-card-header.tsx`. The side panels use
`DashboardCardTitleHeader`. The middle panel, with the way back, the project
name and the Export button, uses the plain `DashboardCardHeader` frame laid out
as three columns (`StageHeader` in `studio-editor.tsx`, `CarouselStageHeader` in
`carousel-studio.tsx`). The frame owns the 57px height, so a header in the
studio and a header on the contacts page are the same height and have the same
line underneath, and a change to the shell's reaches both at once.

Until 23 Sep 2026 the middle header set its own height of 3.15rem, about 50px,
so its line sat 7px higher than the lines under the panels on either side.

Failures the editor cannot put right itself go to the shared error toast from
`src/lib/toast/error-toast.ts`. Two of them exist: a timeline that will not
parse, and a project that another window saved first so this one has stopped
saving (`two-windows.md` says what happens to that window's work). Neither
draws a banner in the editor, because a banner above the stage would shrink the
picture every time something went wrong. A window that is not saving shows a
lock button beside the project name instead, which is 32px wide and reloads the
page.

Both were named differently until 20 Sep 2026, `WorkspacePanelHeader` and
`ErrorBanner`, and both lived in files the app carried its own copy of. The
shell renamed them and deleted the old files, so the editor now imports the
shell's.
