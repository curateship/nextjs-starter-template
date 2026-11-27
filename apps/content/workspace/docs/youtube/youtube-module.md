# YouTube

YouTube is Promo's eighth network: a project's channels upload videos and
Shorts from the Archive, the AI writes their titles, descriptions and tags,
and Promo reads each channel's numbers and the comments under its videos
once a day. The task is `workspace/tasks/YouTube/01-youtube-features.md`.

## Tyler's answers, 26 Nov 2026

These outrank the code.

- **"Both from the start."** A channel runs in a browser profile or on a rack
  phone, picked when it is added. An important channel still runs on a phone
  only.
- **"Start at 3 a day."** Each channel may upload 3 videos a day, Shorts
  included, his to change in Settings → Behaviour.
- **"I want to have discription templates so we can use similiar structure
  every time for certain video."** Templates are "Inside each project", and
  each is "A list of sections".
- **"A tick on each upload."** YouTube's question about altered or synthetic
  content is a tick in New post, off to begin with.
- **"Once a day."** A channel in a browser has its comments read once a day.
- **"Three to pick from."** Write offers three titles.
- **"Never a link."** An answer to a comment under a video never carries one.
- **"Yes, from the phone too."** A channel on a phone uploads long videos as
  well as Shorts.

Chosen by the task file, and his to change: every upload goes up Public and
"No, it's not made for kids".

## Where it is

A project adds YouTube from Add network, as any network. YouTube has a Posts
row and no Commenting row: finding other people's videos to comment on was
not picked.

- **Middle column:** two tabs. **Posts** lists every video and Short the
  project uploaded: its title, a Short or video mark, the channel, the status,
  the views, likes and comments, and when it went up. **Comments** lists what
  people wrote under them (`?view=comments`).
- **The middle header** is the project's one header (`list-header.md`): the
  project's controls, "YouTube" and the list dropdown (Posts, Comments,
  Voices, Accounts), then **New post** and the project's ⋮. **Jobs** is an
  action on the ⋮'s General tab, and the description templates are its
  **Templates** tab (Tyler, 27 Nov 2026: "Move jobs button here", and of the
  templates button, "This should be in here").
- **Right column:** New YouTube video, or an open comment with its answer box
  (`?comment=<id>`).
- **Tables fold** the channel and the date into the line under the title when
  the column is narrower than 56rem, as Instagram's do.
- **A guest** sent from Project sees the module and answers comments. Uploads
  and templates are the owner's.

## New post

From top to bottom:

1. **The video.** From archive lists the project's videos, with a draft
   ticked for YouTube in Video's send window first. The media library picker
   takes a video too. A pick from the Archive says "Goes up as a Short" or
   "Goes up as a video".
2. **What the video is about.** A line or two for the AI, never posted.
3. **Description template.** No template, or one of the project's.
4. **Write title and description.** Three titles to pick from as buttons, the
   description and the tags, in the picked channel's voice.
5. **Title, Description, Tags.** Each with its count: 100 characters, 5,000
   characters, and 500 for every tag together with a comma between each.
   Tags are typed with commas; a repeat or a # is dropped.
6. **Thumbnail.** A JPEG or PNG from the media library, or Thumbnail from
   archive, which lists the project's pictures only. Hidden for a Short.
7. **AI-made or altered.** The tick, off to begin with.
8. **Post as.** The channel dropdown, with Add to this project and Manage
   accounts.
9. **Upload** (Upload from phone for a phone channel).

Nothing is sent until Upload is pressed, and only what is in the boxes then
goes out. The AI's own first title and description are kept beside what went
out.

### A Short

A Short is a tall or square video of three minutes or less. Promo reads both
off the Archive item and says so in New post; YouTube decides it from the file
itself. A video from the media library has no size Promo can read, so it goes
up as a video. A Short takes no thumbnail.

### What Post refuses

Each refusal names what to do, and nothing is queued.

- No channel picked, no video, or a file that is not one of the person's own.
- A file YouTube cannot take: MP4, MOV, WebM, AVI and MKV only.
- A missing title, a title over 100 characters, `<` or `>` anywhere, a
  description over 5,000 characters, a tag over 100, tags over 500.
- A thumbnail that is not a JPEG or PNG of the person's own.
- A channel that is retired, stopped by a ban screen, paused (itself, its
  project, YouTube on its project, or the app-wide brake), on no browser
  profile or phone, or never read signed in.
- A channel on an iPhone. YouTube's phone steps are Android only.
- A phone step the daily self-test found broken.
- The uploads a day: 3 to begin with. Uploads on their way count. At half
  pace after a ban nearby, half that number.
- Throwaway first (Bans task, part 22): an important channel's first long
  video, or first Short, waits until a throwaway channel's upload of that
  kind has stayed up 24 hours.
- The same video and title already on its way from the same channel.

### The upload

One `youtube_upload` job, tried once and never again, because a browser or
phone that stopped part-way may already have uploaded it.

- **In a browser:** YouTube Studio's upload window. The file is downloaded
  from Promo's own https address only, up to 5 GB. The title and tags are
  typed at a person's pace and the description put in a paragraph at a time.
  Then the thumbnail, not made for kids, the AI question, Public, and Save
  once YouTube says the file is in.
- **On a phone:** the file is streamed to the rack, put in the phone's camera
  folder and handed to the YouTube app's share screen. The title, the
  description, not made for kids, the AI question and Public, then Upload.
  The whole upload has 36 minutes, and the phone keeps the file until YouTube
  says it is in.
  The app sets no thumbnail and no tags at upload, so a thumbnail asked for
  comes back as not set. YouTube makes a tall short video a Short by itself.
- **Done:** the video's link off YouTube, the row turns Posted, and the
  Archive item's Posted list shows it.
- **Thumbnail not set:** YouTube lets only a channel verified with a phone
  number set its own thumbnail. The video still goes up, and its row says
  "Thumbnail not set" with YouTube's words.
- **Failed:** the row says why, and the bell rings "Did not go out: a YouTube
  upload", opening the project's YouTube. The number on the YouTube row
  counts failed uploads.
- **Abandoned:** an upload still running after 60 minutes counts as
  abandoned, and is failed with "It may already be on YouTube" so a person
  looks before sending again.
- **Call off:** an upload that has not started can be called off from its
  row, or several from the ticked rows.

## Description templates

The ⋮'s Templates tab lists them, each with its number of sections, and New
template; each opens a window (`?window=templates`) listing the project's
templates. A template is a name and a list of sections in order. Each section
has a name and is **Fixed words** or **AI writes it**.

- **Fixed words** are copied into the description word for word, by Promo and
  never by the AI.
- **AI writes it** holds a short note on what belongs there, which is never
  posted. Write has the AI write only these sections, in order.
- **The description** is the sections in order with a blank line between
  them.
- **New template** starts from Hook and What it covers, both AI, and a fixed
  Sign-off.
- **Saving:** every change saves itself 700ms after the last letter. A
  section with no name, or fixed words with no words, is marked and waits
  until it has them.
- **Order:** templates and sections move by their handles.
- **Delete** asks first, because it cannot be brought back. Videos already
  written with a template keep their descriptions.
- **Duplicate a project** does not copy its templates.

## The daily reading

Once a day per signed-in channel, inside its waking hours, the upkeep asks
for a `youtube_health` job: its subscribers, how many videos it has, and the
views, likes and comments of the 20 newest videos Promo uploaded. The numbers
show on the Posts tab, on the channel's record on the Accounts section, in
the Archive's Most viewed sort and in Overview's Results.

Check now on the Accounts section asks for the reading at once, and in a
browser reads who the channel is signed in as too.

## Comments under videos

- **A channel in a browser** has the newest comments under its videos read in
  the daily reading's visit.
- **A channel on a phone** has them read when YouTube's notification says
  someone commented.
- **Each new comment** rings the bell's "New comment on a post by" notice and
  opens on the Comments tab with Write a suggestion and Send, as Instagram's
  do. The AI is told it is answering under a video and never to put a link
  in.
- **Send refuses a link**, written any common way, before anything is sent.
- **YouTube has no direct messages**, so a YouTube channel is never on the
  Messages section.

## Ban screens

A strike, a terminated channel, a disabled account or Google's "verify it's
you" page stops the channel at once, in a browser or on a phone, and rings
the bell. Its waiting jobs are dropped, and a waiting upload reads as failed.
The rest is the Bans task's, in [Bans](../bans.md).

## The channel's status

A YouTube channel has no warm-up. It is Banned once a ban screen stopped it,
Working when it uploaded in the last week, and Ready otherwise.

## Where the code is

| What | Where |
| --- | --- |
| The tables | `src/server/social/youtube/schema.ts`, from `drizzle/0243_promo_youtube.sql` |
| Limits, words, Short, links | `src/lib/social/youtube/options.ts` |
| Post's checks, the upload, the list | `src/server/social/youtube/uploads.ts` |
| Titles, descriptions, templates filled | `src/server/social/youtube/drafts.ts` |
| Templates | `src/server/social/youtube/templates.ts` |
| The reading, sign-in, the jobs | `src/server/social/youtube/run.ts` |
| Once a day | `src/server/social/youtube/upkeep.ts`, ticker `promo-youtube` |
| Uploads a day | `src/server/social/youtube/settings.ts` |
| The module's one read | `src/server/social/youtube/module.ts` |
| Endpoints | `src/lib/api/social/youtube.ts` |
| The screens | `src/components/social/youtube/` |
| The browser | `docker/browser/routines/youtube.py` |
| The phone | the YouTube part of `rack/promo_rack.py` |

[How YouTube is run](how-youtube-is-run.md) has the browser and phone steps
and what has been proved.
