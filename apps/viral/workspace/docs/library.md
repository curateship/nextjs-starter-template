# The Library page

Tyler, 4 Nov 2026: "One Library page". The Library entry in the left menu
opens `/admin/library`, with two tabs in the middle, Hooks and Formats. It is
drawn like the Vault page: your projects on the left with "All projects"
first, the list in the middle, and the open hook or format on the right
(`src/components/viral/library-page.tsx`, route
`src/routes/_authenticated/admin/library.tsx`).

## Hooks

- **What it lists.** The opening line of every video Analyse with AI has
  written about, across all your projects (`listLibraryHooks` in
  `src/server/viral/library.ts`). The line is the transcript said or shown
  while the hook part runs, the same words as a project's Hooks tab.
- **One row per video.** A video analysed in two projects is one row naming
  both, the latest first. Picking a project on the left keeps the hooks that
  project analysed.
- **Tags.** Your own tags, from the same list the vault uses, saved as they
  change (`viral_hook_tags`). Filter has Tag.
- **Search, Filter and Views.** The search looks in the hook's words, the
  title and the channel. Views are the shell's saved views, kind
  `viral-library`, keeping the search, the tag and the project.
- **The right panel.** The cover, the hook with Copy, the tags, and the
  projects that analysed it. Open in the project, in the footer and the ⋮,
  plays the video on that project's page from the hook's first moment.

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
  what the video is about. One Gemini call writes a script in that structure
  for the project's topic (`writeFromFormat` in
  `src/server/viral/formats.ts`).
- **Refused.** A sample project, a project with no topic, and an empty idea,
  before Gemini is asked. A script that comes back missing a part of the
  format is refused, as Analyse refuses one.
- **The cost.** About 1 cent a script, shown on the card first. It goes on the
  shell's AI meter as `viral_format_script` and counts against the project's
  spend limit.
- **The scripts.** Every script written from a format is kept under it, newest
  first, each with Copy. Deleting a format deletes its scripts.
- **The sample.** A new account's sample comes with one format, "Sample:
  mistake hook, three tips, the ask", given once however often the sample is
  made.

## Not proven

No real Gemini call has written a script from a format yet.
