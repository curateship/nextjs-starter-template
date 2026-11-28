# Hooks and Formats

Tyler, 4 Nov 2026: "One Library page", with Hooks and Formats. In Content
they are two tabs of the Projects dashboard's Viral row
(`viral-dashboard.md`): they show every project's, the list is in the middle on the shell's table, and the open hook
or format is on the right in the shell's record frame
(`src/components/viral/dashboard/sections/hooks-section.tsx` and
`formats-section.tsx`).

## Hooks

- **What it lists.** Two kinds of hook, newest first (`listLibraryHooks` in
  `src/server/viral/library.ts`):
  - The opening line of every video Analyse with AI has written about,
    across all your projects. The line is the transcript said or shown while
    the hook part runs, the same words as a project's Hooks tab.
  - Your own hooks, typed in with "+ New hook" (see "Your own hook" below).
- **One row per video.** A video analysed in two projects is one row naming
  both, the latest first. Picking a project on the left keeps the hooks that
  project analysed. Your own hooks belong to no project, so they show under
  All projects only.
- **Each row.** The cover (or a quote mark for your own), the words, the
  project, channel and views, then the type as a chip and up to three tags.
- **Tags.** Your own tags, from the same list the vault uses, saved as they
  change (`viral_hook_tags` for a video's hook, `viral_own_hook_tags` for
  yours). Filter has Tag.
- **Search, Filter and Views.** The search looks in the hook's words, the
  title, the channel and your hook's link. Filter has Tag and Type. Views are
  the shell's saved views, kind `viral-library`, keeping the search, the tag,
  the type and the project. A view whose type has since been deleted opens
  without it and says so.
- **The right panel.** The words with Copy and the type, the tags, Write
  hooks like this, and the hooks written from it. A video's hook also has
  its cover, its timecode, a Details card (views, whether it is a winner, the
  projects that analysed it) and Open in the project, in the footer and the
  ⋮, which plays the video on that project's page from the hook's first
  moment. A long project name cuts short with "…" inside that button. Your own
  hook has its link instead, and no Open in the project, because there is no
  video.
- **The Tags card** says Tags once: the box inside it has no label of its own
  on screen, only one a screen reader reads (`TagField`'s `inTagsCard`).

## Hook types

Tyler, 6 Nov 2026: "Fixed + my own" and "Label old ones too". Every hook can
have one type (`src/lib/viral/hook-types.ts`, `src/server/viral/hook-types.ts`).

- **The fixed types.** Question, mistake, list, bold claim, story, shocking
  number and how-to. Everyone has these.
- **Your own types.** Settings → Hook types adds more, such as "Callback". A
  name already on the list, fixed or yours, is refused, and you can have up
  to 30. There is no Save button: Add adds it at once.
- **Deleting one of yours.** It asks first, then the hooks of that type go
  back to no type. The database does this itself: a fixed type is kept in
  `hook_type` and one of yours in `hook_type_id`, whose key to
  `viral_hook_types` is set back to empty when the type goes.
- **New analyses name it for free.** The "Why it works" call is also asked
  which type the hook is, from the fixed list and yours, so no extra call
  runs. An answer that isn't on the list is ignored and the hook stays
  without a type. The newest analysis of a video wins.
- **Old hooks: the Label button.** Settings → Hook types has a "Label old
  hooks" card. It says how many hooks have no type, and what labelling them
  costs with the writer's name, such as "about 1 cent with Gemini Flash".
  Pressing "Label 34 hooks" sends the words of 25 hooks to a call, four calls
  at a time, up to 200 hooks a press (`labelOldHooks`). Each call's labels are
  kept as it answers, so one failed call loses only its own 25.
- **Why a button and not a background job.** Every other AI cost in Viral is
  shown before it runs, and a button can't start spending on a developer's
  machine by itself. Tyler asked for a one-off pass, and a button that
  disappears once every hook has a type is exactly that.
- **The sample.** Its made-up hook comes with the type "mistake" when the
  sample is made, and any video whose id starts `sample-` is never sent to
  the AI.
- **Winners per type.** Filter's Type list shows how many winners each type
  has, such as "Mistake 3 winners". A winner is the same as on the Sounds
  tab: the Outlier badge (twice the channel's usual or more) or a score of 70
  or more (`isWinner` in `src/lib/viral/sounds.ts`). Your own hook has no
  numbers, so it is never a winner.

## Your own hook

Tyler, 6 Nov 2026: "Words, link, tags". "+ New hook" sits last in the Hooks
tab's header and opens the usual New dropdown
(`src/components/viral/library-own-hook.tsx`, `src/server/viral/own-hooks.ts`).

- **What it holds.** The words, an optional link to where you heard it, a
  type, and your tags. The link is kept only when it starts with http:// or
  https://; anything else is refused with that sentence, so nothing is
  dropped quietly.
- **Its type is yours to pick.** The dropdown has a Type list, the fixed
  types and yours, starting on No type. Saving never waits on an AI, so it
  never fails for want of a key. A hook left on No type is counted by the
  Label button on Settings → Hook types and named there. This was the
  agent's call, not Tyler's.
- **Whose it is.** Yours, like a format, not one project's.
- **Edit and delete.** The ⋮ on its right panel has Words, Link and Type,
  each saving as it changes, then Copy the hook, then Delete hook in red.
  Delete asks first, because the hooks written from it go too.

## Write hooks like this

Tyler, 6 Nov 2026: "Kept under the hook". On any hook's right panel, an
analysed video's or your own (`src/components/viral/library-hook-ideas.tsx`,
`src/server/viral/hook-ideas.ts`).

- **The project.** A picker that starts as the project picked on the left,
  and moves when another is picked there with the hook still open, the way a
  format's does. Samples are left out.
- **The press.** "Write 5 hooks" asks the writer picked on Settings → AI
  writer for five new hooks in the same style, for the project's topic. The
  price is on the button, "Write 5 hooks · about 1¢", as the editor's AI
  buttons carry theirs ([price-before-you-press.md](price-before-you-press.md));
  in the card's title it was cut to "Ab…" in a narrow panel. The title names
  the writer, and the button wraps rather than running past the panel's edge.
  It is about 1 cent with any of the three writers. It
  goes on the AI meter as `viral_hook_ideas` and counts against the
  project's spend limit.
- **Refused.** A sample project, and a project with no topic, before the AI
  is asked.
- **Kept.** Every press is kept under the hook, newest first, with the
  project and the day, and each of the five has its own Copy
  (`viral_hook_ideas`). Deleting your own hook deletes them; so does deleting
  the saved video a video's hook came from.

## Formats

- **Saving one.** Save format sits under the script of every analysis, on the
  right panel and on a vault idea. It keeps the script's parts in order, each
  with its length and what the matching part of "Why it works" says it does
  (`formatFromAnalysis` in `src/lib/viral/formats.ts`). It is named by its
  parts, such as "Hook, Problem, Solution, The ask", and can be renamed in the
  ⋮.
- **Whose it is.** A format is yours, not one project's, so one saved in one
  project writes scripts in all of them.
- **Write a script.** The format's panel asks for the project it is written
  for, which starts as the project picked on the left and moves when another
  project is picked there with the format still open, and one line saying
  what the video is about. One call to the writer picked on Settings → AI
  writer (`ai-analysis.md`) writes a script in that structure
  for the project's topic (`writeFromFormat` in
  `src/server/viral/formats.ts`). Its button carries the price, "Write · about
  1¢", and the card's title names the writer.
- **Refused.** A sample project, a project with no topic, and an empty idea,
  before the AI is asked. A script that comes back missing a part of the
  format is refused, as Analyse refuses one.
- **The cost.** About 1 cent a script with Gemini Flash or GPT-5 mini, 3
  cents with Claude Opus 5. The card shows it first with the writer's name,
  such as "About 1 cent with Gemini Flash". It goes on the
  shell's AI meter as `viral_format_script` and counts against the project's
  spend limit.
- **The scripts.** Every script written from a format is kept under it, newest
  first, each with Copy. Deleting a format deletes its scripts.
- **The sample.** A new account's sample comes with one format, "Sample:
  mistake hook, three tips, the ask", given once however often the sample is
  made.

## Not proven

No real AI call has written a script from a format, written hooks, or
labelled a hook's type yet. The server tests stub the writer. The screens
have not been opened in a browser.
