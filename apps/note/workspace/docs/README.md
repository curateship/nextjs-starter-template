# Note app docs

What is true of the Note app in particular. What is true of every app built on
the shell lives in the repo's `docs/`.

Since 20 Oct 2026 the app has one screen family, Library: Videos, Notes and
Posts became notes kept in libraries. Since 15 Nov 2026 it is one dashboard.

- [library-dashboard.md](library-dashboard.md): the `/library` dashboard on
  the shell's three-panel design. The left page with the Libraries and Tags
  blocks, New library and each library's ⋮, the All notes, Pinned, Plan steps
  and Quotes tabs, Filter's Show, the
  notes table with its cog, bin and right-click menu, the open note's ⋮ and
  footer, Duplicate, Download video, moving notes between libraries, Trash,
  and the left menu link.
- [importing-a-note.md](importing-a-note.md): importing from New note, which links
  work, the `note-imports` worker, failures,
  Save to Note and the iPhone Shortcut, and what a deploy needs.
- [analysing-a-note.md](analysing-a-note.md): the Analyse button and its price,
  what the AI is asked for a video and for an X post, the Summary, Action plan,
  Quotes and Transcript cards, Add to note, transcript highlights, Analyse
  many, One plan from many, and the bell.
- [note-editor.md](note-editor.md): the note editor's blocks, the "/" menu,
  video times, links between notes, pictures, saving with the revision check
  and the offline copy, and History.
- [launch.md](launch.md): the live site on note.barelycompany.com. Where it
  runs, every live value, why the worker needs curl_cffi, how to deploy, and
  the release record.
- [Shell integration](shell-integration.md) — each shell merge into Note: what arrived, what stayed Note's own.
- [No success toasts](no-success-toasts.md): nothing pops up when something works, and errors and part-done work still say so.
