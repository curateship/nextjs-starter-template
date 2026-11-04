# Sending files from your phone

The Media panel's + menu has "From your phone". It shows a QR code. Point the
phone's camera at it, and a page opens with one button, "Pick videos and
photos", that opens the camera roll. Each file lands in the project's Media
panel as it finishes. Tyler picked camera roll only on 4 Nov 2026, so the page
never asks for the camera.

## How long it works

- **The code:** 15 minutes to be scanned, and it opens once. A second phone,
  or the same address opened again, is told the code was already used.
- **The phone that opened it:** two hours of sending files into that one
  project, and nothing else. It is signed in by a cookie of its own, not by
  the owner's account, and it can't see or change anything.
- **After that:** the phone's page says its time is up and to scan a new code.
- **Stopping it early:** while a phone is sending, the editor's window has
  "Stop this phone", which ends the code and the phone's sign-in at once,
  for a code somebody else may have photographed.
- **A suspended account:** its phone stops sending at once.

## Keeping the secret secret

The code's address is `/phone#<secret>`. Everything after `#` stays in the
phone's browser and never reaches a server log or another site. The page sends
it once, then takes it out of the address straight away, so a reload or a
screenshot holds nothing. Only hashes of the code's secret and of the phone's
sign-in are kept (`video_phone_links`, migration 0150). Rows past both their
times are deleted whenever a new code is made.

A guest sent from Project has no "From your phone", because the files go into
the owner's own media library, which a guest can't reach.

## What the phone sends

- **Pictures** go in one request, checked and stored like any upload
  (`storeProjectFile` in `src/server/video/project-uploads.ts`, which the Project
  guest's upload uses too).
- **Videos** go in pieces straight to storage, the shell's big-upload path
  (`docs/shell/big-uploads.md`), started, signed and finished in the owner's
  own folder. A video of any size the app allows can be sent.
- Files go one at a time; a video already sends four pieces at once.
- Each file counts against the owner's upload limit of 60 every 10 minutes.

## How the editor hears about it

While the "From your phone" window is open it asks every 3 seconds how the code
stands: waiting to be scanned, open on a phone, or run out. When the count of
files that arrived goes up, the Media panel fetches its list again, so a file
sent from the phone shows without a reload. Closed, the window stops asking;
files that finish after that show the next time the Media panel loads.

## Trying it locally

The phone has to reach the address in the code. On the local dev server that
address is `localhost`, which a phone can't open. To try it on a real phone,
open the editor at the computer's network address instead (for example
`http://192.168.1.20:3016`), so the code carries that address, or try it on the
live site.

## Where it lives

- `src/server/video/phone-uploads.ts`: making, opening and reading links.
- `src/server/video/phone-guards.ts`: the phone's own door checks.
- `src/lib/api/video/phone-uploads.ts`: the server calls and `sendPhoneFile`.
- `src/routes/phone.tsx`: the phone's page.
- `src/components/video-editor/phone-upload-dialog.tsx`: the window with the
  code, and `qr-code.tsx`, a copy of Directory's QR code.
- Tests: `src/server/video/phone-uploads.test.ts`.
