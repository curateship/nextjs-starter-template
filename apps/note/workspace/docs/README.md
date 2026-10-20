# Note app docs

What is true of the Note app in particular. What is true of every app built on
the shell lives in the repo's `docs/`.

Since 20 Oct 2026 the app has one screen family, Library: Videos, Notes and
Posts became notes kept in libraries.

- [library-list.md](library-list.md): the `/library` screen. The table of
  libraries, pins, New library, Library settings, deleting a library, and the
  one Library link in the left menu.
- [library-dashboard.md](library-dashboard.md): one library's three-column
  dashboard. Folders, Authors, Recently opened and Tags on the left, the notes
  table with search, Filter, Views and mass select in the middle, the open
  note on the right, moving notes between libraries, and Trash.
- [importing-a-note.md](importing-a-note.md): the Import dropdown, which links
  work, the folder each source files into, the `note-imports` worker, failures,
  Save from x.com, and what a deploy needs.
- [analysing-a-note.md](analysing-a-note.md): the Analyse button and its price,
  what the AI is asked for a video and for an X post, the Summary, Action plan
  and Quotes cards, Analyse many, One plan from many, and the bell.
- [note-editor.md](note-editor.md): the note editor's blocks, the "/" menu,
  links between notes, pictures, saving with the revision check and the
  offline copy, and History.
- [launch.md](launch.md): the live site on note.barelycompany.com. Where it
  runs, every live value, why the worker needs curl_cffi, how to deploy, and
  the release record.
