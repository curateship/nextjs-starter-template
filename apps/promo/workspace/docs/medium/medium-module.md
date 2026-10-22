# The Medium module

Medium (medium.com, the blogging site) is a network a project can add, beside
Reddit, Instagram and TikTok. Picking its row in the project's left column fills
the middle and right columns with Medium's panels. It came from
`workspace/tasks/Medium/01-medium-features.md`, whose 42 parts Tyler picked on
21 Oct 2026.

## Tyler's answers, 21 Oct 2026

- **Browser first, phones last.** Medium runs in a browser profile, like
  Reddit. Medium on the rack's phones came last and does less
  ([Signing in and accounts](signing-in-and-accounts.md#on-a-phone)).
- **Keywords are "Tags and search words".** A keyword is a Medium tag or the
  words a reader would search for. A publication or a writer can be watched
  too.
- **A response is "Up to 600 characters".**
- **A response names the product "Only when the story asks for it".** The AI
  is told: "Name the product only when the story is about a problem the product
  solves. Otherwise just help, and do not mention the product at all."
- **Articles are "800 to 1,200 words".**
- **Publish "goes live on Medium"**, in the account's waking hours, tried once.
- **"Never label them".** Articles carry no AI label. Medium's rules ask that
  AI-written stories say so, and Medium can limit a story or an account it
  decides is AI-written and unlabelled. Tyler chose no label knowing that.
- **"No limit"** on articles per account. Only the warm-up and the young-account
  pace apply.
- **A new Medium account warms up for "7 days".**
- **A young account's pace is the "Same as Reddit"**: 2 an hour and 6 a day for
  its first 90 days, the numbers in Settings → Behaviour.
- **The too-similar check "Refuse it".** Post is refused and the other account's
  piece is named.
- **"Any Medium account, always"** may publish articles. The first answer was
  important accounts only. Important accounts run on phones only, and Medium
  started in the browser, so the question was asked again.

## The layout

- **The header** of the middle column: "Medium" on the left, and on the right
  the search box on the story tabs, the keywords dropdown, Jobs, and More. More
  holds Search every keyword now, Tag and publication ideas, Medium's AI this
  month, and the writers and publications you hid.
- **Seven tabs** sit under it: To look at, Replied, Skipped, Today, Responses,
  Articles and Publications. The tab is in the address as `?tab=` (none is To
  look at), and whatever is open in the right column as `?open=<id>`.
- **The right column** shows what is open: a story and the response to it, a
  sent response, an article, or a publication.
- **The Medium row in the left column** carries a count: the strong stories
  waiting plus the responses people wrote to you that nobody has answered. It
  also has its own pause button.

## Keywords

A keyword belongs to one project, so every Medium account in the project sees
the same stories. There are four kinds:

- **Tag.** Stored the way Medium writes it in an address: "Project Management"
  is `project-management`. Its newest stories come from Medium's public feed,
  `medium.com/feed/tag/<tag>`, which holds ten.
- **Search words.** Run through Medium's search page in the reader browser, which
  shows ten.
- **Publication** and **writer**, watched. Their newest stories come from their
  own feeds, `medium.com/feed/<publication>` and `medium.com/feed/@<writer>`.
  An address can be pasted: `medium.com/better-programming` is stored as
  `better-programming`.

Search words can be marked as **Names you** (the product's own name) or **Names a
rival**. Stories found by a marked keyword carry a chip and score twice as high,
since that conversation is already about you.

The keywords are the same dropdown as Reddit's
([The keywords dropdown](../projects-dashboard.md#the-keywords-dropdown)). All
keywords counts each story waiting once, though two keywords found it. A
keyword's row says when it last searched and its kind ("2 hours ago · tag"),
with the timer switch (searches by itself every few hours), search again now,
and a "⋮" with the mark (search words only) and Remove. Add keyword turns the
list into the kind and its box.
Removing a keyword deletes the stories only it found. A response already sent
keeps its own record of the story's title and address.

**Tag and publication ideas** asks the AI for tags, search words and
publications from the project's description. A publication idea goes to the
Publications tab.

## Finding stories

Every story a keyword finds is read once more from Medium's own data
(`/p/<id>?format=json`), which brings its writer, their followers, its
publication, its tags, its claps, how many responses it has, and its words, in
one answer. [How Medium is read](how-medium-is-read.md) has the addresses.

- **A story found by two keywords is one row**, named under both. Skipping it
  skips it under both.
- **A search never undoes a decision.** A story skipped or responded to stays
  that way however often it turns up again. Its figures are updated.
- **Members-only stories** show a lock. A stranger reads only their opening, so
  the AI answers that opening.
- **Searching again by itself.** Every switched-on Medium keyword is searched
  again once its last search is the hours set in Settings → Behaviour old, while
  the reader is awake, the same as Reddit's.

### The order

The list is grouped under Strong fit, Possible and Low fit, the same words as
Reddit's, and the score itself is never shown. A row's tooltip says why it is
where it is. The score is in `src/server/social/medium/rank.ts`:

    rank = relevance × freshness × room × reach × named × 10

- **Relevance:** the first story keeps all of it, the tenth half.
- **Freshness lasts longer than Reddit's.** A story is read through its tags for
  weeks, so it is full for 3 days, 0.6 for two weeks, 0.3 for two months.
- **Room:** at 10 responses a story keeps half. Medium shows every response
  beside the story, so the tenth is still on screen.
- **Reach:** the writer's followers. A writer nobody follows counts half, 100
  followers 0.9, 1,000 1.1, 10,000 1.3. Measured on 21 Oct 2026 against the tags
  toronto and food and the words "best restaurants in toronto": 14 of the 27
  stories were by writers with 0 followers, most of them pages selling food
  labels and bus hire. Counting them at 1 made 10 of them Strong fit. Counting
  them at half left 2 Strong fits, by writers with 181 and 1,942 followers.
- **Named:** a marked keyword's stories count twice.

Strong fit starts at 6 and Possible at 2. A story a week old with 3 responses by
a writer with 200 followers scores about 3.

## Hiding a writer or a publication

The crossed-out eye on a row hides its writer or its publication from every
list, across every keyword and project, until it is shown again from More. The
stories stay stored, so showing one again brings them back.

## Old stories tidied away

Stories nobody answered that no search has seen for the tidy-up days are
deleted, a few hundred a pass. It is the same number Reddit's tidy-up uses, in
Settings, 30 days to begin with and 0 for never. A story with a response or a
draft against it is never touched.

## Today

The Today tab lists the ten strongest stories waiting, and every response people
wrote under yours or under your articles that nobody has answered from Promo.
Clicking a story opens it on To look at; clicking a response opens the Responses
or Articles tab with it open.

## Pausing Medium alone

The pause button on the Medium row (on every network's row) pauses that network
on this project only. Its accounts send nothing and do not warm up; the
project's Reddit, Instagram and TikTok accounts keep running. A response pressed
before the pause waits. The project's paused networks are
`promo_projects.paused_networks`, and an account's pause says "network"
(`src/server/social/pause.ts`).

## What a guest from Project sees

Nothing. A guest sent from Project does not work Medium, because feature 50 was
not picked. The module says Medium is worked by the project's owner.

## Where the code is

- `src/server/social/medium/`: the tables (`schema.ts`), keywords, search,
  ranking, finds, posting, drafts, responses, articles, publications, lists, the
  cover, the spend, the warm-up, the upkeep, the module's one read
  (`module.ts`), and the job handlers (`run.ts`).
- `src/lib/social/medium/`: the limits and words both halves read.
- `src/lib/api/social/medium.ts`: the endpoints, admin only.
- `src/components/social/medium/`: the module and its panels.
- `docker/browser/routines/medium.py`: the only file that knows how a Medium
  page is put together. Its phone twin is the Medium part of
  `rack/promo_rack.py`.
- The tables are added by `drizzle/0124_promo_medium.sql`.
