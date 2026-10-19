# The posts dashboard

`/posts`, linked as "Posts" in the left menu right after Notes. Every
signed-in member gets it and sees only their own posts. It is laid out like
Videos: folders and authors on the left, posts in the middle, the picked post
on the right. On a phone the three become tabs.

## The address

`?folder=`, `?author=`, `?tag=`, `?progress=` and `?open=` keep what is
showing, so a reload and a bell notice come back to the same place.
`?save=<link>` saves a post and is then taken out (`saving-a-post.md`).

## The left panel

- **All posts and No folder**, then the person's folders in the order they
  dragged them. A flat list with no fields (Tyler, 19 Oct 2026: "Picks the
  folder only"). It works like the Videos folders: the cog renames, the bin
  deletes and leaves the posts in no folder, the grip reorders.
- **Authors**: everyone whose posts are saved, most saved first, with their
  picture and a count each. Clicking one shows only their posts, and clicking
  it again shows everyone. A name that only repeats the handle (levelsio's
  display name is "@levelsio") is shown once.
- **Save from x.com** at the foot, the bookmark button.

## The middle panel

- **The paste box and Save** at the top.
- **Search** reads the post's words, the quoted post, the thread, the
  article's title, the author, the summary and the tags. A highlight is part of
  the words, so search finds it.
- **The plan filter**: Every plan, Not started, In progress, Done.
- **An author or tag being shown** sits under them as a chip. Clicking the
  chip stops it.
- **Each card** shows a tick box, the author's picture, name and handle, the
  date posted, the first lines, the first picture, the first highlight in
  yellow, where the post has got to, and once analysed the first line of the
  summary, how far the plan has got and the tags. Clicking a tag shows only
  posts with that tag.
- **The menu on a card** moves it to a folder or deletes it.
- **Ticking posts** brings up one bar: how many are picked, Clear, the price,
  Analyse and One plan (`analysing-a-post.md`). The box at the start of the
  bar picks every post on screen.
- **Only the ticked posts on screen are acted on and priced.** A post ticked
  under another folder or filter stays ticked for when it shows again, but
  Analyse and One plan leave it alone.

## Not started, In progress, Done

Worked out from the ticks every time, never stored: no ticks is Not started,
some is In progress, all is Done. A post with no plan has none of the three.
The filter asks the database the same question, so it finds posts that are not
loaded on screen yet.

## The right panel

- **The post as it was saved**: the author with "Open on X", the words with
  their highlights, the pictures (click one for full size), the video player,
  the quoted post in a grey box, "This post opens a thread" when it does, and
  the likes and reposts when saved.
- **Bring in the article**, when the post links off X.
- **Analyse** with its price line, then the folder suggestion and the
  similar-post warning when the AI gave them.
- **Grey cards that fold shut**: Thread (the author's follow-on posts),
  Summary, Action plan, Tags, and "What the video says" with the time of each
  line. Clicking a line plays the video from there.
- **Delete post** at the foot.

## Highlights

- **Select words** in the post, the quoted post or a post of the thread, and a
  Highlight button appears under them. Highlights touching each other in one
  part join into one.
- **Click a highlight** to take it away.
- **They save at once** and stay through Analyse again, because they are on the
  post's own words and never the AI's. The server keeps only highlights that
  fit the words they are on (`cleanHighlights` in
  `src/lib/note/posts/highlights.ts`).

## The action plan

- **A tick box per step**, saved at once.
- **Click a step's words to edit them.** Enter or leaving the box saves; Escape
  puts them back. An empty step is refused: "A step needs some words".
- **Add a step** at the foot, up to 30 steps. **The bin** deletes one. **The
  grip** drags one into a new order, by mouse or keyboard.
- **Every change saves the whole plan**, one save at a time, each with the plan
  as it stands, so a slow answer never lands after a newer one. A refused save
  puts back the plan the server last kept.
- **While the post is being analysed** the plan cannot change, because it is
  about to be replaced. Pressing a step then says "Wait for the analysis to
  finish first."
- **Copy as text and Copy as Markdown** copy the author and link, the summary
  and the plan with its ticks. A merged plan's steps name the post each came
  from.

## The tables

`drizzle/0100_note_posts.sql`, mirrored in `src/server/note/schema.ts`:

- `note_post_folders`: one person's Posts folders, unique on owner and
  lowercased name.
- `note_posts`: one saved post or one merged plan (`kind`). Unique on owner and
  X's post number. The status is the job; the video has its own status.
- `note_settings`: the app's own settings, one row.
- `note_notice_links.post_id`: which post a bell notice is about.
