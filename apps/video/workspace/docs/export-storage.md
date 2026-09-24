# Export storage

The Exports page says how much space your finished exports take, and lets you
delete every export older than a date you pick. Deleting an export, by hand or
by clearing out, removes its file and its cover from storage, not just its line
in the list.

## The total

- **Where it is:** a line under the Exports heading, such as "46 finished
  exports take 5.86 GB of storage." It is hidden when you have no finished
  exports.
- **What it counts:** every finished export of yours, whatever the search box
  says and however many pages the list has. Failed exports and ones still being
  made have no file, so they are left out. That is why the number beside the
  heading, which counts every row, can be bigger.
- **Where the number comes from:** the size each export's file had when it was
  made, stored on `video_render_jobs.file_size` and added up by
  `loadExportStorage` in `src/server/video/exports.ts`. It equals the Size
  column added up.
- **What it leaves out:** covers. Their size is never recorded, and each is a
  few dozen kilobytes beside a video of many megabytes.

## What a delete removes

- **Deleting an export:** removes the video file, then the cover, then the
  row. The export's share link goes with the row, so the link stops working on
  its next request.
- **Deleting a project:** removes the file and cover of every export made from
  it, then the project. The project's delete window says its exports go too.
  Before 24 Sep 2026 a project delete left its export files in storage with
  nothing pointing at them. Any file left that way is still there.
- **What is never removed:** pictures saved from an export with Save as a
  picture. Each one is a separate copy in your media library and stays until
  you delete it there.
- **When storage refuses:** an export whose file will not come out of storage
  keeps its row, and the page says how many were kept. Deleting it again later
  finishes the job. The rule is that a row with no file can always be deleted
  again, while a file with no row can never be found again.
- **What still leaves files behind:** deleting a whole account. That belongs to
  the shell, which removes the account's rows and none of its stored files, so
  its exports stay in storage.

## Clearing out

- **Where it is:** the Clear out old button beside the search box.
- **What it picks:** finished exports whose Made date is before the date you
  choose: a month, 3 months, 6 months or a year ago. Six months is where it
  starts. Failed exports and ones still being made are never picked.
- **What the window says before anything goes:** how many exports will be
  deleted, the date they were finished before, and how much space that frees.
  "2 exports finished before Mar 24, 2026 go for good, file and cover, which
  frees 800 KB."
- **Who counts:** the server, across all your exports. The list on the page
  only ever holds the first hundred, so it cannot do the sum.
- **What is deleted:** exactly what was counted. The window sends back the date
  the count was made against, so an export that turns six months old while
  the window is open is not swept up with the rest.

## What protects an export from a clear-out

- **A live share link.** An old export that somebody can open by link right now
  is counted apart and kept. The window says how many there are, for example
  "1 more with a live share link is kept."
- **Taking them too:** a box under the date says "Also delete the 1 with a live
  share link", with its size. Ticking it adds them to the count and the space,
  and the window then says how many links will stop working.
- **What counts as live:** a link that is not turned off and not past its
  expiry. An expired or turned-off link protects nothing.
- **A link made while the window is open** still protects its export. The
  server reads the links again at the moment of the delete.
- **Deleting one by hand:** a shared export can always be deleted from its own
  row. That window says "Its share link stops working too", and when several
  are selected it says how many of them are shared.

## Checking nothing is left in storage

The media library's orphan scan does not look at export files. It only reads
files stored under a person's id, and export files are stored under
`video/exports/` and `video/export-covers/`, so a leftover export file never
shows up there. To check a delete, ask the bucket for the two keys the row
held, `storage_path` and `thumbnail_storage_path`. Both should come back as
not found.
