# The social feed

`/social` is one feed of every X account you track: the newest posts first,
whoever wrote them, like opening X and seeing only the accounts you chose. It
is the front door of Social. One creator's own dashboard is a separate screen,
`/social/<handle>` (see `social-dashboard.md`), and the sortable table of every
creator is `/social/manage` (see `every-creator.md`).

## What the screen holds

Three panels across, and only three, the creator dashboard's shape with a
different subject. There is no bottom row and no header row above the panels.
Drag the dividers and the sizes are remembered against your account. Below
1280 pixels wide the dividers go and the same three panels stack in the same
order.

- **Left, your creators in folders.** An Everyone row on top, the folders you
  made under it, then any creator in no folder. A folder opens under its
  chevron, one at a time.
- **Middle, the feed.** Every post in the current view, newest first, each row
  carrying its creator's picture and handle. The handle opens that creator's
  own dashboard, and clicking the post itself opens it in a window;
  `social-dashboard.md`, "Opening one post", covers that window, the hover on
  Open on X, and why a long post arrives cut. Posts load 50 at a time with
  "Show older posts".
- **Right, the coins the view names**, most-named first, each with how many
  posts name it. The header says what the counts cover — "Everyone", a
  folder's name, or a handle — because a figure that does not name its folder
  cannot be trusted.

## Reading the feed again

The feed is read once when the screen opens, so posts added after that are not
there until it is asked again. The refresh icon at the right of the Feed
header asks the server for the view on screen now, keeping whichever folder,
creator or coin is picked. Tyler asked for it on 3 Oct 2026, because syncing a
creator on their own dashboard left the feed in another tab a few posts
behind. It spins while the ask is in flight and will not start a second one.

It does not read X. Only a creator's own dashboard does that, through Sync
profile, and `social-dashboard.md` covers it.

## Narrowing the feed

Three narrowings, and the chips in the feed's header name whichever are in
force, each with its own clear:

- **A folder.** Click its row on the left. The feed shows only its creators'
  posts and the coins panel re-counts over them.
- **A creator.** Click their row on the left. Clicking a creator replaces a
  folder choice rather than stacking on it.
- **A coin.** Click its row on the right. The coin stacks on a folder or a
  creator, so "SOL inside Trusted" is two chips.

Clicking the row already picked widens back out. Every narrowing asks the
server again rather than sieving the page on screen, so a coin with 41 posts
shows all 41. The coins panel's counts are deliberately not narrowed by the
picked coin, so it keeps listing every coin there is to pick from.

## Folders

Folders group creators the way the markets panel's folders group coins, and
they copy that behaviour on purpose:

- **A creator can sit in several folders**, because "trusted" and "posts about
  stocks" are not exclusive. The folder button on a creator's row ticks them
  in and out, and can make a new folder with them already in it.
- **Everyone is not a folder.** It cannot be renamed, hidden, deleted or
  dragged, and it always sits on top.
- **Two names that differ only in case are one name**, and are refused.
- **The eye hides a folder without losing anything.** A hidden folder keeps
  its creators and stops taking a row in the panel. Its creators do not
  reappear under "In no folder"; they are still foldered, just filed away.
- **Deleting a folder keeps the creators.** Only the grouping goes.
- The cog opens the manage window: rename, drag into order, the eye, delete,
  and the way to the creators table at `/social/manage`.

## Adding a creator

The + in the left panel's header opens the same window the manage screen uses.
Adding lands on that creator's dashboard, which reads their public X page on
open, so their first posts arrive without another press and then show up in
the feed.

## What the feed can hide

One loud account posting forty times a day drowns five careful ones. The
folders are the answer this screen ships with: a Trusted folder of six is six
voices at equal volume. A weight per creator is task 24 and muting is not
built.

The newest posts can show no coin chips for a moment: coins are read out of a
post's words after the post arrives, and a post not yet read is not counted in
the right panel either. The creator dashboard behaves the same way.

## Where it lives

- Tables: `trade_social_folders` and `trade_social_folder_creators` in
  `src/server/trade/schema.ts`, created by
  `drizzle/0194_trade_social_folders.sql`, which also adds the
  `(user_id, posted_at)` index the feed's query stands on.
- The feed query: `src/server/trade/social-feed.ts` — the one place that reads
  posts across creators. Folders: `src/server/trade/social-folders.ts`. Every
  query is filtered by the signed-in member's id in the same `where` as the
  rows it reads; another member's folder or creator id reads nothing.
- The endpoints: `src/lib/api/trade/social-feed.ts`, all behind `userGet` or
  `userPost`.
- The screen: `src/routes/_authenticated/social.tsx` and
  `src/components/social/social-feed-page.tsx`, with the panels in
  `social-creators-panel.tsx`, `social-feed-panel.tsx`,
  `social-feed-coins-panel.tsx` and the cog window in
  `social-folders-manager.tsx`. The post's own window is
  `social-post-dialog.tsx` and the rules for what a click on a row means are
  `post-row-click.ts`, both shared with the creator dashboard.
- Panel sizes: `socialFeedHorizontal` in `src/lib/trade/panel-keys.ts`.
- The shared shapes: `src/lib/trade/social/feed.ts`.

**The sidebar link is data, not code.** "Social" is added by hand in
Platform → Navigation, pointing at `/social`, and now opens the feed.
