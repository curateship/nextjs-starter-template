# Courses

Courses are written guides. A course is a list of chapters, and a reader sees
the chapter list on the left and the chapter's words in the middle. Admins
write them at `/admin/courses`; readers find them at `/courses`.

Each course belongs to one site. `sites.md` says what that means, including
the Courses row a site's front page can show and Copy courses.

## Who decides what

Tyler made these calls on 17 Oct 2026, and they outrank the code:

- **"Opens after N days" counts from the first time a member opens the
  course.** Any page of the course counts, its intro included, and a chapter
  that is still held back counts too.
- **Questions under a chapter are seen by everyone who can read it**, with the
  admin's answer under each one.
- **Courses has a chapter editor of its own.** The shell's `DocumentEditor`
  takes no extra blocks, and changing it inside this app would fork a shell
  file.
- **Members land on `/courses` after signing in.** Settings → General settings
  → Member home page holds `/courses`. The shell has no option for a card on
  the member home page, so no code was written for one.

## The pages

| Address | What it is |
| --- | --- |
| `/admin/courses` | Every course on the site, in the shared table. The left menu link "Courses" points here. |
| `/admin/courses/<id>` | One course's editor: chapters on the left, the chapter being written in the middle, settings on the right. The middle also has the Questions and Stats tabs. |
| `/courses` | One card per published course, with "2 of 5 done" for a member who has started it. |
| `/courses/<course>` | The intro page: what the course covers, its chapters, and Start reading or Keep reading. |
| `/courses/<course>/<chapter>` | One chapter. |
| `/courses/saved` | The signed-in member's saved chapters. Somebody signed out is sent to sign in. |
| `/courses/to/<chapter id>` | Where a link to a chapter points. It looks up the chapter's address today and forwards there, so renaming a chapter never breaks a link to it. |

All the public ones follow the Courses page's own switch on the Pages screen.
Switch Courses off there and every one of them answers "not found".

## Who can read what

Each course has one setting: Everyone, Signed-in members, or Paying members.
A paying-members course can be narrowed to the plans ticked on it, and with
none ticked any paid plan opens it. A paused plan or one whose paid period
has run out does not count as paid.

On top of that, each chapter has three switches of its own:

- **Free preview** opens it to anyone, whatever the course says.
- **Opens after this many days** holds it back for each member, counted from
  their first visit. The chapter list shows "Opens Oct 19" beside it.
- **Goes live on** keeps a published chapter hidden until that moment, for
  everyone but an admin. No background job is needed: every read compares the
  time.

The rules live in one file, `src/lib/courses/course-access.ts`, and the
server asks them on every read. A locked chapter is sent with its title and
the way to unlock it, never its words. A quiz is sent without its right
answers; the server checks the answers.

A draft course and a draft chapter are seen only by admins. While a course or
chapter is still a draft and its address is still the one made from its name,
renaming it moves the address too. Once it is published, its address only
changes when an admin types a new one.

## Reading as a free member

An admin reading a course sees every chapter, drafts included, with a strip
across the top saying so. "Read as a free member" in that strip, or in the
editor's "Who can read it" card, adds `?preview=free` and shows exactly what a
signed-in member on the free plan sees, locks included. Nothing pressed in
that view is saved. Any other person adding `?preview=free` to an address
changes nothing, because the server only honours it for an admin. A draft
course answers "not found" in this view, because a free member cannot see a
draft; publish it first to check its locks.

## What a chapter can hold

Everything a written page can hold, plus these blocks, from the editor's Add a
block menu:

- **Picture** and **Video**, from the media library. A video can also be a
  YouTube link, kept as the video's id and played through
  `youtube-nocookie.com`.
- **Tip box** and **Watch out box**.
- **Prompt**, a grey box with a Copy button, for text readers paste somewhere else.
- **Table**, a plain grid of words.
- **Fold-out**, a "Show more" line readers open and shut.
- **Checklist**, steps each reader ticks off. Each member's ticks are saved, keyed by each
  item's own id, so editing the list never moves a tick onto another line.
- **Quiz.** The reader picks answers and presses Check answers; the server
  marks them and keeps them.

Checklist steps, quiz questions and each question's answers drag into a new
order by the grip on their left, the same handle the chapter list uses. The
right answer stays with its own words when the answers move.

The link button can also point at another chapter, of this course or any
other. `src/lib/courses/chapter-body.ts` is the one list of what a chapter may
hold, and the server drops anything else before saving.

## What members do

Signed-in members can mark a chapter done, save it to their Saved list, keep
private notes beside it, tick checklists, answer quizzes and ask questions.
Each of those checks the chapter is open to them first, so a locked chapter
cannot be written to by calling the server directly. A member can ask at most
10 questions an hour, because each one rings every admin's bell. The bell
names the site as well as the course, since every admin reaches every site.

When every chapter a member can see is marked done, the chapter page shows
"You finished" with a button to the next course on the site.

## Read aloud

The chapter's settings have a Read aloud card. "Make audio" reads the chapter
in an AI voice with the ElevenLabs key from Settings → AI, and costs about
$0.15 for every 1,000 characters; the card shows the chapter's own figure
before it is pressed. Audio is never made on its own. The file goes into the
media library like any other.

When the words change after the audio was made, readers stop seeing the play
button and the card says so, until the audio is made again.

## Questions and Stats

A new question puts a notice in every admin's bell. The editor's Questions
tab lists them, unanswered first; an answer saves when "Save answer" is
pressed, not as it is typed, because readers see it at once.

The Stats tab shows, for each chapter, how many members opened it, how many
marked it done, and how many stopped there. "Stopped here" counts members
whose last opened chapter is this one and who have not finished the course.
Nothing an admin reads is ever recorded, so admins never appear in these
numbers.

## Where the code is

Every file is this app's own; no shell file was changed.

- Tables: `src/server/courses/schema.ts`, `drizzle/0094_courses.sql`.
- Server: `src/server/courses/` (`courses.ts` for the admin, `reader.ts` for
  reading, `member.ts` for member actions, `course-admin.ts` for Questions and
  Stats, `audio.ts` for Read aloud).
- Server functions: `src/lib/api/courses/`. The four public ones are listed in
  `src/app/open-endpoints.ts` with the reason each may be called signed out.
- Screens: `src/components/courses/admin/` and `src/components/courses/public/`.
- Tests: `src/lib/courses/*.test.ts` and `src/server/courses/reader.test.ts`.

`src/routes/courses.page.ts` leaves out `source: "app"`, for the reason CMS's
`directory.page.ts` gives: the shell's page registry test refuses it.
