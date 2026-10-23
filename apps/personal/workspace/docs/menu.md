# The menu

The left menu holds sections of links, then a short list of links at its
bottom, then Personal's controls. Personal has no top bar since 18 Oct 2026
(`app-panels.md` says why). Every link opens one screen of another app in the middle panel. All of it is
edited where it stands, with no settings screen.

## Using it

- **Editing is off until you turn it on.** Two switches do it. The pencil at
  the right end of the logo row shows when the row is hovered (Tyler, 22 Oct
  2026: "Add an icon on hover over here ... that when I click, I enable tab
  editing"). While editing is on, the pencil stays shown, filled in dark,
  and a second click turns editing off. The cog at the bottom right of the
  menu does the same with its "Edit the menu" item, which has a tick while
  editing is on. The pencil is `src/components/sidebar.tsx`. The UI rules say
  a cog for edit, but the logo row's cog already opens its name and logo
  form, so Tyler picked a pencil to keep the two apart. The cog is a dropdown so Personal's other
  admin controls can join it later. Off, the menu shows only its sections and
  links: no Add link, no Add section (its row at the bottom of the menu goes
  too), no drag handles and no link cogs. Tyler asked for this on 16 Oct
  2026: "I dont want to see all those 'add links' or draggable until its
  enabled." It starts off on every visit.
- **Pinned sits at the top of the menu**, under the logo row. It shows the
  links switched to Pinned in their edit form, in the order they were pinned,
  with the open one marked. It replaced Recent, the last three links opened,
  on 19 Oct 2026: Tyler, "Instead of 'recent' lets replace it with 'Pinned'
  if i clicked on the edit menu, give me an option to pin a link or unpin a
  link".
  - **Pin or unpin a link** with the Pinned switch in its form: turn on Edit
    the menu, hover the link, and click its cog. It works for any link,
    sub-links and bottom links included, and for links that open in their own
    tab.
  - **A pinned link stays in its own section too.** Pinned is a second way in,
    not a move. It is renamed in its section.
  - **A cog edits a link from Pinned too.** It shows between the drag handle
    and the × while editing is on and the row is hovered, and opens the same
    form as the link's cog in its section, saved to the same link. Tyler asked
    for it on 23 Oct 2026: "There should be a cog for me to edit tab settings
    for pinned as well". `LinkEditButton` in `src/components/menu-links.tsx`.
  - **Drag Pinned into a new order** by the handle that shows at a row's right
    end when it is hovered, only while editing is on (Tyler, 19 Oct 2026: "I
    shopuld be able to drag and drop pinned tabs"). A pinned row moves only
    within Pinned; dragging it never moves the link in its section, and the
    section's own handle never moves Pinned. The new order is saved to
    `pinnedLinkIds` on the drop. Code: `movePinned` in `src/lib/menu.ts`,
    `PinnedRow` in `src/components/sidebar.tsx`, the `pinned` drag kind in
    `src/components/menu-drag.tsx`.
  - **An × unpins a link from Pinned itself.** It shows next to the drag
    handle when the row is hovered, only while editing is on, so a stray click
    can't unpin anything. The row and its × light up as one, with no separate box
    round the × (Tyler, 19 Oct 2026: "should be just one hover the whole
    row").
  - **Where it is kept:** the menu file, as `pinnedLinkIds`, so every browser
    sees the same pins. A link deleted from the menu, or a section deleted with
    it, drops out of Pinned.
  - **Hidden while nothing is pinned.** It folds like a section, remembered
    under `personal-sidebar-pinned` in localStorage.
  - **Not the cog's "Pin to the menu".** That one adds the open screen to the
    menu as a new link. Pinned shows links already in the menu.
  - **Code:** `pinnedLinks` and `setPinned` in `src/lib/menu.ts`, the switch
    in `src/components/link-editor.tsx`, and `PinnedLinks` in
    `src/components/sidebar.tsx`.
- **Fold a section** by clicking its name, as in Custom Shell. A small arrow
  shows on hover and points down while the section is open. This browser
  remembers which sections are folded, under
  `personal-sidebar-section-<id>` in localStorage, so a reload keeps them.
  With storage blocked, a fold lasts until the reload. A folded section takes only
  its name's height, so folded sections stack name under name; the space under
  a section belongs to its open links, as in Custom Shell.
- **Make the menu wider or narrower** by dragging its right edge, or by
  focusing the edge and pressing the left and right arrow keys, 8 pixels a
  press. It runs from 144 to 420 pixels and starts at 218, Custom Shell's
  numbers. The width is saved to the menu file once the drag ends, or half a
  second after the last arrow press, so every browser gets it. Clicking the
  edge folds the menu to its icons, as in Custom Shell (see "Fold the menu
  to icons" below). A press that moves under 3 pixels counts as a click.
- **Make the menu lighter or darker** with the cog at the bottom, "Menu
  shade", which opens a slider. It changes the menu as it moves. It goes 10
  steps each way, and the cog's row says where it stands, such as "3 lighter".
  "Back to the default shade" shows under the slider once the shade has moved.
  Tyler asked for this on 18 Oct 2026.
  - **Each step moves the lightness by 0.015** on a scale where 0 is black and
    1 is white. Light mode's menu starts at 0.985, so it reaches white after
    one step lighter, and 10 darker is 0.835. Dark mode's starts at 0.18, so 10
    lighter is 0.33 and 10 darker is 0.03.
  - **Only the menu changes.** The middle panel keeps its own colour, and the
    highlight behind the open link stays as it is.
  - **Saved in the menu file** as `sidebarShade`, from -10 to 10, half a second
    after the slider stops. 0 leaves it out of the file. The colour is worked
    out by `sidebarShadeColor` in `src/lib/menu.ts` and set on the page in
    `src/app.tsx`. `src/theme.css` is Custom Shell's and is not changed, and
    the slider is Custom Shell's `src/components/ui/slider.tsx`, copied over
    unchanged.
- **Fold the menu to icons.** Tyler asked for it on 22 Oct 2026: "Add
  ability to collapse the sidebar to only show the icons like how normal app
  does it".
  - **Three ways to fold it:** the fold button that shows next to the pencil
    when the logo row is hovered, a click on the menu's right edge, or a
    double-click on the empty space under the links. Enter or Space on the
    focused edge does it too.
  - **Folded, the menu is 48 pixels wide**, Custom Shell's 3rem. It shows
    Pinned, then each section's links, then the links at the bottom, each as
    its icon with its name in a tooltip. A link with no icon shows its first
    letter. Section names and sub-links hide. A link stays marked while one of
    its sub-links is open.
  - **An arrow above Pinned and each section folds its icons**, the way the
    full menu folds a section by its name. Tyler asked for it on 23 Oct 2026:
    "Add a toggle arrow to show more icons ... like an uncollapsed mode
    would". The arrow points down while the icons show, and its tooltip says
    "Hide CMS" or "Show CMS". It shares the full menu's remembered fold
    (`personal-sidebar-section-<id>`, `personal-sidebar-pinned`), so a section
    folded in one is folded in the other.
  - **The bottom row keeps only the cog**, Tyler's pick. Back, Forward and
    Reload come back when the menu unfolds. A save under way shows as a
    spinner. A failed save shows as a red mark, whose tooltip gives the reason
    and whose click tries again.
  - **To unfold it,** hover the logo and click: the logo turns into the
    unfold button. A click on the edge or a double-click on the empty space
    unfolds it too. Folded, the logo no longer goes home.
  - **Editing unfolds it.** Turning on "Edit the menu" in the cog opens the
    menu again, since the folded menu has no room for the edit controls.
  - **A folded menu doesn't resize.** The edge only unfolds it.
  - **Only beside the page.** Under 768 pixels wide the menu opens over the
    page, and it always opens whole there. The fold button doesn't show.
  - **This browser remembers it**, under `personal-sidebar` in localStorage,
    so another browser keeps its own choice. With storage blocked, the fold
    lasts until the reload.
  - **Code:** `src/components/folded-sidebar.tsx`, the fold state in
    `src/app.tsx`, the edge in `src/components/sidebar-resize-handle.tsx`,
    and what counts as empty space in `src/lib/blank-space.ts`.
- **Hovering the edge draws no line**, only the resize pointer. Tyler had the
  thick hover line taken out on 18 Oct 2026. Focusing the edge with Tab still
  draws it, so the keyboard can see where it is.
- **The logo row goes home.** The whole row at the top of the left menu, logo
  and "Personal", is one link back to `http://localhost:3021/`, Personal's
  start page with nothing in the middle panel, unless a screen is chosen for
  it (see "Change the logo row" under Editing). Back returns to the screen that
  was open. Personal's own logo is the one the old Personal OS used, saved as
  `public/logo.png` with a white `public/logo-dark.png` for dark mode, and it is
  the browser tab's icon too.
- **Sub-links, as in Custom Shell.** A left-menu link can hold links of its
  own, one level deep. They sit under it, indented behind a thin line, and the
  open one darkens its stretch of that line, drawn on top of it (each sub-link
  sits 1px left, as Custom Shell's do, in `src/components/menu-links.tsx`).
  Without that shift the dark mark sat beside the grey line and read as a
  double line; Tyler flagged it on 19 Oct 2026. Tyler asked for sub-links on 16 Oct
  2026: "sidebar nav can have subnav that is wired to the top left nav like how
  shell does it." The top row that mirrored them went with Personal's top bar
  on 18 Oct 2026; the app's own top navigation does that job now.
  - **Folding:** a small arrow at the link's right end shows on hover and folds
    them away. This browser remembers it under `personal-sidebar-link-<id>`.
  - **The link stays marked** while one of its sub-links is open, so a folded
    link still shows where you are.
- **The links at the bottom** sit under the sections, above the controls, in a
  list of their own. They were the top bar's links until 18 Oct 2026, and the
  menu file still keeps them under `top`. They have no sub-links.
- **The menu's right edge and its inner lines are faint:** the theme's menu
  line colour at half strength (`border-sidebar-border/50` in `src/app.tsx`,
  `src/components/sidebar.tsx` and `src/components/sidebar-footer.tsx`). Tyler
  asked for them fainter on 16 Oct 2026. `src/theme.css` is Custom Shell's copy and is not
  changed, and dark mode fades the same way.
- **On a phone** the menu hides behind the menu button at the bottom left.
- **The menu's forms open beside it, or below on a phone.** A link's form,
  Add link and the logo row's form open to the right of the menu. Under 768
  pixels wide, where the menu opens over the page, they open below the item
  instead, above it when there is no room below, and slide sideways to stay
  8 pixels inside the screen. Opening to the right ran 73 pixels off a
  390-pixel phone. Tyler asked for the fix on 19 Oct 2026.
  `src/lib/use-menu-form-side.ts`.

## Editing

Everything here needs editing switched on.

- **Change the logo row:** hover the logo and name at the top of the left menu
  and press its cog. Tyler asked for this on 18 Oct 2026.
  - **Name** replaces "Personal" there and in the browser tab's title.
  - **Logo** takes an uploaded PNG, JPG, WebP, GIF or SVG under about 190 KB.
    "Personal logo" goes back to Personal's own, which keeps its white version
    for dark mode. An uploaded picture is one picture for both.
  - **Opens** is the screen a click on the logo and name shows in the middle
    panel. Empty keeps Personal's start page.
  - All three are kept in the menu file as `brand`, the picture inside it as
    a data address, so the file grew a 1 MB ceiling (`server/menu-file.ts`).
    Personal's own name, logo and start page together save as no `brand` at
    all. The form is `src/components/brand-editor.tsx`, the rules are
    `brandSchema` in `src/lib/menu.ts`.
  - **The browser tab's icon follows the logo.** An uploaded logo becomes the
    tab's icon as soon as it is saved, and "Personal logo" puts Personal's
    own back. Tyler asked for this on 18 Oct 2026 (`src/lib/use-favicon.ts`).
    The sign-in screen and the first moment of a reload still show Personal's
    own icon, because the menu file hasn't loaded yet.

- **Add a link:** press "Add link" under a section, or under the links at the
  bottom. Give it a name, the screen's full address (such as
  `http://localhost:3015/admin/posts`), an icon, and where it shows. "Use the
  open page" fills in the address of the screen in the middle panel.
- **Choose a link's icon** with the Icon button in the link's form. It opens a
  window laid out like Custom Shell's icon picker:
  - **The grid** starts with 35 common icons. Typing in the search box searches
    every Lucide icon by name instead, showing the first 70 that match.
  - **The +** takes any Lucide icon by name, written as `octagon-x`,
    `OctagonX` or a lucide.dev address. It says "Found Octagon X." when the
    name is real and "Lucide has no icon by that name." when it isn't.
  - **The "None" tile** leaves the link with no icon, just its name.
  - The menu file keeps the icon's Lucide name, and leaves it out for no icon.
    Links saved before 18 Oct keep their icons, and the old name "chart" still
    draws the chart. The picker is `src/components/icon-picker.tsx`, the
    names are `src/lib/link-icons.ts`, and the drawing is
    `src/components/link-icon.tsx`: the first 14 icons draw at once, any other
    loads the first time it shows.
- **Add a sub-link:** hover a left-menu link and press its +. The new link goes
  at the end of that link's sub-links, which unfold to show it. "Under <link>"
  in any link's "Shows in" does the same for a link that already exists.
- **Edit or delete a link:** hover it and press the cog. In the left menu the
  drag handle, the + and the cog appear at the link's right end, covering the
  end of its name only while hovered, so a narrow menu shows whole names the
  rest of the time. They ignore clicks until you hover, so clicking a link
  always opens it. "Shows in" moves a link to another section, the bottom of
  the menu, or under a section link, and it goes to the end there.
- **Sub-links go one level deep.** A sub-link has no + of its own. A link that
  holds sub-links can move between sections, but "Shows in" doesn't offer the
  bottom of the menu or "Under" for it, since those have no sub-links. Moving the
  last sub-link out leaves a plain link. Deleting a link that holds sub-links
  asks first, because they go with it.
- **Rename a link in place:** double-click its name, in a section, under a
  link or at the bottom. Enter or clicking away keeps the new name, Escape
  drops it, an empty name keeps the old one, and names are up to 60
  characters. Turning editing off closes a half-done rename. The first click
  of the double-click still opens the screen; the second doesn't open it
  again.
- **Drag a link anywhere:** drag it by its handle into a new spot in its own
  list, into another section, into the links at the bottom, or into an open link's
  sub-links, where it becomes a sub-link. A copy follows the pointer and a
  faint placeholder shows where it will land. While a link is dragged, an
  empty list is outlined with a dashed line: drop the link on its Add link
  row. The outline takes no room,
  so nothing moves under the pointer when a drag starts.
  Dragging the last sub-link out leaves a plain link.
- **A drop that isn't allowed snaps back:** a link that holds sub-links can't
  go into the links at the bottom or under another link, and a drop away from every list
  changes nothing.
- **The keyboard drags within a list:** focus the handle, press Space, use the
  arrow keys, press Space again. To move a link to another list from the
  keyboard, use "Shows in" in its form.
- **The whole menu is one drag area** (`src/components/menu-drag.tsx`), around
  the whole left menu. Each list of links, and the list of
  sections, is a list inside it. The menu shown while dragging is a draft:
  it is saved on the drop and thrown away on Escape. `moveLinkTo` and
  `moveSection` in `src/lib/menu.ts` make the moves.
- **Sections:** "Add section" at the bottom of the left menu makes one and puts
  the cursor in its name. Hover a section's name to drag it, rename it (Enter
  or clicking away keeps the new name, Escape drops it) or delete it. Deleting
  a section that still holds links asks first, and its count includes
  sub-links. An empty one goes at once.
- **Drag a section into a new order** by the handle on its name row. The
  keyboard works the same way as for links. A folded section moves as its
  name alone; an open one moves with its links.
- **Opens in:** a link opens in "The middle panel" or "Its own tab". A site
  that refuses to be framed, such as ign.com, can still live in the menu as a
  tab link. It is a real link to the site with a small arrow after its name,
  it never changes the panel, and it never shows as the open link. Saved as
  `"opens": "tab"`; a link without the field opens in the panel.
- **Open in a new tab:** hovering a panel link, in Pinned or a section, shows
  a small arrow at its right end that opens the link's site in a new browser
  tab. The panel stays as it was. The arrow covers the end of the name only
  while hovered, sits left of the fold arrow on a link with sub-links, and
  hides while Edit the menu is on and on tab links. Tyler asked for it on 23
  Oct 2026: "add a small icon linked out arrow here ... when hover over to
  link out its own tab". `OpenInNewTab` in `src/components/menu-links.tsx`.
- **No tooltips in the open menu.** The new-tab arrow, the pencil and the
  fold button show no name on hover; Tyler asked for them gone on 23 Oct
  2026. A screen reader still reads their names. The folded menu keeps its
  tooltips, since there the icon is all that shows.
- **Pinned:** a switch in every link's form, above the two below. Turned on,
  the link also shows in Pinned at the top of the menu; see Pinned above.
- **Personal opens here:** a switch in a panel link's form. Turned on, a visit
  to `http://localhost:3021/` opens that link's screen. Only one link can be
  the start: turning it on for one turns it off for the one before. Saved as
  `startLinkId` on the menu, and cleared when that link, the link it sits
  under, or its section is deleted. A tab link has no switch.
- **Stay loaded:** a switch in a panel link's form, under "Personal opens
  here". Turned on, that link's screen stays loaded once opened, however many
  other screens are opened after it, so going back to it is instant and keeps
  its place (`app-panels.md`). Only one link can stay loaded: turning it on
  for one turns it off for the one before, and the info icon by its name says
  which link it takes over from. Saved as `stayLoadedLinkId` on the menu, and
  cleared when that link, the link it sits under, or its section is deleted.
  A tab link has no switch. Tyler asked for it on 18 Oct 2026. The two
  "one link only" fields share `setOneLink` in `src/lib/menu.ts`.
- **A wrong address is refused in the form:** it must start with http:// or
  https://. Names are up to 60 characters.

## Saving

- **Every change saves itself.** It shows at once and is written to the file
  0.4 seconds after the last edit, so typing is one save. The bottom of the
  menu says Saving while it writes and nothing once it is done; Tyler had the "Saved"
  word taken out on 18 Oct 2026. A failed save says "Not saved" with the reason and a
  Retry button, and the change stays on screen.
- **The menu is one file on this Mac**, `apps/personal/data/menu.json`, so every
  browser sees the same menu. Git ignores it, because it is Tyler's own.
  Deleting the file brings back the starting menu: Project's My dashboard, and
  CMS's Dashboard and Listings.
- **The dev server reads and writes it** at `/api/menu` (`server/menu-file.ts`).
  A save must come from Personal's own page (`http://localhost:3021`), be JSON,
  and pass the menu's rules (`menuSchema` in `src/lib/menu.ts`). Anything else
  is refused, so another website open in the same browser cannot rewrite the
  menu. The file is written to a draft first and renamed over the old one, so a
  crash never leaves half a menu.
- **A file Personal cannot read** shows "The menu did not load" with the reason
  and Try again. Personal never overwrites it on its own.

## On live

On live the menu file sits on a Coolify volume at `/data/menu.json`, served
by `server/live.ts` behind the same sign-in (`launch.md`). Live and this Mac
keep separate menus.
