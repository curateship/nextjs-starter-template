# Today, the home page

Today is the page Viral opens on. Tyler, 4 Nov 2026: "Viral's home page". It
answers "what's worth watching this morning?" across every project at once.
The route is `/admin/today`, the first entry in the left menu's Viral section.
Code: `src/components/viral/today-page.tsx` and `src/server/viral/today.ts`.

## Why it opens first

The shell's Home route setting (Settings → General) decides where an admin
lands. The left menu job (`src/server/viral/navigation.ts`) sets it to
`/admin/today` once, and only while nobody has picked a page. An admin who
picks another page later keeps it, and the job never sets it again. The same
job puts Today first in each left menu that already had the Viral section.

## The Today table

- **What it lists.** For each project that isn't archived, up to 5 videos
  that are either new to you or rising fast. They must pass the project's
  minimum score and minimum views. The best score comes first.
- **New to you.** A video counts while it still says New, meaning nobody
  has opened it yet (`finding-content.md`). Opening it takes it off Today,
  unless it is also rising.
- **Rising fast.** A video whose views at least doubled since the day
  before (`sorts-and-score.md`).
- **The columns.** Video, Score, Since yesterday, Outlier, Views and Posted.
  Each project is a heading row with a link to the project.
- **Clicking a row** opens that video in its project's right panel.
- **Empty.** With no projects, the table says to make one. With projects
  and nothing new or rising, it says the daily re-check finds new videos
  overnight.

## Search every project

The search box in the Today table's header looks through every project at
once. The words stay in the address (`?q=`), so Back returns to the same
search.

- **What it reads.** Titles and channel names of the keyword searches'
  results and the followed creators' posts. Archived projects are left out.
  Transcripts are not searched.
- **What it shows.** Up to 50 videos, grouped under their project, most
  viewed first. Clicking one opens it in its project.
- **Typed `%` or `_`** means the character itself, not "anything".

## The Vault table

One row per project with ideas in its vault, and how many sit at Idea,
Scripted, Sent and Posted. Clicking a row opens the Vault page kept to that
project (`vault.md`).

## The sample project

The sample shows on Today like any project, marked Sample. Its made-up
videos have made-up daily figures, so three of them show as rising.

## Cost

Today never calls YouTube or an AI. It reads what the searches and creator
reads already saved.
