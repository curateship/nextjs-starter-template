# The LinkedIn module

LinkedIn is a network a project can add, beside Reddit, Instagram, TikTok,
Medium and X. Picking its row in the project's left column fills the middle
and right columns with LinkedIn's panels. It came from
`workspace/tasks/LinkedIn/01-linkedin-features.md`, whose 48 parts Tyler
picked on 22 Oct 2026.

## Tyler's answers, 22 Oct 2026

- **Both from the start.** A LinkedIn account runs in a browser profile or on
  a rack phone, picked when it is added ([LinkedIn accounts](accounts.md)).
- **A search-only LinkedIn account.** LinkedIn shows almost nothing to a
  visitor who is not signed in, so LinkedIn is read the way X is: through a
  spare account that never comments or posts
  ([Search accounts](search-accounts.md)).
- **Comments a day: "You set it, start at 20"** for a young account, in
  Settings → Behaviour.
- **Warm-up: 7 days**, counted from when Promo first saw the account signed
  in, because LinkedIn shows nobody when an account joined.
- **A comment names the product "Only when it solves the post".**
- **Never a link in a comment.** A post of your own carries its link in its
  first comment instead ([Posts of your own](posts.md#the-link-goes-in-the-first-comment)).
- **Connection requests a week: "You set it, start at 20".**
- **Posts leave To look at after 2 days.**
- **A search account's views a day: "You set it, start at 300".**
- **Watched people and pages are read every 30 minutes.**
- **Workday hours: weekdays, 8am to 6pm**, on the account's own clock. Tyler
  picked these fixed hours over a setting ([LinkedIn accounts](accounts.md#workday-hours)).
- **Too similar warns only**, as on X.
- **A connection note:** the AI writes it, and he can edit it before Send.
- **Requests waiting:** he ticks them and presses Accept, with the people the
  project sells to listed first.
- **A company page:** important accounts only. Important accounts run on
  phones, where the app can't speak as a page, so this waits on his next call
  ([Posts of your own](posts.md#as-a-company-page)).
- **Posts of your own:** any LinkedIn account past its warm-up.
- **Left out:** PDF slide posts, and Promo filling in the account's profile.

## The layout

- **The middle column** is the keyword row, the notices, then seven tabs: To
  look at, Commented, Skipped, Today, Comments, Posts and People. The tab is
  in the address as `?tab=` (none is To look at), the Comments tab's Failed
  list as `?list=failed`, and whatever is open in the right column as
  `?open=<id>`.
- **The right column** shows what is open: a post and the comment being
  written on it, a sent comment, or a post of your own being written. On the
  People tab it says that everything there happens in the middle column.
- **The LinkedIn row in the left column** carries a count: the strong posts
  waiting, the replies nobody has answered, and the connection requests
  waiting. It has its own pause button, as every network's row does.
- **The notices** say when LinkedIn is paused on the project, when there is
  no search account, when a search account rests for the day, how many views
  each has spent today, when the browser program is not running, and when
  LinkedIn is asking an account for the code it emailed.

While jobs wait and the browser program runs, the module reads its lists
again every 2 seconds. While the program is stopped it only looks every 10
seconds.

## Keywords

A keyword belongs to one project, so every LinkedIn account in the project
sees the same posts. There are four kinds:

- **Search words**, read from LinkedIn's post search sorted by newest.
- **A hashtag**, read from the hashtag's own page.
- **A watched person**, pasted as the address of their page (`/in/...`).
- **A watched company page**, pasted as its address (`/company/...`).

Search words can be marked as naming the product or a rival. A post found by
them goes to the top of the list with "Names you" or "Names a rival".
Search words and hashtags are searched again by themselves every 3 hours;
watched people and pages every 30 minutes. Each new post from someone
watched rings the bell once and lists first, but the posts their first read
finds ring nothing. The bell can be switched off per person or page.

**Ideas** asks the AI for search words, hashtags, people and pages from the
project's description. People and pages are shown only once a search
account has looked each one up on LinkedIn, because the AI names pages that
no longer exist.

## Who we sell to

The keyword row's ⋮ menu holds "Who we sell to": the job titles of the people
the project wants to reach, such as "founder" or "head of marketing". A
writer whose job title holds every word of one of them, in any order, counts
1.8 times in the ranking, and the row shows "Sells to: founder". The same
titles sort the People tab: requests and viewers the project sells to come
first. Up to 20 titles of 60 characters each.

## How the list is ordered

`src/server/social/linkedin/rank.ts`, copied in shape from X's:

    rank = place in the search * freshness * room * reach * named * buyer * 10

- **Freshness** keeps all of a post's score for its first 2 hours, then 75 out
  of 100 to 6 hours, 55 to 12, 35 to a day and 20 to 2 days. After 2 days the
  post leaves To look at.
- **Room** is how few comments it has. At 20 comments a post keeps half its
  score, at 60 a quarter, because LinkedIn folds most comments away.
- **Reach** grows with the number of digits of the writer's followers, the
  way Medium's does.
- **Named** counts twice; **buyer** 1.8 times.

The worked example, which is also a test: the second post in a search,
3 hours old, 5 comments, by a founder with 10,000 followers, when the
project sells to founders, scores 12.76. A watched person's or page's post is
listed above every searched one whatever its score.

## What never reaches To look at

- A post whose writer turned comments off, or limited them to connections.
- A bare repost with nothing added.
- A post older than 2 days. It stays stored, and typing words in the search
  box brings it back.
- Anything by a hidden person or page. Hide is on each post; the hidden list
  with Unhide is in the ⋮ menu.

Posts nobody answered are deleted after the tidy-up days in Settings →
Reddit, the same number every network uses.

## An account's own feed

A LinkedIn account in a browser reads its own home feed every 4 hours in its
workday. A feed post that holds one of the project's search words or
hashtags, or whose writer is someone the project sells to, joins To look at
with "From in/name's feed". Only that account may comment on it, since it
came from that account's connections.

## Today

The strongest posts waiting, the replies under the accounts' comments and
posts that nobody has answered, and how many connection requests wait on the
People tab.

## What LinkedIn costs in AI

The ⋮ menu shows this month's AI spend on LinkedIn for the project, in
dollars, split into comments, posts and newsletters, ideas, and connection
notes, and day by day for two weeks. It is read off the shell's own AI usage
record, which every LinkedIn AI call writes to with its project.
