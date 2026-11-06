# Networks as modules

A project picks the social networks it is promoted on, and each network is a
module on the project's dashboard. The network is a row in the project's left
column, and picking the row fills the middle and right columns with that
network's panels. No network has a screen of its own in the left menu.

Tyler, 14 Oct 2026: "Project first" meaning that social networks are modules
so that means we don't have reddit on its own route that sit in the sidebar.
What we'd do is add a project a select what social network this project will
use. If I select reddit and Instagram then there will be a section on the left
panel. If I click on reddit then the middle and right panel will show reddit
panels. If I click on Instagram then the middle and right sidebar will show
instagram panels."

## Tyler's rules, 14 Oct 2026

- **Reddit's screens belong to Reddit's module.** "all of reddit's subnav (all
  belongs to reddit) right now can be collapse into reddit's module. Today and
  comments can be part of the views tabs. Accounts can be a dropdown in the
  right panel to select accounts to use. Jobs can be a button in middle header
  panel that opens up a modal"
- **Comments is not a left menu screen.** "Why would reddit comments be on the
  sidebar?" Still true since 5 Nov 2026: commenting is a row of each
  network's card inside the project (below).
- **Each network keeps its own keywords inside the project.** Reddit's
  keywords carry subreddits and Reddit's order, and Instagram would search by
  hashtag.
- **Only built networks can be added.** Reddit, since 16 Oct 2026
  Instagram and TikTok (`workspace/tasks/Phone farm/06-instagram-and-tiktok.md`),
  since 21 Oct 2026 Medium (`workspace/tasks/Medium/01-medium-features.md`,
  [The Medium module](medium/medium-module.md)), since 22 Oct 2026 X
  (`workspace/tasks/X/01-x-features.md`, [The X module](x/x-module.md)), and
  LinkedIn (`workspace/tasks/LinkedIn/01-linkedin-features.md`,
  [The LinkedIn module](linkedin/linkedin-module.md)).
- **Voices stays in the left menu,** because one voice serves every network.
- **Accounts has its own dashboard,** with a Platform filter, under Projects
  after Voices. Tyler, 15 Oct 2026: "I think accounts should be on its own
  dashboard with platform filtering".

## Two sides of each network

Tyler, 5 Nov 2026: "Every middle panel clicking from the left panel should
show my own posts but reddit, medium, x and linkedin are showing search to
comments." Then: "I think its better that commenting lives within its
project. Make each network have its own card and inside that cade have 2
rows, one for posts and one for commenting". So each network in the left
column is a card with two rows:

- **Posts,** your own posts on it. A network opens on this row.
- **Commenting,** other people's posts its keywords found
  ([Commenting inside a project](commenting.md)): the keywords listed under
  the row, the posts they find, Today, the comments you sent, and LinkedIn's
  People. Instagram and TikTok have no Commenting row.

Medium, X and LinkedIn draw both sides from one module, with `side="posts"` or
`side="commenting"`, so their panels are written once. Reddit's commenting is
`reddit-module.tsx` and its posts are `reddit-posts-module.tsx`. Instagram and
TikTok have only the posts side. Which tab is on which side is each network's
`options.ts`; a link from one row's panels to a tab of the other row
switches to that row. The cards are the UI standard's `PanelCard`, which
folds from its title (Tyler, 5 Nov 2026: "cards should be collapsible", "use
ui standard card").

## A project's networks

- **The left column** lists them under **Networks**, one row each, in the order
  they were added. The picked one has a grey ground.
- **Add network** offers the networks Promo has built that the project does not
  use yet. When it uses all of them, the menu says so.
- **The X on a row** takes the network off. The server refuses while the
  project still holds that network's accounts or keywords, and says how many
  of each: "My project still holds 2 Reddit accounts and 1 keyword. Take its
  accounts out and remove its keywords first, then take Reddit off."
- **New project** asks for the networks with the name, every built network
  ticked to begin with: Reddit, Instagram, TikTok, Medium, X and LinkedIn.
- **Pause** on a network's row pauses that network on this project alone: its
  accounts send nothing and do not warm up, and the project's other networks
  keep running. Added with Medium (part 5), on every network's row. Commenting
  has a Pause of its own that holds back only the comments.
- **The number on a row** is your posts on it that need you: failed ones and
  drafts not sent yet.
- **A project with no network** shows "This project uses no network yet" in the
  middle column and nothing to post from.
- **The picked network is in the address** (`?network=reddit`), so a reload
  keeps it. With none named, the project's first network is shown.

Reddit's keywords are `promo_keywords`, shaped for Reddit (subreddits,
Reddit's sort order and time window). Medium's are its own,
`promo_medium_keywords`: a tag, search words, a publication or a writer. X's
are `promo_x_keywords`: search words, a hashtag or a watched account.
LinkedIn's are `promo_linkedin_keywords`: search words, a hashtag, or a
watched person or company page.
Instagram and TikTok have no keywords: Tyler, 16 Oct 2026, "Skip the searching
for posts to answer. IG and tiktok is not reddit."

## Instagram's and TikTok's module

One module serves both, `src/components/social/phone-apps/app-module.tsx`:

- **The middle column** is two tabs, **Posts** (every photo and video the
  project posted on the network, with its numbers) and **Comments** (what
  people wrote under them). `?view=comments` is the Comments tab, and
  `?comment=<id>` an open comment. **Jobs** opens the same Jobs window as
  Reddit's, and **New post** opens the new post.
- **The right column** is a new post with the **Post as** dropdown, or, with a
  comment open, the comment and the answer to it.
- [Instagram and TikTok accounts, and the daily reading](instagram/accounts-and-the-daily-reading.md),
  [posting](instagram/posting.md) and [comments on your posts](instagram/comments.md)
  have the rest. Direct messages are on their own dashboard for every network
  ([the Messages dashboard](messages-dashboard.md)).

## Reddit's module

Reddit's screens that used to sit under Projects in the left menu were folded
into the project on 14 Oct 2026, and on 5 Nov 2026 they split between the two
rows of Reddit's card, Posts and Commenting. The accounts are on their own dashboard for every
platform.

| Was | Now |
| --- | --- |
| Today, a page across every project | The **Today** tab of Reddit on Commenting ([Today](commenting.md#today)) |
| Comments, a page across every project | The **Sent** tab of Reddit on Commenting, with its Failed list ([What happened to your comments](reddit/sent-comments.md)) |
| Posts of your own, a list under Comments | Reddit's **Posts** row, with Failed beside it and New post in the right column ([Posts of your own](reddit/your-own-posts.md)) |
| Reddit accounts, a page | The **Accounts** dashboard at `/admin/accounts`, every platform's, with a Platform filter; **Manage accounts** in the accounts dropdown goes there filtered to Reddit ([The Accounts dashboard](reddit/accounts-dashboard.md)) |
| Jobs, a page | The **Jobs** window, from the **Jobs** button in the middle column's header on Commenting ([The Jobs window](browser/jobs-dashboard.md)) |
| Account cards in the left column | The **Comment as** dropdown above the comment box ([The accounts dropdown](commenting.md#the-accounts-dropdown)) |

- **On Posts** Reddit shows Posts and Failed, and New post on the right. The
  Failed list is `?list=failed`.
- **On Commenting** (`?side=commenting`) the tabs are To look at, Replied,
  Skipped, Today and Sent. The tab is in the address as `?view=` (none means
  To look at), and Sent's Failed list as `?list=failed`.
- **The Jobs window** reads its list when it opens, with a spinner in the
  window until then. It lists every job, not this project's alone, because one
  reader browser searches for every project. The open window is in the address
  as `?window=jobs`, and Done or Escape shuts it and reads the queue again.
- **The Jobs button** shows how many jobs are running or waiting beside its
  name.

## The tables inside the middle column

Today's and Sent's tables on Commenting, and Reddit's Posts and Failed on
Posts, are the shell's dashboard table drawn inside the
column, without their own rounded edge and outline, and they fold their
columns by the column's width rather than the window's. Measured on 15 Oct
2026, every column of Sent takes 1,287px, against a middle column of 710px at
a 1440px window and 1,035px at 2000px, so:

- **Sent** shows every column from 82rem. Narrower, the account and when it
  was sent fold into a line under the post's title. Narrower than 68rem, the
  subreddit, whether it is still there, its upvotes and its replies fold into a
  second line.
- **Posts, Failed and Today** fold their account, subreddit and dates into the
  line under the title narrower than 56rem.

At 1280, 1440 and 2000px windows nothing is past the column's edge. On a phone
the tables scroll sideways inside their own frame.

## Old addresses

A folder name is ours to change and an address is not, so each old screen's
address sends on. Bell notices written before the move still carry these, and
the reply and removal notices still write `/admin/comments`, because the
address is worked out when it is pressed and so follows the account if it
moves to another project.

| Address | Lands on |
| --- | --- |
| `/admin/comments?replies=<id>` or `?comment=<id>` | Reddit's Sent tab on Commenting, in the project the comment's account is in now, with that Replies window or comment open |
| `/admin/comments`, `?tab=failed` | Reddit's Sent tab on the only project, and that list, or the Projects table |
| `/admin/comments?tab=posts` | Reddit's Posts on the only project, or the Projects table |
| `/admin/today` | Reddit's Today on Commenting, on the only project, or the Projects table |
| `/admin/reddit-accounts` | The Accounts dashboard, filtered to Reddit |
| `/admin/jobs` | The Jobs window on the first project's Reddit Commenting, since it lists every job |

The project page's own old commenting addresses (`?view=today` and the like)
are in [Commenting inside a project](commenting.md#old-addresses).

A comment from an account that is in no project now shows in no Sent tab.
It is still stored, and shows again once its account is put in a project.

## What holds it up

- **The column** `promo_projects.networks`, a list, added by
  `drizzle/0118_promo_project_networks.sql`. That migration gave every project
  made before it Reddit, and took Today, Comments, Reddit accounts and Jobs out
  of every saved left menu, wherever they sat. Voices stays.
- **The list of built networks** is `src/lib/social/networks.ts`, read by both
  the screen and the server.
- **The server**: `addProjectNetwork`, `removeProjectNetwork` and
  `projectForOldScreen` in `src/server/social/projects.ts`.
- **The page**: `src/components/social/projects/workspace.tsx` picks the
  network, `project-columns.tsx` is the three columns any network fills, and
  `src/components/social/reddit/reddit-posts-module.tsx` is Reddit's posts.
  Reddit's Commenting is `reddit-module.tsx`. The cards are `ProjectNetworks`
  in `project-panel.tsx`. The Jobs window is `jobs-window.tsx` and the dropdown
  `account-picker.tsx`, beside it. Instagram's and TikTok's module is
  `src/components/social/phone-apps/app-module.tsx`.
- **The old addresses** are the four route files they always were, now only
  sending on.
