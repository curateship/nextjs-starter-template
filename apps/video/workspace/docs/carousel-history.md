# Earlier versions of a carousel

A carousel keeps up to twenty earlier versions, by the same rule as a project
(see [project-history.md](project-history.md)). Tyler chose the same rule on
20 Oct 2026.

## What is kept, and when

A version is the carousel as it was just before a save replaced it: its
slides, shape and caption.

- **After a break:** a save arriving 30 minutes or more after the last one
  keeps what was there.
- **Every hour of editing:** when the newest version is an hour old, the next
  save keeps what it replaces. A new carousel counts its hour from when it was
  made.
- **Before restoring:** bringing a version back keeps what was there first,
  so a restore can itself be undone.
- **Never twice:** a version with the same slides, shape and caption as one
  already kept is not kept again.
- **Twenty per carousel:** older ones are deleted. Deleting the carousel
  deletes its versions.
- **A failed keep never stops the save**, except before a restore, where it
  must land first.

## Looking and bringing one back

- **Where:** the ⋯ menu at the top of the editor, "Earlier versions".
- **The list** shows when each version was saved, why it was kept, how many
  slides it had and its shape. Picking one shows its slides.
- **Bring this version back** saves what is on screen, keeps it as "Before
  restoring", puts the version's slides back, and opens the editor again on
  them.

The code is `src/server/video/carousel-versions.ts`, and the table is
`video_carousel_versions` (`drizzle/0139`).
