# The vault

Every project has a vault of viral ideas, and the Viral dashboard's Vault row
shows every project's vault in one place. Tyler, 4 Nov 2026: "Per project +
all-vault page", "Keep a downloaded copy", "Status and tags", "Vault replaces
them" (Video's Favourites). The code is `src/server/viral/vault.ts`.

## Three kinds of idea

An idea is one of three kinds (`viral_vault_items.kind`, added by
`drizzle/0254_viral_vault_ideas.sql`). Every idea starts at Idea.

- **A saved video.** Save to vault on a video's right panel. Everything
  below under "What a video idea keeps" is about this kind.
- **A saved post.** Save to vault on an X, Reddit or LinkedIn post (Tyler,
  6 Nov 2026: "All four pieces"). See "Posts in the vault".
- **Your own idea.** "+ New idea", typed by you (Tyler: "Script on a
  button"). See "Your own idea".

Only a video has a player and a kept copy. A post and your own idea have no
video at all, so their right panel has no player and its cards start with
Idea. Everything else works the same for all three: List, Board, Filter,
search, Mass select, Copy to another project, Send to Video, Post for Promo
and delete. Send to Video sends a draft with no file. Deleting one has no
file to throw away. Overview's Vault by status counts them like any other idea.

## What a video idea keeps

- **The video.** Viral's own downloaded copy, so it still plays after the
  creator deletes it.
- **The numbers.** Views, likes, comments, followers, length, posted date,
  score and Outlier, copied from when it was saved.
- **The analysis picked**, copied so a later analysis never changes it.
- **Your notes.**

Saving the same video to the same project again updates that idea instead of
adding a second one. The idea keeps the file and cover it already has, even
when its saved video was deleted in between and the new one has no file yet.
Your edit of the script stays when the same analysis is saved again, and is
dropped when another analysis, or none, replaces it.

## Posts in the vault

Save to vault sits in a sticky footer on an X, Reddit or LinkedIn post's
right panel (`src/components/viral/text-socials.tsx`). It opens a dropdown,
the way Analyse with AI does, saying what the AI writes and what it costs
with the writer's name, before anything runs.

- **What the AI writes.** All four pieces, the same as a video's: why it
  works, a video script, more ideas, and a title with hashtags. They are
  written from the post's words for the project's topic, by the writer
  picked on Settings → AI writer (`savePostToVault` in
  `src/server/viral/vault-ai.ts`).
- **The script's parts.** A post has no breakdown to copy, so the AI picks
  the parts from Viral's list (hook, problem, the twist of the knife,
  solution, proof, the ask). A script with no hook is refused and nothing is
  kept.
- **What is kept.** The network, the writer, the words, the title, the
  subreddit, and the link the post carries, kept only when it is http or
  https. The numbers are kept in the network's own words, so a Reddit
  idea's Numbers card says Upvotes and Comments, and LinkedIn's says
  Reactions. The post's top replies stay in Viral's post view, not the idea.
- **The cost.** About 2 cents with Gemini Flash, 1 cent with GPT-5 mini and
  11 cents with Claude Opus 5, on the AI meter as `viral_post_analysis`
  (`ai-analysis.md`). It counts against the project's spend limit.
- **Saving again.** The same post saved to the same project again writes the
  four pieces again and updates that idea. Its status, notes and tags stay.
  Your edit of the script does not, because it was an edit of the old
  script, and the dropdown says so before you press. The button says
  "In vault · save again" once it is in.
- **Refused.** A sample's posts are made up, so they are refused before the
  AI is asked, as every sample is. So is a project with no topic, and a post
  whose address is not an http or https link, because the idea's Open on and
  Copy link use it.

## Your own idea

"+ New idea" sits in the Viral dashboard's Vault header and in a project's
vault header, where every list's primary add sits. In a narrow header it is
the + alone. A sample project has none.

- **The window.** The project, a title, and notes in the shell's editor. The
  project list leaves out samples and archived projects
  (`src/components/viral/new-idea-dialog.tsx`, `createOwnIdea` in
  `src/server/viral/vault.ts`).
- **The notes.** Your own idea's notes are written in the shell's editor, as a
  project's notes are, and save as you type. A video's and a post's notes
  stay a plain box. Send to Video, Post for Promo and the search read your
  own idea's notes as plain words.
- **Write a script.** Until it has one, the idea shows a Script card with a
  Write a script button and its price. The AI writes one script for the
  project's topic from the title and the notes, every part labelled. About 1
  cent with Gemini Flash or GPT-5 mini, 2 cents with Claude Opus 5, on the
  AI meter as `viral_own_idea_script` (`writeOwnIdeaScript` in
  `src/server/viral/vault-ai.ts`).
- **Refused.** A sample project and a project with no topic, before the AI is
  asked.

## Editing the script

Tyler, 6 Nov 2026: "Keep it, Show original". This works on vault ideas only.
An analysis on the project page's right panel stays as the AI wrote it.

- **The pencil.** The pencil in the Script card's header turns each part into
  a box. The part's label and seconds stay as they were; only the words
  change. The words save 700ms after the last letter and when the box is
  left, as the notes do. Saves go one at a time in the order they were
  made, so a slow save never lands after a newer one, and Go back to the
  AI's version waits for any save still on its way. The pencil turns into a
  tick to stop editing. It sits in the card's own button slot in the header,
  so like the other cards' buttons it shows while the card is pointed at, and
  stays in view while editing. A shut card hides it (`analysis-cards.tsx`).
- **The original.** The AI's script is never changed. Your version is kept
  apart (`viral_vault_items.edited_script`). Show original puts the AI's
  version on screen, and Go back to the AI's version throws your edit away
  after asking. An edit whose words all match the AI's is no edit.
- **What goes out.** Send to Video, Post for Promo and the Script card's Copy
  use your version when there is one (`currentScript` in
  `src/lib/viral/vault.ts`). While Show original is on, Copy copies what is
  on screen.
- **Copying the idea.** Copy to another project takes your edit with it.

## Download to computer

Tyler, 6 Nov 2026: "Both ⋮ menus". "Download to computer" is in the ⋮ of the
project page's right panel and of a vault idea. It shows only while Viral
keeps a copy of the video.

- **The file.** It is named after the video's title, with slashes, quotes and
  line breaks taken out, such as `Meal prep 10 minutes.mp4`
  (`src/server/viral/downloads.ts`).
- **The route.** `/api/v1/viral/download/video/<saved video id>` and
  `/api/v1/viral/download/idea/<idea id>`. It needs a signed-in admin, and
  the copy must be theirs. Anybody else's id, and an id with no copy, both
  answer "No such file", so the answer never says whether it exists.
- **Streamed.** The file streams from the bucket as it is read, so a large
  video is never held in memory.

## The copy of the video

- **One file, two users.** The vault item points at the saved video's
  downloaded file in the shell's media library. `media-in-use.ts` keeps the
  file in storage while a saved video or a vault item points at it.
- **Deleting the original.** Deleting the search result or the saved video
  never stops an idea playing.
- **Saved before the download.** An idea saved before the download finished
  takes the file the moment it lands (`fillVaultCopies`).
- **Deleting the idea.** Deleting an idea deletes its file and its cover,
  once nothing else uses them.
- **Deleting the project.** A project's ideas go with it, and their files
  and covers are deleted the same way, once nothing else uses them
  (`discardVaultFiles` in `src/server/viral/vault.ts`).

## Status and tags

- **Statuses.** Idea, Scripted, Sent and Posted. You change them by hand,
  except two that turn on by themselves. Sent turns on after Send to Video.
  Posted turns on when Promo reports a post made from the idea
  (`promo-connection.md`).
- **Your views.** Once Promo has reported your post of an idea, the Numbers
  card lists "Your X views" under the original's numbers, one line per post,
  each linking to it. Promo sends fresh views at most once a day. A Reddit
  post shows "Your Reddit upvotes" and "Your Reddit comments" instead, the
  first linking to it, because Reddit shows no views. Both read "-" for now,
  because Promo doesn't read a Reddit post's numbers after it goes up.
- **The board.** Filter's Show as on the Vault row has List and Board
  (Tyler, 4 Nov 2026: "List or Board switch"). Board draws a column for each
  status, and dragging a card to another column changes its status, in one
  request through `changeVaultItems`. Sent refuses a drop and says it turns
  on after Send to Video. Board is kept in the address (`?show=board`) and in
  saved views; List is the default, so it is never written down
  (`src/components/viral/vault-board.tsx`).
- **Tags.** Tags are free text, kept per person and offered as you type
  (`viral_tags`). "Hooks" and "hooks" are one tag, spelled the first way it
  was typed.
- **Mass select.** Press Mass select in a vault list's header, tick ideas,
  then open "N selected". It holds Set status first, then Add a tag (pick a
  tag already used, or type a new one), then Delete, then Clear selection.
  Delete asks first, because each idea takes its kept copy of the video with
  it. Each change is one request (`changeVaultItems`). The answer lists the
  ids changed, the ones already that way and the ones skipped with a reason.
  Nothing pops up when every idea changed. When some were skipped, the error
  toast says it in one line: "2 ideas set to Posted, 1 was already set to
  Posted. 1 was no longer in the vault." (`src/lib/viral/vault-bulk.ts`).
  The menu is `src/components/viral/vault-selected-menu.tsx`, the same on the
  Vault row and on a project's vault.

## Copy to another project

Tyler, 4 Nov 2026: "Copy, both keep it". Copy to another project is in the ⋮
of a vault idea and of a video on the project page's right panel. It opens a
window listing your other projects, leaving out archived ones and samples
(`src/components/viral/copy-to-project-dialog.tsx`).

- **An idea.** The copy keeps the analysis, the numbers, the notes, the status,
  the tags and the Open in Video link, and points at the same file and cover
  (`copyVaultItem` in `src/server/viral/vault.ts`). `media-in-use.ts` counts
  both ideas, so deleting one leaves the other playing.
- **A video.** It joins the other project the way a pasted link does: through
  `viral_project_links` and your one saved row, so both projects show one
  downloaded file (`src/server/viral/copy-to-project.ts`). A video nobody saved
  yet is saved with Download alone, so the copy has a file. No AI runs.
- **Already there.** A project that already holds the video or the post
  changes nothing and says so. Your own idea has nothing to match on, so it
  is always copied.
- **Refused.** A sample project, a made-up sample video or post, an archived
  project, and anybody else's project.

## Where it shows

- **Per project.** The Vault block on the project's page has an All ideas
  row with a count (`vault_count`). Picking it lists that project's ideas in
  the middle panel (`?view=vault`) and opens the first one on the right
  (`src/components/viral/vault-list.tsx`, `vault-item-panel.tsx`). A video
  already in the vault says "In vault · save again" under Analyse with AI,
  and saving again updates that idea.
- **The Vault tab** of the Projects dashboard's Viral row (`viral-dashboard.md`;
  `src/components/viral/dashboard/sections/vault-section.tsx`) lists every
  project's ideas, or one project's, picked in the left page's Projects
  block (`?project=`).
  - **Middle.** The ideas on the shell's table, newest first, with the
    project's name under each title while All projects is picked. The one
    header holds "N selected", the search box, Select, Filter, Views and
    "+ New idea". New idea opens on the project picked on the left.
  - **Filter.** Status and Tag, which combine: Posted with the tag "hooks"
    shows only ideas that are both (`filterVaultItems` in
    `src/lib/viral/vault-view.ts`), then Show as, List or Board. The search
    looks in the title, the channel, the notes and a post's words. All of it
    lives in the address.
  - **Views.** Kind `viral-vault`, with no record. A view keeps the search,
    status, tag and project. A view whose project was deleted, or whose tag
    no idea carries any more, says so and opens without it.
  - **Right.** The open idea (`?open=`) in the shell's record frame, the same
    panel a project's vault opens. Its ⋮ holds Status as a row. The first
    idea shown opens on arrival and after picking a project, and the
    dashboard goes back to where it was.
  - **Right-click** an idea for Select and Delete from the vault.
  - **Empty.** With no ideas anywhere, the middle says "Save a video or a
    post to the vault from a project's right panel, or press New idea to type
    your own." A search or filter that leaves nothing says so with Clear
    filters.
