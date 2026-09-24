# Project folders

A folder is a named group of your own projects, such as "Client A" or "Weekly
tips". The projects list can show one folder at a time, so twenty client reels
stop being one long list that only search can cut through.

## Whose it is

- **One person's.** Each folder belongs to the person who made it. Nobody else
  sees it. The server checks that the folder and every project being moved
  belong to the person asking (`src/server/video/project-folders.ts`).
- **Names are per person.** Two people can both have "Client A". One person
  cannot have "Client A" and "client  a ", because names are compared with
  capitals and extra spaces ignored. Trying says "A folder with that name
  already exists." and the name box turns red.

## A project is in one folder at most

This was a choice between one folder and many, and one won.

- **Why one.** A folder answers "whose is this?" or "which series is this?",
  and a project has one answer to each. With many, the same reel shows up in
  three folders and nobody can tell which copy they are looking at, because
  there is only one.
- **Media collections are different on purpose.** A clip really is useful in
  several collections, "B-roll" and "Client A" at once, so a file can be in any
  number of them (`media-collections.md`).
- **The database enforces it.** The membership table
  `video_project_folder_items` is keyed on the project alone, so a second
  folder for the same project cannot be stored. Moving a project into a new
  folder replaces its old one.
- **No folder is a place too.** A project with no row in that table is in no
  folder. That is where every project starts.

## Deleting a folder never deletes projects

Deleting a folder removes the folder and nothing else. Every project in it
stays on the list, in no folder, with its timeline, exports and share links
untouched.

- **The confirmation says so with the count**, for example "The 3 projects in
  it stay on your list, in no folder. Only the folder goes." An empty folder
  says "It is empty, so nothing else changes."
- **The message afterwards counts again**, from the database at the moment of
  the delete, so a project moved in from another tab is still counted.
- **Deleting a project** takes it out of its folder, and the folder's count
  drops by one.

## Where the buttons are

Everything is on the projects list (Video editor), in the strip between the
toolbar and the rows.

- **Making the first one:** a **New folder** button sits in the strip while you
  have none.
- **The chips:** once one exists, the chips read All, No folder, then each
  folder by name, A to Z. No folder shows the projects that are in none.
- **Rename and delete:** pick a folder's chip, then press the cog at the end of
  the chips. The menu names the folder and its project count, and offers
  Rename and Delete. The same menu has New folder.
- **Moving projects:** tick projects, then press **Move to folder** in the
  toolbar and pick one. That is one request and one message, such as "Moved 2
  projects to “Client A”." Projects already there are counted apart: "1 was
  already in it." **No folder** in the same menu takes them out.
- **Making a folder from a selection:** **New folder** at the foot of the same
  menu creates it and moves the ticked projects in, in one go.
- **New projects and copies:** a project made while a folder is showing goes
  straight into that folder. A duplicated project goes into the same folder as
  the one it was copied from. Both are so the new project appears in the list
  you are looking at instead of vanishing from it.

Moving a project into a folder does not change its Changed date, because the
project itself did not change.

## The address

The folder being shown is in the address as `?folder=<id>`, or
`?folder=none` for No folder, beside the search, sort and page. A reload keeps
it, and opening a project and pressing Back returns to the same folder.

Switching chips replaces the address rather than adding a history step, the
same as search and sort on every list, so Back leaves the list instead of
stepping back through every chip you clicked.

If the folder in the address no longer exists, because it was deleted here or
in another tab or the link is old, the list shows every project and the
`folder` part is dropped from the address.

## Limits

- **Names** are up to 120 characters. Longer names are cut to fit, not
  refused.
- **One move takes up to 100 projects**, the most the list loads at once.
