# Pages with "/" blocks

A side panel in the Admin 3 panel design is a page you write on. Typing "/"
or right-clicking opens a list of blocks. The skill is
`.agents/skills/Design/admin-3-panel-design/SKILL.md`, and it says what such
a page looks like. This file says where the shell's pieces for it are, so an
app builds from them and does not copy them from Trade or Project.

They moved into the shell on 7 Nov 2026 for the CRM dashboard, copied from
Trade's `src/components/trade/notes/`. Trade's set was the newest, and it
already had the block card Tyler wanted ("we need to use trade's card design
though"). Every app gets them with its next shell merge. Trade, Travel and
Project still draw their own copies until each one moves over.

**A shell merge brings a package with it.** The Checklist block needs
`@tiptap/extension-list` (^3.28.0, the version of the shell's other Tiptap
packages). An app without it in its `package.json` fails to build on
`note-block-nodes.ts`, so the merge adds the line and runs
`pnpm install --filter <app>`.

## The pieces

All of them are in `src/components/shared/notes/`, with their rules in
`src/lib/notes/`.

- **`saving-document.tsx`, `SavingDocument`.** The page. It is the shell's
  editor, with a toolbar over selected words only: pressing a block or placing
  the cursor never shows it (Tyler, 7 Nov 2026: "It should only show up on
  selecting a text"). It saves 700ms after typing
  stops, when the page is left, and when it closes. A click above the first
  block, or between two blocks, starts a new line there. `locked` shows the
  page at full strength and stops it taking any writing. `appBlocks` lists the
  app's own blocks. That list must not change while the page shows, because
  the editor is built once.
- **`note-block-nodes.ts`.** The basic blocks, the same in every app and in
  this order: Image, Video, Checklist, Callout, Divider, Fold section, Web
  page, Links. Two parts here help an app make its own blocks. `blockNode`
  makes an app block's editor node. `AppBlock` is its row in the "/" list.
- **`block-card.tsx`.** The card every app block draws in, Trade's style: a
  light grey block, its title on a band, and its contents on a tile the colour
  of the panel it sits on (white, or the panel grey in dark mode) 3px
  inside it. Pressing the title folds the card, and this browser remembers
  the fold. `blockView({ kind, title, icon, Draw })` makes an app block's
  view. `Draw` is the app's own component, and it reads its figures from a
  context of the app's own. `BlockHeadingActions` puts buttons in the
  heading, and `useBlockCount` puts a count beside the title. `BlockCard` on
  its own draws the same card outside a page, as the CRM's Contact card does.
- **`use-note-blocks.ts` and `note-blocks-menu.tsx`.** The "/" list. Basic
  blocks come first, then the app's under "Advanced blocks". An app block
  shows once per page. Picking it again only takes away the "/".
- **`tabbed-menu.tsx`, `pick-rows.tsx` and `page-rows.tsx`.** The tabbed ⋮
  and its grouped rows: `PickGroup`, `PickMenuRow` (one press picks),
  `PickDayRow` (a month that opens from the row, with Clear), and `PickRow` (a
  small box for a typed value). `CoverRow` and `LockRow` are the two rows
  every page's ⋮ holds. Project's `PickDayRow` also has quick days above its
  month. The shell's has the month alone, until a screen here needs the quick
  days.
- **`page-cover.tsx`, `PageCover`.** The cover photo, lying faintly behind
  the panel header.
- **`fold-heading.tsx`, `note-folds.ts`, `note-slash.ts` and
  `note-block-views.tsx`.** The folding heading, the Fold section's state,
  the "/" trigger, and how the basic blocks look.

## What a page may hold

`cleanNoteBody(value, appBlockTypes)` in `src/lib/notes/note-blocks.ts` keeps
what a page may hold and drops everything else. It runs in the editor on
every change and on the server on every save. Both must be handed the same
app block names: a block the server does not know is dropped on save.

`src/lib/notes/page-body.ts` reads a stored page back (`readPageBody`) and
works out what to store (`storedPageBody`). An app block keeps no values of
its own, only its name. It draws what the screen already knows.

## Adding a block to an app's page

The CRM is the worked example: `apps/shell/src/components/crm/crm-blocks.tsx`.

1. List the block's node name in one shared file that both the screen and the
   server read. The CRM's is `CRM_PAGE_BLOCK_TYPES` in
   `src/lib/crm/crm-page.ts`.
2. Write its `Draw` component, reading from the app's own context.
3. Make it with `blockNode(name, {}, blockView({ ... }))` and add it to the
   app's `AppBlock` list.
4. Pass the list to `SavingDocument` as `appBlocks`, and the node names to the
   server's `storedPageBody`.

## Which screens use them

- **The CRM's left page, `/admin/crm`**, since 7 Nov 2026, with the Emails,
  Follow up today and Stages blocks. The right panel's Contact card is a
  `BlockCard`.
