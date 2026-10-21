# Guests sent from Project

A Project task can point at one Promo project. The person on the task presses
**Open in Promo** in Project and lands on that project's dashboard here,
signed in, without a Promo account. They never type a password in Promo. The
whole design, and Project's side of it, is in Project's
`workspace/docs/connected-apps.md`. This file covers what Promo does.

## Tyler's rules

Tyler designed this on 15 Oct 2026 and answered the open questions on
19 Oct 2026.

- **One way only.** People sign in to Project and nowhere else: "Employee
  would need to signin from project." Promo never sends anyone to Project.
- **"It is important that the link cannot be shared."** A note works once.
- **The sign-in lasts 12 hours.**
- **The record is a Promo project.** One per task.
- **The guest works the project.** They search posts, change the keywords and
  the description, and write and send comments and posts with the project's
  own accounts.
- **The guest never runs the project.** No deleting or pausing it, no adding
  or taking off networks, no renaming it, no new picture, and no adding,
  moving or taking out accounts.
- **Promo's AI is off for guests**, because it spends Tyler's credits.

## How a guest gets in

1. Project sends the browser to `/handoff/project?note=…`. The note names the
   Project person (id, name, email), the Promo project, a one-time id, and a
   time 60 seconds away. Project stamped it with the key the two apps share
   (an HMAC signature).
2. Promo checks the stamp against `PROJECT_HANDOFF_KEY`, the 60 seconds, and
   that the note is meant for Promo. One changed character and the stamp no
   longer matches.
3. In one database write, Promo saves the one-time id in
   `promo_handoff_notes` and makes the guest's sign-in in
   `promo_project_guests`. The saved id refuses the same note a second time,
   even from two tabs at once.
4. The browser gets a cookie, `promo_project_guest`, and goes to
   `/guest/promo/<project id>` with the note gone from the address bar. Only
   the cookie token's SHA-256 is kept. One browser holds up to five projects
   at once, the newest kept.
5. After 12 hours the sign-in ends and the person presses the button in
   Project again.

The guest is not an account and never appears on Admin → Users. A signed-in
admin who opens a guest address sees the dashboard as an admin.

## What a refused note says

The handoff address sends a refused note to `/guest/refused`, which says:

- **Used:** "This link has already been used. Open the task in Project again."
  This is what a copied address gets.
- **Expired:** "This link has expired. Open the task in Project again."
- **Changed or not from Project:** "This link was changed or did not come from
  Project. Open the task in Project again."
- **Project deleted:** "The Promo project this task points at was deleted. Ask
  whoever made the task to point it at another one."
- **No key on this server:** "Promo is not set up to take people from Project
  yet. Ask the site admin to add the key Promo shares with Project."

A guest page opened after the 12 hours, or for another project, says "You are
not signed in to this project" and asks them to open the task in Project
again.

## What a guest can and can't do

The guest page is the admin's project dashboard in a frame of its own: the
project's name, "Working as Sam via Project", and a Saving… sign. There is no
left menu and no way to another project. Hidden for a guest, and refused by
the server whatever the screen shows:

| A guest can | A guest can't |
| --- | --- |
| Read and search the project's posts, skip them, read their replies and rules | See another project, or the owner's comments from other projects beside the box |
| Add, switch, run and delete the project's keywords | Use Ideas, Write with AI, Check, the rewrite buttons, or Write again on an inbox answer |
| Change the description in the cog | Rename the project, change its picture, pause, resume or delete it, or make a new one |
| Send comments, replies and posts from the project's own accounts, and undo one in its 10 seconds | Add, move or take out an account, or open Manage accounts |
| Edit a sent comment's words | Delete a sent comment from Reddit, or switch a comment's Voice example |
| See the Comments, Failed and Posts tabs, cut to the project, and Try again | Open the Jobs window, which lists every project's work |
| Answer and skip Instagram and TikTok comments | Post a picture or a video, or call one off. Both need the owner's media library |
| Look for self-promotion threads | Block a subreddit, which hides it from every project |

**Who sent it.** A comment, reply or post a guest sends carries "Sam via
Project" in `sent_by` on its row, carried there through the job's payload. The
owner sees it under the account on the Comments and Posts tabs.

## How the server keeps a guest inside one project

Every endpoint the guest page calls uses `editorGet` or `editorPost`
(`src/server/social/editor-guards.ts`), which let in a signed-in person or a
browser holding a guest sign-in. The handler then asks who the call acts as:

- **A record's project first.** `actorFor` takes a project id. The record
  helpers look up the project of a keyword, post, sent comment, inbox row or
  job before anything else, so a guest can't reach another project's records
  by guessing an id.
- **The guest acts as the project's owner** only when the browser holds a
  guest sign-in for that same project. Every owner check underneath then
  works unchanged.
- **Anyone else must be a signed-in admin**, exactly as the admin-only guard
  asked before. A member is refused.
- **Lists that span every project** (comments, failures, posts) are cut to the
  guest's project. The owner's accounts in no project, and other projects'
  keywords being searched, are taken out of the dashboard.

Everything a guest may never do stays on the shell's `adminGet`/`adminPost`,
which a guest never passes because a guest has no session.
`src/server/social/project-guests.test.ts` reads the endpoint files and fails
if one of those is moved to the guest door. Each guest endpoint is listed in
`src/app/open-endpoints.ts` with the check it relies on, as the guard test
requires.

The queue's counts on the dashboard stay the owner's whole queue, because the
dashboard asks again while they are above zero. They are numbers only.

## Server setting

`PROJECT_HANDOFF_KEY`: the key Promo shares with Project, the same value as
Project's `CONNECTED_PROMO_KEY`. A long random string, such as the output of
`openssl rand -hex 32`. With it empty, every note is refused. It lives in the
server settings only, never in the database or the page.

## Where the code is

- `src/server/social/project-handoff.ts`: checking a note, the guest
  sign-in, the cookie and the handoff answer.
- `src/server/social/editor-guards.ts`: `editorGet` and `editorPost`, in a
  file of their own like the shell's `guards.ts`. A server call's middleware
  goes to the browser with it, and only its `.server()` part is left out.
  While they sat in `project-guests.ts` they took that file's database and
  sign-in code (argon2) into the browser, and no Promo page responded to a
  click (fixed 21 Oct 2026). Keep anything else out of this file.
- `src/server/social/project-guests.ts`: who a call acts as, and the guest's
  limits.
- `src/routes/handoff/project.ts`: the handoff address.
- `src/routes/guest/promo.$projectId.tsx` and `src/routes/guest/refused.tsx`:
  the guest page and the refusal page.
- `src/components/social/guest/`: guest mode (`usePromoGuest`), and the rows
  per page and Saving… sign the dashboard reads outside the shell's layout.
- `drizzle/0123_promo_project_guests.sql`: the two tables and the `sent_by`
  columns.
