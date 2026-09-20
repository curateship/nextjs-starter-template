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
