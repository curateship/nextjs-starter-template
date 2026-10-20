# Guests sent from Project

Somebody on a Project task can edit one video project here without a Video
account. They press **Edit video** on the task in Project and land in this
app's editor for that one project, signed in for 12 hours. Tyler designed it
on 15 Oct 2026 and answered the open questions on 19 Oct 2026. Project's side
is `apps/project/workspace/docs/connected-apps.md`.

## Tyler's rules

- **One way only.** "Employee would need to signin from project." People sign
  in to Project and nowhere else. Video never sends anyone into Project.
- **"It is important that the link cannot be shared."** A link works once,
  within a minute of the press.
- **The sign-in lasts 12 hours.** After that the person presses the button on
  the task again.
- **No copied accounts, no single sign-on, no plain edit link.** All three
  were talked through and turned down. A guest is not an account and never
  shows in the user list.
- **A guest edits the timeline, uploads media into that project and exports.**
  AI is off for guests until Tyler says otherwise. Deleting the project is
  never allowed.

## How a guest gets in

1. Project checks the person and stamps a note: their Project id, name and
   email, the video project's id, a random one-time id, and an expiry 60
   seconds away. The stamp is an HMAC of the note with `PROJECT_HANDOFF_KEY`,
   the key the two apps share.
2. The browser opens `/handoff/project?note=…` here.
3. Video refuses the note if the stamp doesn't match, the minute has passed,
   or the one-time id is already used. Otherwise it saves the one-time id and
   signs in the guest in one database write, so two tabs racing with one note
   can't both get in.
4. The guest's browser gets a cookie (`video_project_guest`, 12 hours) and
   goes to `/guest/video-editor/<project id>`. The address with the note is
   gone from the bar by then.

A refused note goes to `/guest/ended`, which says why in words:

| Why | What it says |
| --- | --- |
| Already used | "This link has already been used. Open the task in Project again." |
| Over a minute old | "This link has expired. A link from Project works for one minute. Open the task in Project again." |
| Stamp doesn't match | "This link doesn't work. It wasn't made by Project, or it was changed on the way." |
| Project deleted | "This video project no longer exists. It was deleted in Video." |
| No key on this server | "Opening videos from Project isn't set up yet." |

When the 12 hours are up, the next save stops the editor and says "Your time
in this video has ended. Open the task in Project again."

## What a guest can and can't do

The guest editor is the same editor, outside `/admin` and outside the
signed-in layout, so there is no left menu and no other page to reach.

- **Can:** edit the timeline and its shape, upload files into the project,
  use the project's own media, add text, export, watch an export, stop or
  retry one, rename an export and set its cover, download it, keep a frame,
  and look at and restore History.
- **Can't:** use any AI (the AI tools, AI clip, Transcript and Voices panels
  are gone), open Music (the owner's music shelf), Copy, stickers, the media
  library or collections, rename the project, delete a file or an export, make
  a share link, change project settings, or see AI spending.
- **One browser can hold up to five guest sign-ins**, one per project, so two
  tasks can be open at once.

## How the server keeps a guest to one project

The editor's server calls a guest can use go through `editorGet` and
`editorPost` (`src/server/video/editor-guards.ts`) instead of the shell's
`userGet` and `userPost`. They let in a signed-in person or a browser holding
a guest sign-in. The handler then asks `actorFor` who to act as:

- **A guest sign-in for that project** acts as the project's owner, which is
  what every existing owner check expects.
- **Otherwise the signed-in person** acts as themselves, exactly as before.
- **Anyone else** is told the project isn't there.

Calls that name an export or a file find its project first
(`actorForExport`, `actorForMedia`). A file counts as the project's when it is
on the project's shelf or a clip on its timeline uses it. Every call a guest
must not make stays on the shell's guards, which a guest never passes because
a guest has no session. Each switched call is listed in
`src/app/open-endpoints.ts` with the check that guards it.

The filmstrip, waveform, export file and export cover addresses answer a guest
for their own project's files through `mediaViewerId` and `exportViewerId`.

A guest's upload goes through `uploadProjectMedia`
(`src/lib/api/video/project-guests.ts`): the same checks as the shell's
upload, stored in the project owner's library and put on the project's shelf
at once.

## Who changed it

A guest's saves mark the project with "Sam via Project" (`last_edited_by`),
and a version kept from that timeline carries it (`edited_by`). The History
panel shows it on the row. See [Project history](project-history.md).

## Server settings

`PROJECT_HANDOFF_KEY` holds the key Project calls `CONNECTED_VIDEO_KEY`. Both
must be the same long random string, such as the output of
`openssl rand -hex 32`. With it empty, every note is refused with "Opening
videos from Project isn't set up yet." It lives in the server settings only,
never in the database or the page.

## Where the code is

- `src/server/video/project-handoff.ts`: checking the note, the one-time ids,
  the guest sign-in and its cookie.
- `src/server/video/editor-guards.ts`: `editorGet` and `editorPost`, in a
  file of their own like the shell's `guards.ts`. A server call's middleware
  goes to the browser with it, and only its `.server()` part is left out.
  While they sat in `project-guests.ts` they took that file's database and
  sign-in code into the browser, and the editor page never started (fixed 20
  Oct 2026).
- `src/server/video/project-guests.ts`: who the caller is, and the
  `actorFor` checks.
- `src/routes/handoff.project.ts`: the address Project sends people to.
- `src/routes/guest.video-editor.$projectId.tsx` and `src/routes/guest.ended.tsx`:
  the guest editor and the refusal page.
- `src/components/video-editor/project-guest.tsx`: how the editor's pieces
  know a guest is using them.
- `drizzle/0127_video_project_guests.sql`: `video_handoff_notes`,
  `video_project_guests`, and the two history columns.
