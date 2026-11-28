# Content: Video, Promo and Viral in one app

Content is one app holding what Video, Promo and Viral did as three. A
project is one thing you promote. Its page holds the research that finds ideas
(from Viral), the videos made for it (from Video) and its posts and comments on
every network (from Promo). The task is `workspace/tasks/01-content-app.md`.

Tyler, 26 Nov 2026: "I want to create a new app called "content" that
combines viral, video and promo into one big app", then "like create one
project and inside that project 3 panel dashboard, the left panel have viral,
video editor and promo". His answers the same day:

- **Name:** "Content".
- **Start from:** "Copy Video to a new app".
- **The editor:** "Option 1: whole screen".
- **The old apps:** "Retire them", once Content works.
- **Data:** "Start with dummy data so we can have a better visual view how
  everything works".
- **Thumbnail:** "Leave it separate".
- **A project:** "One thing you promote".
- **Carousels:** "Own dashboard, as today".

## Where it runs

- **Port 3029**, from `local-apps.json`. Its own local database is on port
  54617, named `content`, in the `content-postgres-1` container.
- **`.env.local`** was written the way the Personal IDE writes one: Promo's
  shared keys (storage, the secret encryption key), then the three lines with
  Content's own origins, database port and address.

## What came from where

Content is a copy of Video, with Promo's and Viral's own files added. All
three were copies of the same shell, so the shell's files were already the
same in each, and only each app's own files moved.

- **Video:** everything, copied first. Its code is under `video/`,
  `video-editor/`, `video-assets/`, `video-flow/` and `carousel-studio/`.
- **Promo:** under `social/`, `phones/`, `browser/`, `archive/`, `bans/` and
  `viral-link/`, with `docker/browser/` and `rack/`.
- **Viral:** under `viral/`.
- **Content's own code** is under `content-app/` in `src/server`,
  `src/components`, `src/lib` and `src/lib/api`. The shell already has a
  folder called `content` (its pages and announcements), so Content never uses
  that name for its own.
- **Tables keep their names.** `promo_*`, `viral_*` and `video_*` tables are
  the same tables as in the three apps. Content's two own tables are
  `content_sample_made` and `content_navigation_added`
  (`drizzle/0257_content_app.sql`).
- **Migrations:** Video's run first, as they were (`0000` to `0189`). Promo's
  own came next, renumbered `0190` to `0243`, and Viral's `0244` to `0256`, each
  in its old order. Code and docs name the new numbers.
- **Docs:** the three apps' docs are in this folder. Where two had a file of
  the same name, Video's project guests became `video-project-guests.md`, and
  `README.md`, `no-success-toasts.md` and `shell-integration.md` each hold all
  three.

### The option files

`src/app/options.ts`, `server-options.ts` and `open-endpoints.ts` hold the
three apps' answers together.

- **Settings tabs:** every tab of the three, except the ones that set up a link
  between two of them (Video's Promo and Viral, Promo's Video and Viral,
  Viral's Video connection and Promo connection). Video and Viral each had a
  tab with the id `youtube`, and one app holds one tab of an id, so Settings →
  YouTube shows Research's YouTube key and units first, then the channel the
  retention curves are read from (`src/components/content-app/youtube-settings.tsx`).
- **Background workers:** all 33 of the three, except Viral's menu job, which
  would add Viral's own section and make its dashboard home. Content's menu
  job runs in its place ("One left menu" below).
- **Phone share target:** Viral's, so a video shared from a phone opens Save
  to Research (`phone-save.md`).
- **Notices:** Promo's, so a proxy or comment notice opens where it belongs.

### The Project app's two links

The Project app sends people into Video ("Edit video") and into Promo ("Open
in Promo") at the same address, `/handoff/project`, and asks both for a task
card's name and picture at `/api/connect/project/record-card`. Content answers
both addresses once:

- **The handoff** reads which app the note is for (its `app` claim, `video` or
  `promo`) and hands it to that part, which checks the note's stamp as before
  (`src/server/content-app/project-handoff.ts`). A changed claim no longer
  matches its stamp, so reading it first lets nobody in.
- **The card** checks the stamp once, then looks the record up as a video
  project first, then as a project.
- To use them, Project's Video and Promo addresses both point at Content.

## One project

A project is a row in `promo_projects`, and its research and its videos are a
row in `viral_projects` and a row in `video_projects` **under the same id**
(`src/server/content-app/projects.ts`). The same id is the link: the
project's page, its Research and its editor all open on it.

- **Made together.** New project and Duplicate make all three rows. A
  duplicate's research and videos start empty, as a new project's do.
- **Named together.** Renaming the project renames the other two.
- **Research's topic is the description.** Every save of the description
  writes its plain words into `viral_projects.topic`, which every analysis
  writes its script for.
- **Deleted together.** Deleting a project deletes its videos, with their
  files, then its research, with its vault files, then the project. A video
  whose files would not come out keeps the whole project, with why. A
  project's carousels are kept, since carousels are not a project's.
- **No row is left loose.** Viral's New project, Duplicate and sample, and
  Video's New project and Duplicate, still make a research or video row of
  their own. Each of those, and every read of a list of projects, makes a
  project of any research or video row that has none, under the same id and
  name (`adoptLooseParts`). So a carousel made into a video, which starts a
  video project of its own, shows on the Projects dashboard as a project.
  Carousels themselves are kept in a table of their own and never become one.
- **Deleting from Research's dashboard** deletes the whole project, as
  deleting it from its page does. A project still holding accounts, keywords
  or Archive items is kept, with why.

## The Projects dashboard

Promo's Projects dashboard, at `/admin/projects` (`projects-dashboard.md`).
A project's row opens the project's page, and the eye in its actions shows its
summary on the right.

Its left panel keeps what belongs to every project at once (Tyler, 27 Nov
2026: "Right now the dashboard doesnt make a lot of sense"):

- **The Dashboards block:** Overview, Projects, Accounts, Messages and Viral.
  Accounts stays every project's accounts with a tab per network (Tyler: "Just
  leave the unified accounts dashboard the way it is now").
- **Viral:** one row whose middle has Vault, Hooks and Formats as tabs
  (Tyler, 27 Nov 2026: "remove the viral block and add a "Viral" link in the dashboard. Clicking on that link will show 3 middle tabs "Vault, hooks and format""). It replaced the Viral block of the same day.
- **Voices and the Archive are not sections.** Each is a project's own: a
  Voices tab on each network of a project's page, and the project's Content
  block (Tyler: "The voice should not be its own sidebar link", "Archive
  should also not have its own link either"). An old address to either lands
  on Projects, and a person's saved order or hidden rows naming them are read
  without them.

Viral's three are Research's lists that belong to no one project (Tyler,
27 Nov 2026, of Research's own dashboard: "I thought we merge that into the
project itself"):

- **Vault:** every project's saved ideas, each opening on the right, as
  Research's dashboard showed them.
- **Hooks:** the hooks from every project's analysed videos, and your own,
  with Write hooks like this.
- **Formats:** saved formats that write scripts for any project.

They are Research's own section screens, read when they show
(`src/lib/content-app/research-search.ts`), showing every project's. The
Projects block narrowed them to one project; since it went, only a saved view
that holds a project does.

The left panel has no Projects block (Tyler, 27 Nov 2026: "Remove projects
block. List row only"): a row of the Projects list opens the project, and the
same left panel stays while it shows (`useProjectsLeft` in
`src/components/content-app/projects-left.tsx`). Their rows carry no count. Research's
separate dashboard, at `/admin/viral`, is gone: its Overview and Projects rows
repeated this dashboard's.

Overview has two widgets more, one for each of Content's other jobs
(`src/server/content-app/widgets.ts`):

- **Found today:** each project's videos Research found in the last 24 hours,
  with how many are new, each opening the project's Found videos.
- **Videos in progress:** the drafts, last edited first, each opening in the
  editor.

A person who never arranged Overview starts with Found today, Videos in
progress and Posts that need you on top, and Messages waiting, Accounts by
status and Archive room under them. Bans and Results are a Manage widgets
away.

## A project's own page

`/admin/projects/<id>`, opened from its row on the Projects list. Tyler,
27 Nov 2026: "When clicking on a project. I dont want the left panel to change
so that means we can remove the project's overview and its widgets. The
networks tab can go in the middle panel content sub header tabs. The flow
would look like this: click project > middle and right panel change > middle
panel first load will be it's content archive. The middle panel header would
have these tabs [Content] [Research] [Promote] The idea is we move all the
blocks per project to the middle panel". His answers the same day: "Remove
projects block. List row only", the project's videos "Inside Content", "A
Posts / Commenting switch", and "A ⋮ on the project's tabs". After the first
build: "remove the name", "I dont like the 2 extra subheader. Lets put them
all in the top header so we have just one header. The tabs can now be either
dropdowns or filter", the ⋮ after the list's New button, the Archive's Bin and
zip "should be buttons on the right", Research's two ⋮ "should be merged",
and "move discritption to general. it dfoesnt need its own tab". The task is
`workspace/tasks/Content/03-project-in-the-middle-panel.md`.

- **The left panel** is the Projects dashboard's, unchanged, with Projects
  picked in its Dashboards block.
- **The middle has one header** per list: the arrow back, Content, Research
  and Promote, the tab's own dropdown, the list's own dropdown and buttons,
  then the project's ⋮. `projects-dashboard.md`, "The one header", has the
  order and how it gives way on a narrow window.
- **Content** is the page's home and its plain address: the project's videos
  still in the editor under Drafts first, then its Archive with its first item
  on the right (`archive.md`; Tyler, 27 Nov 2026: "All content should show
  draft too"). After the search icon it has two dropdowns
  (`content-kind-menu.tsx`):
  - **What kind:** All content, Videos, Carousels, Pictures. A draft is a
    video, so it shows on All content and Videos.
  - **Status:** All statuses, Draft (the videos still in the editor) and
    Published (everything in the Archive, posted or not) ("There should be another drop down for "Status" and move draft there, we also need Published"; Published was his pick, "In the Archive"). A guest has no
    drafts and no Status. The address keeps it as `?archive=1&stage=draft`,
    since a network's Accounts tab has a `status` of its own.

  After Filter, **Grid and List** ("Shouldnt there be 2 icon for list and grid ?") show it as cards or as one table with the same
  columns for drafts and every kind: Item, Kind, Length, Status, Last change
  (`content-layout.tsx`). This browser remembers the pick, a grid to begin
  with; a header narrower than 32rem, as on a phone, leaves the two icons out.
  A draft opens the editor on the whole screen. The Drafts list that was a
  choice of the dropdown is gone into Status.
- **Research** is `/admin/projects/<id>/research`: Viral's project screen
  with this left panel. Its dropdown picks Found videos, Hooks, Sounds or
  Creators. The vault is the Projects dashboard's own Vault, which can show
  one project's ideas, and Winning ads is gone (Tyler, 27 Nov 2026: "Remove
  winning ads feature ... and vault dont belong here"). An old address
  naming either opens Found videos. The socials it reads are the **Social** row
  first in its Filter; picking X, Reddit or LinkedIn there shows that social's
  posts. Its address holds Viral's own keys (`view`, `social`, `open` and the
  rest).
- **Promote**'s dropdown picks a network and its side, "Reddit · Posts" or
  "Reddit · Commenting", the Posts and Commenting rows of the Promote block
  before (`projects-dashboard.md`, "Promote's networks").
- **The project's ⋮**, last in every header, holds General (Name,
  Description, AI spend cap, Cover photo, Pin, Pause, Lock description, New
  project, Duplicate, Delete), Networks, and on Research, Research and
  Socials, Research's own settings (Search, AI spend limit, the socials it
  reads). The description is what the AI is told and Research's topic. The
  name, cover, topic, duplicate and delete are the whole project's.
- **What went:** the project's own left panel with its Dashboards, Viral,
  Content, Research, Videos and Promote blocks, and the project's Overview
  with its widgets. The Projects dashboard's Overview stays; its Found today
  opens a project's Research, Videos in progress the editor, and Archive room
  the project's Content.
- **A guest sent from Project** has no left panel, since it lists every
  project, no arrow back and no Research. A guest's plain address opens
  Promote's first network, as it always did, and Content is `?archive=1`,
  All content alone. The ⋮ holds General with the Description row alone. Viral's
  and Video's screens have no way in for a Promo guest. This was a reading,
  not one of Tyler's answers.

## Voices and Accounts on each network

Every network on a project's page has two more choices at the end of its
list dropdown, on Posts and on Commenting (`src/components/content-app/network-panes.tsx`):

- **Voices** (Tyler, 27 Nov 2026: "The voices goes into the middle tab for its
  own network"): the Voices section in the network's middle and right, the
  list, New voice, and the voice on the right saving as it is typed. Every
  network gets it, because every network's drafting puts the account's voice
  into the AI's instructions: Reddit's comments, Medium, X, LinkedIn,
  YouTube, and Instagram, TikTok and Threads' captions and replies. A voice is
  still shared, so a change made from Reddit's tab shows on X's too; the line
  under its name says which accounts use it.
- **Accounts** (Tyler: "A tab on each netowrk"): this project's accounts on
  that network, with the Accounts section's Filter, In use and Retired, and
  the account on the right. The unified Accounts on the Projects dashboard
  stays as it is.

How they behave:

- **One header.** The pane keeps the network's one header: the project's
  controls, the list dropdown, then the list's search, Select and New, and
  the project's ⋮.
- **In place of the network's lists.** The network draws the tab instead of
  its own lists, so nothing of them runs behind it.
- **The address** holds `pane=voices` or `pane=accounts`, with the open voice
  or account in `open` and the Filter's keys. A network's own list, the other
  side, another network or Content leaves it, with its open row and filters.
- **A guest** sent from Project has neither tab: voices and accounts are the
  owner's.

## The video editor

A video opened from Content, a draft or a video just made with Add → Create
video, opens the editor on the whole screen
beside the left menu, as Video's editor always was (Tyler, 26 Nov 2026:
"Option 1: whole screen").

- **The back button**, first in its header, carries the project's name and
  goes back to where the video was opened from: Status Draft when the address
  says `?from=drafts`, All content otherwise (Tyler, 27 Nov 2026: "clicking back to
  content archive shows a list ... but it was a grid before that?";
  `src/components/content-app/editor-back.tsx`). A video project made outside
  a project, if one were left, goes back to the video projects list as before.
- **The top bar names Projects** at its top left, as a project's page does
  (Tyler, 27 Nov 2026: "why doesnt the editor have the top nav"). The editor
  is no link of the left menu, so the shell drew nothing there; Content draws
  its own top left through `header.leftContent`
  (`src/components/content-app/content-header-left.tsx`), the shell's own
  everywhere else, and only while Settings → Top left shows is Sidebar links.
  The left menu itself does not mark Projects on the editor: that is the
  shell's sidebar.

## Carousels

Carousels keep their own dashboard, as in Video, and are not a project's
(Tyler, 26 Nov 2026: "Own dashboard, as today").

## One left menu

Content's menu job (`src/server/content-app/navigation.ts`) puts one section,
Content, at the top of each left menu once, and makes the Projects dashboard
the home page once, while nobody has chosen another. An admin who removes a
link afterwards keeps it removed. The section's links
(`src/lib/content-app/menu.ts`):

- **Projects**, Promo's Projects dashboard.
- **Anti Detect**, Promo's: browser profiles, proxies, phones and bans.
- **Carousels**, **Actors** and **Flow**, Video's.

The shell adds its own CRM link to the top of the first section and Admin to
its end, so the menu reads CRM, then Content's links, then Admin.

There is no entry for a network, commenting, or a project's research or
videos, which live inside a project, and none for a link between the three.
Research had its own link until 27 Nov 2026; the menu job takes it out of
every menu once (`CONTENT_OLD_ITEM_IDS`).
Video's templates are a panel inside the editor, so they have no entry either.

## The sample project

A new account gets one sample project the first time its Projects list is
read, and never again once it has a project (`src/server/content-app/sample.ts`).
Its name starts "Sample:".

- **Research:** Viral's sample, as it was: made-up found videos, one analysed
  video, ideas in the vault, and X and Reddit posts. Its screen
  says it is a sample and refuses to search.
- **Videos:** two videos with empty timelines, a draft and one ready.
- **Promote:** YouTube, Reddit and X, and on Reddit's Commenting three made-up
  posts under a keyword that is switched off.
- **Nothing in it can reach a network.** It has no account, no browser
  profile, no phone and no job, which are what Promo's workers pick up. A
  switched-off keyword is never searched, and a post is only commented on from
  an account. So the sample has no posts of its own either: a post needs an
  account to go from.

## Workers and the build

- **The website build** (`npm run build`) and **the worker build**
  (`npm run build:worker`) both pass. The worker's image needs FFmpeg and
  yt-dlp (`WORKER_PACKAGES`, the repo's `docs/deployment.md`), as Video's did.
  Promo's browser runs in its own `promo-browser` image, from `docker/browser/`
  (`npm run build:social-browser`).
- **The rack files** in `rack/` are written into
  `src/server/phones/rack-sources.gen.ts` by `npm run rack:sources`, which
  both builds read. Promo read them with Vite's `?raw`, which the worker's
  build can't read, so Promo's own worker build has failed since its phone
  work on 14 Oct 2026; Content's no longer does. After editing anything in
  `rack/`, run `npm run rack:sources`. `rack-sources.test.ts` fails until
  you do.
- **Nothing is deployed.** Content is not on any server yet.

## The links between Video, Promo and Viral

The three apps passed work to each other over the web, each with the other's
address and a key typed into Settings. In Content nothing is typed and nothing
leaves the app (`src/server/content-app/links.ts`, task Part 4):

- **Each part's address** is Content's own, under `/content-link/promo`,
  `/content-link/video` or `/content-link/viral`. The router serves nothing
  there; the path only says which part a call is for. Only an address at
  Content's own origin (`CUSTOM_SHELL_APP_URL`) counts: the same path on any
  other site is an ordinary outside address. So the worker, where Research's
  reads and Promo's copying run, needs the website's `CUSTOM_SHELL_APP_URL`
  (`docs/deployment.md`).
- **A call is handed straight to the part's function** in the same process by
  `linkFetch`, never sent over the network. So is a file one part fetches from
  another at Content's own address: an export Promo copies into its Archive,
  or a find Video copies onto a project's Media shelf. Each still gets a copy
  of its own, so emptying one side's bin never takes the other's file.
- **The answers are the three apps' own route handlers**, unchanged, grouped by
  the part that answers (`link-routes.ts`). Two parts answered the same path
  before (Video and Promo both answered Viral's `/api/connect/viral/hello`),
  so each part has its own list.
- **The keys are made by Content** for the app's owner, the first admin, and
  saved where each side kept them (`ensureContentLinks`). Every key check the
  three apps made still runs. The setup happens when a person starts
  something across two parts: Send to Promo, Send to Video, Research's reads
  of X, LinkedIn and Reddit, Write a post for Promo, and Promo asking the
  editor for a video. If Content's own address changes, the next of those
  sets the links up again.
- **Gone:** the 18 routes under `/api/connect/` the three apps answered on the
  web (the Project app's record card stays), the six Settings tabs that set
  an address and key, and the server functions only they used.
- **What a person sees:** Send to Promo lists the projects and puts a copy of
  the export in the project's Archive, and Send to Video lists the editor's
  projects, with no link to set up first. Research's reads of X, LinkedIn and
  Reddit go through the same link, but each still needs one of Promo's
  accounts on that network to read with, as it did before; the sample has
  none. The only message about
  setup left is for an app with no admin yet: "Content links its parts for its
  first admin. Sign in with an admin account and try again."

## Video, Promo and Viral retired

On 27 Nov 2026 the three came off the active list in the repo's `CLAUDE.md`
(Tyler, 26 Nov 2026: "Retire them", then "finish all parts"). Their folders
stay in the repo, read and never changed, and no shell merge goes into them.
Their live sites keep running until Tyler switches them off once Content is
live.

