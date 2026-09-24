# Media collections

A collection is a named group of your own files, such as "B-roll", "Hooks" or
"Client work". The editor's Media panel can show one collection at a time, so a
long library shrinks to the files you want for this edit.

## Whose it is

- **One person's.** Each collection belongs to the person who made it. Nobody
  else sees it, and nobody else's files can go into it: the server checks every
  file id against its owner before adding it
  (`src/server/video/media-collections.ts`).
- **Names are per person.** Two people can both have "B-roll". One person
  cannot have "B-roll" and "b-roll ", because names are compared with capitals
  and extra spaces ignored. Trying says "A collection with that name already
  exists." and the name box turns red.
- **A file can be in any number of collections.** Adding it to "Hooks" leaves
  it in "B-roll".

## Deleting one never deletes files

Deleting a collection removes the collection and nothing else. Every file in it
stays in the media library and in any project that uses it. The confirmation
says so with the count, for example "The 12 files in it stay in your media
library. Only the collection goes." Taking a file out of a collection works
the same way: the file stays.

Deleting a file does take it out of every collection it was in.

## Where the buttons are

Everything is in the editor's Media panel, under the All / Video / Image /
Sound tabs. The shell's Admin > Media page is not touched, because it belongs
to Custom Shell and the Video app may not edit it.

- **Making the first one:** a **New collection** button sits under the tabs
  while you have none.
- **The chips:** once one exists, the chips read All, Uncollected, then each
  collection by name. Uncollected shows the files that are in no collection.
- **Rename and delete:** pick a collection's chip, then press the cog at the
  end of the chips. The menu names the collection and its file count, and
  offers Rename and Delete. The same menu has New collection.
- **Putting many files in at once:** press **Select** beside the "Clips" count,
  tick files (or press **Select all**), then **Add to collection** and pick
  one. That is one request and one message, such as "Added 10 files to
  “Hooks”." Files already in it are counted apart: "2 were already in it."
- **Making a collection from a selection:** **New collection** at the foot of
  the same menu creates it and puts the ticked files in, in one go.
- **Taking many out:** while a collection's chip is picked, the same menu
  offers **Remove from “Hooks”**.
- **One file at a time:** right-click a file and open **Collections**. Each
  collection has a tick beside it if the file is in it. Clicking one adds or
  removes just that one, and the menu stays open so several can be ticked.

## Another tab

The chips are fetched again whenever the tab is looked at again: switching
back to it, or clicking into its window. A collection made or deleted in
another tab shows up then, without a reload. A tab that sits on screen beside
the other one, never clicked, keeps its old chips until it is clicked.

If the collection being shown is deleted elsewhere, the panel falls back to
All.

## Limits

- **Names** are up to 120 characters. Longer names are cut to fit, not
  refused.
- **The panel shows 30 files**, the newest first, so Select all ticks at most
  30. The server takes up to 100 files in one request.
