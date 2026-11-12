# The Archive

The Archive keeps each project's videos, carousels and pictures in one place.
Things arrive from the Video app's Send to Promo, or are uploaded from the media
library. Promo's post writers can post straight from it. The task it came from is
Video's `workspace/tasks/promo/01-send-to-promo-and-archive.md`.

## Tyler's rules

These came from Tyler on 4 Nov 2026, in his words. They outrank the code.

- **Own copy.** Promo keeps its own copy of every file sent from Video, so deleting
  the export in Video never breaks the archive.
- **"Set in the connection card."** Video's Settings → Promo holds Promo's address
  and the key. The key is made here and belongs to one Promo admin, and things sent
  with it land in that admin's projects.
- **"On a Write captions button."** Captions are written only when the button is
  pressed, never when something arrives.
- **"One press, all go now."** Posting from several accounts sends them all at once,
  and nothing is booked for later.
- **"Watch and post only."** A guest from Project can play and post archive items,
  and has no Download.
- **One cohesive 3 panel design.** Since 12 Nov 2026 the Archive is a section of
  the [Projects dashboard](projects-dashboard.md), not a screen under Projects in
  the left menu (Tyler: "We need to consolidate projects, voices, accounts,
  archive and messages into one cohesive 3 panel design"). The Projects block on
  that dashboard's left page picks the project, in place of the Archive's own
  list of projects of 4 Nov 2026.
- **"Size and dollars a month".** Each project shows its storage that way, for
  example "12.4 GB, about $0.19 a month".

## Where it is

- **The Archive section** of the Projects dashboard,
  `/admin/projects?section=archive`.
  - **Left:** the dashboard's own page; its Projects block picks the project,
    each row with its item count. With no project picked, every project's items
    show, each row naming its project.
  - **Middle:** the items as a table.
  - **Right:** the open item.
  - **The address** holds the project, the open item, the tab and the filters
    (`?section=archive&project=<id>&open=<id>&kind=video&posted=no&sort=views&group=source`).
    The old `/admin/archive` address, which bell notices and Video's Open in
    Promo use, opens the section with the same project, item and filters.
  - **Storage:** Overview's Archive room widget shows each project's items and
    the room they take with what that costs, "12.4 GB, about $0.19 a month",
    as Tyler's rule says.
- **Inside a project.** A project's own page has an Archive row under Networks,
  in a section called Content. Picking it shows its own middle and right panels
  for that project alone (`?archive=1`). Guests from Project reach the archive
  this way.

## The middle panel

- **Tabs:** All, Videos, Carousels, Pictures and Bin with its count (a dropdown
  when the middle is narrow).
- **The header, left to right:** the search, Select, Filter, Views, Add, and a
  ⋮ with Download everything as a zip while a project is picked.
  - **Search** looks in titles, captions and descriptions.
  - **Filter** has three choices: Posted (Not posted yet), Sort (Most viewed) and
    Group (By Video project).
  - **Views** are saved per project, so they show while a project is picked. A
    project's own page leaves them out.
  - **Add** is a menu. Upload or pick files opens the media library. **Ask
    Video for a video** sends a brief to a Video project you pick (part 42).
    Video makes a draft video there, with the brief as its notes and its first
    line as the name, and rings its bell. Nothing is written by AI. With no
    project picked, each action is listed once per project, so nothing lands
    in a project nobody chose.
- **The rows** show each item's cover, name, kind, project (with none picked),
  how many times it was posted and its length or size. They are newest first,
  with pinned items on top whatever the sort, until a column is sorted.
  - **Most viewed** adds up the views Promo reads once a day for each post made from
    an item. Items never posted go last.
  - **Grouping** puts uploads under "Uploaded".
  - **An item still copying from Video** shows "Arriving" and the list asks again
    every 4 seconds.
  - **A newer version on its way** is not shown as a second row. It lands on the
    item it replaces.
- **Select** ticks rows for Move to the Bin, or Put back in the Bin. A row's
  right-click menu has the same.
- **Every project at once** is read by `loadEveryArchiveItem`
  (`src/lib/api/archive/items.ts`), admin only, through the same
  `listArchiveItems` with no project; a guest's reads always name their
  project.

## The right panel

- **Header:** the item's kind icon, its name and its ⋮.
- **Body:**
  - the video played, the carousel swiped a slide at a time, or the picture shown;
  - its shape, length, size, language and where it came from;
  - Edit in Video, which opens the video in Video's editor, and Download and PDF
    for an admin;
  - the caption Video sent;
  - **Captions**, one box per network with Write captions;
  - **Posted**, which lists every post made from the item and the drafts waiting
    for it.
- **The ⋮** holds folding rows for Name, Description and Project (Copy or Move),
  then Pin to the top, then Delete in red. In the Bin it holds Put back and Delete
  for good.
  - **Delete** goes to the Bin, where Put back returns it, so it doesn't ask
    first.
  - **Delete for good** asks first, because it can't be undone.

## How a send from Video arrives

The code is `src/server/archive/arrivals.ts`. The addresses Video calls are under
`src/routes/api/connect/video/`.

1. **The note.** Video posts a note naming the files by address, the project, the
   words and the drafts to leave. Promo makes the item at once as "copying", answers,
   and starts the copy.
2. **The copy.** Promo fetches each file from Video and keeps its own copy under
   `promo/archive/<person>/<item>/`.
   - It holds at most 16MB at a time, so a 5GB video never sits in memory.
   - A file that arrives a different size than Video said fails the copy.
3. **When every file is in**, the item is ready, the bell rings ("Arrived in the
   archive: …"), and Video is told, so its Exports row says Sent to Promo.
4. **When any file fails**, everything copied so far is deleted along with the item,
   and Video is told why. Video's Try again then starts clean.
5. **A newer version** (Replace in Video's window) arrives as a hidden stand-in. When
   it lands, its files, words and subtitles move onto the old item and the old files
   are deleted. The drafts and posted marks stay.
6. **The upkeep pass** (`promo-archive` in `src/app/server-options.ts`) starts a copy
   whose start was lost and fails one past three hours. It also deletes items 30
   days in a Bin.

On the live server the Video address must be https. Plain http is only for
the two apps on one computer.

Promo fetches files only from the Video address that pressed Test with the key. A
key holder can't point Promo at any other server.

## The key

- **Settings → Video** (`src/components/archive/video-link-settings.tsx`) makes the
  key and shows it with Copy.
- **Make a new key** asks first. The old key stops working at once.
- **What Promo keeps:** the key's hash, to find who is calling, and the key
  scrambled, so Copy can show it again and so Promo can call Video back.
- **How calls are checked:** every call either way carries the key as
  `Authorization: Bearer <key>`.
- **Limits:** a key may send or Test 600 times an hour. Asking how a send is doing
  has its own limit of 6,000 an hour, so watching a long copy never blocks a send.
- **The messages between the apps** are listed in the task file, under "The
  messages between the two apps".

## Posting from the Archive

- **From archive.** The Instagram, TikTok, LinkedIn and X post writers have a From
  archive button (`src/components/archive/archive-picker.tsx`).
  - X lists pictures only.
  - A pick fills the file, its caption for that network (or the caption from Video)
    and any warnings.
- **Archive files count as the person's own.** Every network checks that a file is
  this person's own, and an archive file passes that check
  (`src/server/archive/files.ts`).
- **Drafts.** Networks ticked in Video's send window leave a draft. The post writer
  shows "A draft from the archive is waiting" with Use it. The draft is used once a
  post from that item goes out on that network.
- **Warnings** (`src/lib/archive/fit.ts`) say when a wide video goes to TikTok or
  Instagram, or a video is longer or bigger than the network takes. They never block
  a post. The sources found on 4 Nov 2026 disagreed, so the limits are cautious and
  need checking against the networks' own help pages:
  - Instagram: 15 minutes, 4 GB;
  - TikTok: 10 minutes, 4 GB;
  - LinkedIn: 15 minutes, 5 GB.
- **Also post from.** The Instagram and TikTok post writer lists the project's other
  accounts on that network. One press posts from each ticked account at once, each
  on its own phone. Each one is checked on its own, so one refusal never stops the
  rest.
- **Posted marks.** A post made from an archive file remembers its item. When it goes
  out, the item's Posted list shows it and Video is told, so the video or carousel
  there turns Posted.
- **Write captions** writes one caption per network. It uses the voice of the
  project's first account on that network, within that network's limits. A network
  with no account in the project is skipped.

## Posting from the Archive on LinkedIn and as carousels

- **LinkedIn's post writer** has From archive beside its With it menu. A video
  fills the video, a picture fills the picture, and the item's caption fills the
  words when the box is empty. The pick's warnings show under the menu.
- **A carousel goes to LinkedIn as a document post.** Its PDF, the one Video sends
  when "Also as a PDF for LinkedIn" is ticked, goes up with a title, which starts as
  the item's title. LinkedIn shows the pages one at a time in the feed.
  - A carousel sent without its PDF says "This carousel came without its PDF. Send
    it again from Video with Also as a PDF for LinkedIn ticked." and changes nothing.
  - A document must be an archive carousel's PDF. Any other file is refused when the
    draft is saved.
- **A LinkedIn post carries one thing:** a picture, a video, a poll or a document.
- **A video's subtitles go with it.** A video sent from Video with a transcript has
  an .srt file on its item. Saving a LinkedIn draft with that video copies the
  subtitles onto the draft, so a later change in the Archive never changes a post
  already checked. The browser adds the file in LinkedIn's video settings, and
  viewers can switch captions on.
- **Documents and subtitles need a browser account.** The LinkedIn app on a phone
  can't post a document, so Post refuses it for a phone account. An account that
  moved to a phone after Post was pressed is refused again when the job runs,
  before anything reaches LinkedIn.
- **A carousel goes to Instagram and TikTok as one post** of all its pictures in
  order, from the phones. See
  [posting a photo or video](instagram/posting.md#a-carousel-of-pictures).
- **Not proven yet (4 Nov 2026).** The LinkedIn document steps, the subtitles
  steps and the phones' carousel steps were written from how the pages and apps are
  known to look. None has run against the real LinkedIn or a real phone. Each one
  that does not find its button stops with a sentence saying which step, and
  nothing is sent.

## Guests from Project

- **What a guest can do:** see their one project's archive, play items, edit
  captions and post archive files from that project's accounts.
- **What a guest can't do:** Download, the Bin, uploads, Copy, Move, Pin, Delete or
  Views. The server refuses those calls whatever the screen shows.
- **The rules for each call** are in `appGuardedDeeper` in `src/app/open-endpoints.ts`.

## Deleting a project

A project that still holds archive items, the Bin's included, can't be deleted.
The refusal says to move or delete them first, so a project's files are never
lost with it.

## Uploads

- **Where the file lives.** An uploaded file stays the media library's. The item
  points at it, and deleting the item for good leaves the file in the media library.
- **What counts.** Sound files are refused.
