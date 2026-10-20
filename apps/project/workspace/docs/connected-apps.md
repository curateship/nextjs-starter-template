# Opening a record in another app

A task can point at one video project in Video or one project in Promo. The
person on the task presses **Edit video** (or **Open in Promo**) and lands in
that app, signed in, on that one record. They have no account in Video or
Promo and never type a password there. Tyler designed this on 15 Oct 2026 and
answered the open questions on 19 Oct 2026; his answers are in
[What this app is](what-this-app-is.md#choices-for-opening-a-tasks-record-in-video-or-promo),
which wins wherever this file disagrees.

It runs one way. People sign in to Project and nowhere else: "Employee would
need to signin from project." Video and Promo never send anyone into Project
and never hand off to each other. CMS is left out for now.

## On the task

- **The site admin pastes the address.** It goes in the task's cog, Details
  tab, in the **Video or Promo** card: the address from the browser while the
  video is open in Video's editor (it ends in the video project's id), or while
  the project is open in Promo. It saves when the box is left. An empty box
  takes the record off. Nobody else sees the card.
- **Project reads the app and the record from the address.** It matches the
  address against the app addresses in Project's server settings (below).
  Anything else is refused in words, including another page of the same app.
- **One record per task.**
- **The task shows a button, never the address.** It sits under the tags in
  the task's right panel, and above the Task card in the task's window. The
  person assigned and the site admin see the button. Anyone else on the task
  reads "This task points at a video project. Only the person assigned and
  the site admin can open it."
- **An app that isn't connected on this server** shows the person a line
  saying so instead of a button.

## Pressing the button

1. Project's server checks the person is signed in, can see the task, and is
   the person assigned or the site admin. Anyone else gets a refusal and no
   note is made. While the site admin is viewing the app as someone else, it
   refuses too, so the record never opens under the wrong name.
2. Project writes a note: the person's Project id, name and email, which app,
   which record, a random one-time id, and the moment it stops working, 60
   seconds away. It stamps the note with the key it shares with that app (an
   HMAC signature: change one character of the note and the stamp no longer
   matches).
3. The browser opens a new tab at the app's handoff address,
   `/handoff/project?note=…`. Project makes no call to the other app.
4. The other app checks the stamp, the 60 seconds and the one-time id, then
   signs in a guest for that one record for 12 hours. After 12 hours the
   person presses the button again.

A copied address works for nobody: the one-time id is used by then, and the
other app answers "This link has already been used. Open the task in Project
again." What a link can't stop is an employee handing over their Project
password. Taking them off the task, or out of Project, stops their next
press.

## Server settings

Each pair of apps shares one key. Project holds an address and a key for each
app; the other app holds the same key.

| Project | The other app |
| --- | --- |
| `CONNECTED_VIDEO_URL` (Video's address, such as `https://video.barelycompany.com`) and `CONNECTED_VIDEO_KEY` | Video's `PROJECT_HANDOFF_KEY` |
| `CONNECTED_PROMO_URL` and `CONNECTED_PROMO_KEY` | Promo's `PROJECT_HANDOFF_KEY` |

A key is a long random string, such as the output of `openssl rand -hex 32`.
An app with either setting empty isn't connected, and its button shows the
"isn't connected" line. The keys live in the server settings only, never in
the database or the page.

## Where the code is

- `src/server/project/linked-records.ts`: reading the address, who may press,
  and the stamped note.
- `src/lib/api/project/linked-records.ts`: the two server functions.
- `src/components/project/task-link.tsx`: the button and the paste box.
- `drizzle/0124_project_task_linked_record.sql`: the task's three columns
  (`linked_app`, `linked_record_id`, `linked_address`).
