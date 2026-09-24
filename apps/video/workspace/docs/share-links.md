# Share links

A share link lets somebody with no account watch one finished export in their
browser. You make it on the Exports page, send it, and turn it off when you are
done.

**The link is the only thing standing between the file and anybody who has
it.** There is no password and no list of who may watch. If the link is
forwarded, the new person can watch too. If it is pasted somewhere public,
anyone can.

## What a link shows

- **The video itself.** It plays in the browser, and the viewer can save the
  file from the player's menu. Treat a shared export as handed over.
- **The export's own title**, under the video, in the browser tab, and in the
  preview a chat app draws when the link is pasted. An export with no title
  shows no words at all.
- **Nothing else.** No account name or email, no project name, no other
  exports, and no link back into the app. The page has no links on it at all.

## Making one

- **Where:** the Exports page, the link icon on a finished export's row. Rows
  still waiting, rendering or failed have no link icon, because there is no
  file to share.
- **How long it works:** until you turn it off, or for 1, 7 or 30 days. The
  choice is made when the link is made. To change it, turn the link off and
  make a new one, which gives a new address.
- **One link per export.** Making a new link turns the old one off in the same
  step, so only the newest address works.
- **Seeing which exports are shared:** a row with a working link says "Shared
  by link" under its title.

## Switching it off

- **Turn off link** in the same window. The next request for the page or the
  file is refused, including the next piece of a video that is already
  playing. The player then gives way to the "no longer available" notice.
- **An expiry** does the same thing on its own when the time passes. The window
  then says when the last link stopped working.
- **Deleting the export** deletes its links with it.
- **Deleting the account** that made a link deletes the link too.

Every dead link opens the same page: "This video is no longer available", with
a line asking the viewer to get a new link from whoever sent it. The page never
says which of the reasons it was, so a stranger trying addresses learns
nothing.

## Why it is built this way

- **The token is 64 characters from 32 random bytes.** Guessing one is not a
  real attack.
- **The token is stored as written, not scrambled.** That is what lets the
  Exports page show and copy the same link again later. The cost is that
  anybody who could read the database could read the links. Anybody who could
  read the database could already find every file, so this adds little.
- **The token sits after `?token=` rather than in the page's path.** The
  page-view counter keeps paths and drops everything after the `?`, so the
  traffic figures count every shared page as plain `/share` and never record
  a working link.
- **Nothing is cached.** The file is sent with `Cache-Control: no-store`, and
  the link is checked on every request, so turning it off works on the next
  request rather than when a cache runs out.
- **The page is not one of the site's public pages.** It is not in the
  sitemap, not on the Pages screen, and it tells search engines not to list
  it.

## Checking it locally

In local development the video on the shared page does not play. The dev
server answers any request a browser makes for a `<video>` with a 404, going by
the `Sec-Fetch-Dest: video` header. The same trap is already written up for
pictures and fonts, and its fix lives in `vite.config.ts`, which belongs to the
shell. The page, the notices and the link itself all work locally. A built
deployment does not have that dev-only step.

## Where it lives

- `drizzle/0085_video_export_shares.sql` and `videoExportShares` in
  `src/server/video/schema.ts`: the table.
- `src/server/video/export-shares.ts`: making, reading and turning off a link,
  and `findSharedExport`, the one check every public request goes through.
- `src/lib/api/video/export-shares.ts`: the endpoints. `readSharedExportFn` is
  the one with no session behind it, listed with its reason in
  `src/app/open-endpoints.ts`.
- `src/routes/share.tsx`: the page. `src/routes/api/v1/video/share/$token/file.ts`:
  the file.
- `src/components/video-editor/export-share-dialog.tsx`: the Share window.
