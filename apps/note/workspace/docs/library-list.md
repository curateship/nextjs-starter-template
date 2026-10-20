# The Library screen

`/library` lists every library a person has. A library holds notes, written by
hand or imported from a link, and opens as its own three-column dashboard
(`library-dashboard.md`). Videos, Notes and Posts became this one screen on
20 Oct 2026.

## Tyler's rules, 20 Oct 2026

His answers, in his words where he gave words. They outrank the code.

- Library is a list of libraries; each one opens the dashboard. ("A list of
  libraries")
- The list is a table like Projects. ("Table like Projects")
- A library looks like a Project: a banner, a picture, a colour dot, its name,
  pin, cog and a description. ("Like in project")
- Only the owner sees a library. ("Only its owner")
- The app's left menu has one "Library" link in place of Videos, Notes and
  Posts. ("One "Library" link")
- Notes can move to different libraries. ("notes can move to diff libraries")
- The videos, posts and notes saved before were deleted, not converted. ("Start
  fresh, delete them", "Delete them too")

## Defaults Tyler was offered and did not change

- A library has no status and no lead, since it has nothing to measure.
- Deleting a library asks first, says how many notes go with it, and deletes
  them for good. There is no Trash for libraries.
- The Save from x.com button saves into the library opened last, or makes one
  called "My library" for somebody with none.

## The table

`src/components/note-library/libraries-page.tsx`.

- **One row per library**: its picture (or its first letter), colour dot, name
  and description, how many notes it holds (not counting Trash), and when it or
  any note in it was last edited.
- **Pinned libraries come first** whatever the sort, and their rows are yellow,
  as Projects draws pinned projects. The pin is the first of the row's buttons.
- **Search** reads names and descriptions. Clicking a row, or its name, opens
  the library.
- **The cog** opens Library settings: name, description, colour, picture and
  banner (the shell's picture picker, from the media library). Saving shuts the
  window; Cancel with changes asks before throwing them away.
- **The bin** asks "Delete Content ideas?", names the note count, and deletes
  the library with every note and its saved files.
- **New library** is a dropdown, not a window: name, description and colour,
  then Create library, which opens the new library. Two libraries of one person
  cannot share a name, capitals ignored.
- **Empty**: "No libraries yet. New library makes one."

## The left menu link

Migration `0103_note_library_menu.sql` changes every saved left menu, each
site's admin menu and the one members' menu. The Library link
(`item-note-library`, icon "library") takes the place of the first of the
Videos, Notes and Posts links the menu had, wherever it sat, inside a group
too, and keeps that link's own visibility and roles, so a hidden or admin-only
link stays so. The other two go. A section with no list of entries is left as
it was. A menu with none of the three gets Library after
its first entry. A menu that already links to `/library` keeps its own and only
loses the three. `/library` is not under `/admin`, so members see it.

## Where the code is

- Tables: `note_libraries` in `src/server/note/schema.ts`, SQL in
  `drizzle/0102_note_library.sql`.
- Server code: `src/server/note/library/libraries.ts`.
- Server functions: `src/lib/api/note/library.ts`, every one on `userGet` or
  `userPost`, scoped to the signed-in person.
- Route: `src/routes/_authenticated/library.index.tsx`. Its `?save=` is the
  Save from x.com button's link (`importing-a-note.md`).
