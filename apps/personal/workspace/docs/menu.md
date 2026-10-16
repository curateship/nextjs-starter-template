# The menu

The left menu holds sections of links, and the top bar holds links of its own.
Every link opens one screen of another app in the middle panel. All of it is
edited where it stands, with no settings screen.

## Editing

- **Add a link:** press "Add link" under a section, or the + at the end of the
  top bar. Give it a name, the screen's full address (such as
  `http://localhost:3015/admin/posts`), an icon, and where it shows. "Use the
  open page" fills in the address of the screen in the middle panel.
- **Edit or delete a link:** hover it and press the cog. In the left menu the
  cog and the drag handle appear at the link's right end. In the top bar they
  hang just under the link, so they never cover a short name. They ignore
  clicks until you hover, so clicking a link always opens it. "Shows in" moves
  a link to another section or the top bar, where it goes to the end.
- **Reorder:** drag a link by its handle within its section or the top bar. The
  keyboard works too: focus the handle, press Space, use the arrow keys, press
  Space again.
- **Sections:** "Add section" at the bottom of the left menu makes one and puts
  the cursor in its name. Hover a section's name to rename it (Enter or
  clicking away keeps the new name, Escape drops it) or delete it. Deleting a
  section that still holds links asks first. An empty one goes at once.
- **A wrong address is refused in the form:** it must start with http:// or
  https://. Names are up to 60 characters.
- **A full top bar shrinks each name and cuts it short** rather than scrolling.

## Saving

- **Every change saves itself.** It shows at once and is written to the file
  0.4 seconds after the last edit, so typing is one save. The top bar says
  Saving, then Saved. A failed save says "Not saved" with the reason and a
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

## Before it goes live

The menu file only exists on the dev server. A live Personal needs a small
server for `/api/menu` and a sign-in in front of it, or anyone with the address
could rearrange the menu.
