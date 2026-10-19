# Saving a post

A post from X gets in three ways: pasted into the box at the top of `/posts`,
sent by the Save from x.com bookmark button, or opened as
`/posts?save=<link>`. Each one only writes a row and returns. The
`note-posts` worker reads X a few seconds later, so closing the browser never
stops a save.

## Tyler's rules, 19 Oct 2026

- A post lives on its own Posts screen, not inside Notes. ("Its own Posts
  screen")
- The Save button on x.com is a bookmark button dragged to the browser bar
  once, not an extension. ("Bookmark button")
- A post with a video: the video downloads on paste, and it belongs to the
  post. It does not show up in Videos. ("Analyse covers both")
- When the rest of a thread can't be read, the first post saves and the card
  says "Couldn't read the rest of the thread". ("Save first post, say so")
- A linked article is fetched only when "Bring in the article" is pressed.
  ("Only when I press a button")

## Which links work

`parsePostLink` in `src/lib/note/posts/links.ts` decides, and its tests list
every case.

- **Accepted:** `x.com/<handle>/status/<number>`, the same on `twitter.com`,
  `mobile.twitter.com` and `www.`, plus `x.com/i/web/status/<number>` and
  `x.com/i/status/<number>`. Junk on the end (`?s=20`, `/photo/1`) is ignored,
  and a link pasted without `https://` still works.
- **Refused with "That is not a link to an X post":** any other site, a
  profile, a link with a password in it, and a handle longer than X allows.
- **The same post twice is one post.** The number is read off the link, so the
  database's unique index (owner, post number) catches a second paste at once.
  The screen says "That post is already saved" and opens it.
- **One person may save sixty posts in ten minutes**, the allowance Videos
  uses.

## Where the words come from

The worker reads X's own post page, the one a signed-out browser gets
(`src/server/note/posts/reader.ts` fetches it, `x-page.ts` reads it).

- **Why not the embed feed:** the task first planned to use X's public embed
  feed, the one websites use to show a post. On 19 Oct 2026 it was checked on
  five real posts: it cuts a long post off at about 280 characters and has no
  thread. A 4,042-character post came back as its first 280 or so.
- **Why the post page works:** X builds that page on its own server and leaves
  the data it built it from inside the HTML. That data has the full long text,
  the author, the date, the like and repost counts, the pictures, the video,
  the quoted post, and the replies. A signed-out page lists the author's own
  follow-on posts first, so a thread comes with it. Naval's 40-post "How to Get
  Rich" thread came back whole.
- **Why not X's paid API:** it charges per post read. Tyler turned it down for
  Trade on 29 Sep 2026.
- **It will break one day.** The post page is X's markup, and X changes it.
  Every field is read defensively, so a missing picture never loses the words.
  A page with no post in it fails with "X's page did not have the post in it.
  X may have changed its page."
- **The server only ever asks X.** The address is built from the post's number
  (`x.com/i/status/<number>`), never from what was pasted, and an answer that
  redirected anywhere but x.com is refused.

## What is kept

- **The words**, with X's short `t.co` links opened back into the real
  addresses. A long post keeps all of it.
- **The author's name, handle and picture**, the date it was posted, and the
  likes and reposts when it was saved ("1,200 likes and 30 reposts when
  saved"). The counts are never refreshed.
- **The pictures**, copied into the storage bucket at
  `note-posts/<owner>/<post>/`, so a post deleted on X still shows them. At most
  24 pictures per post across the post, its quote and its thread. A picture
  that will not download is left out, and the post still saves.
- **The quoted post**, with its author, words, date and pictures. Its link is
  taken out of the post's own words, because the quote shows under them.
- **The thread**: the author's follow-on posts, in order, up to 60. The thread
  stops at the first reply by anybody else. When X marks the thread as cut
  short, or the page had no replies at all and the post says it is a thread
  ("🧵", "1/", "a thread"), the card says "Couldn't read the rest of the
  thread".
- **The article link**: the first link in the post to a page off X. Only the
  link is kept on save.

## The video

- **The video downloads straight after the words**, under the same lease. The
  card says "Saving the video…" meanwhile, and the words can already be read.
- **The file** is the sharpest mp4 X offers at 720p or under, fetched with the
  same yt-dlp downloader Videos uses, into the person's media library. The
  30-minute and 500MB limits hold.
- **A video over 30 minutes is not downloaded.** The post says "The video is
  longer than 30 minutes, so only the words are kept."
- **A failed download keeps the words.** The post says why, rings the bell
  ("The video couldn't be saved: @naval"), and offers "Try the video again".
  The post can still be analysed without the video.

## Bring in the article

- **Pressed, never automatic.** The button sits on a post that links off X and
  says "Links to blog.example".
- **The same guard video links get**, from `src/server/note/links.ts`: https
  only (a post's plain `http://` link is asked for over https), a public name, and every address the name answers with a public one.
  Video sites (YouTube, TikTok, Instagram) are refused, because they are not
  articles.
- **Redirects are checked one at a time.** The server follows up to five, and
  checks each new address before it opens it. This closes, for articles, the
  redirect gap `saving-a-video.md` describes for yt-dlp. One gap stays: the
  name is looked up once for the check and again by the fetch, so a site that
  changes its answer in between could still slip through.
- **What is kept:** the readable words of the page (its `<article>`, else
  `<main>`, else the body, without scripts, menus, headers and footers), up to
  40,000 characters, and its title. A page with fewer than 200 characters of
  words, or one that is not HTML, says "That link did not lead to an article."
- **Thirty articles in ten minutes** per person.
- **A page built to slow the server down cannot.** The page is read in one
  forward pass, and the title only from its first 64,000 characters. A test
  feeds it trap pages of up to 2MB (`article.test.ts`), which once took minutes.

## Save from x.com

- **The button at the foot of the left panel** is dragged to the browser's
  bookmarks bar once. Clicking it on the app itself only says how to use it.
- **On an X post**, clicking the bookmark opens `/posts?save=<that page's
  address>` in a new tab. The screen saves it as if it had been pasted, then
  takes `save` out of the address so a reload does not save it again.
- **It sends only the address of the page it was clicked on, and only to this
  site.** Works in Arc and Chrome.
- **Any link to `/posts?save=` saves a post for whoever opens it signed in.**
  Only an X post link is ever saved, and it lands in that person's own list, so
  the worst a stranger's link can do is add a post they can delete.

## Share to Note from a phone (not built)

Sharing a post from the X app on a phone needs a "Share to" entry in the app's
install file. That file (`src/routes/manifest[.]webmanifest.ts` and
`webAppManifest` in `src/lib/home-screen.ts`) came from the shell, and the
shell offers no way for an app to add one. Building it means a shell change,
merged into Note, and the task says to ask Tyler first. The receiving half
already works: a share that opens `/posts?save=<link>` saves the post.

## Failures and Try again

- **Only sentences written for the owner reach the card and the bell**:
  "This post was deleted, or the link is wrong.", "This post is private, so
  only people its author lets in can read it.", "X didn't answer. Try again in
  a minute." Anything else says "Something went wrong on the server. Try
  again."
- **Try again on a post never read** reads it again. On a post that was read,
  it goes back to the analysis queue.
- **A restart is harmless.** A read whose lease ran out goes back to waiting,
  an analysis back to the queue, and a video download back to waiting.

## What Delete removes

Every stored picture, the author's picture, the video's cover and file, then
the row. A video file a sent newsletter carries is kept, the shell's own rule.
The original stays on X. A merged plan made from the post stays as it is.

## What a deploy needs

- Migrations `0100_note_posts.sql` (the tables) and `0101_note_posts_menu.sql`
  (the Posts link, right after Notes) run on the way in.
- The `note-posts` worker is listed in `src/app/server-options.ts`, so the
  production worker runs it with the others.
- `WORKER_PACKAGES="ffmpeg yt-dlp"` on the worker image, as Videos needs.
- **Not yet known:** whether X serves the same post page to the Hetzner
  server's address as it does to this Mac. Trade reads X profile pages from
  there, which is a good sign, but nobody has saved a post from the live site
  yet.
