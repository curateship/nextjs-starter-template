# The document editor

`DocumentEditor` in `src/components/shared/rich-text-editor.tsx` is the shell's
editor that keeps its own document instead of HTML. The front page's written
rows use it, and Travel uses it for every note.

## What a document may hold

- **By default, a written page's words:** paragraphs, headings 2 to 4, lists,
  quotes, bold, italic, strikethrough and links. `cleanWrittenPageBody` in
  `src/lib/pages/written-page-body.ts` keeps those and drops everything else,
  on every change.
- **An app may add behaviour** through the `extensions` prop, such as a list
  that opens on a key. Pass the same array every render.
- **An app may add kinds of content** only by passing its own rule as the
  `clean` prop, with the extensions that draw them. That rule must drop
  anything it doesn't know, the way `cleanWrittenPageBody` does, and it has
  to run on the server before the app saves as well, since a rule that only
  runs in the browser can be skipped.
- **Leaving `clean` out** keeps a written page's rules, so the front page and
  site search are unchanged.

Travel was the first app to add content this way, 5 Nov 2026, for its "/"
blocks: Image, Place, Video and Map (`apps/travel/workspace/docs/notes-and-blocks.md`).
Before that, an extension that added a new kind of node lost it on the next
save, because the cleaning dropped it from what was saved.
