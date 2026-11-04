# The folding menu

Every ⋮ and "+ Add" dropdown in every app is one component:
`src/components/shared/folding-menu.tsx`. It started on Travel's trip page,
drawn like Project's task menu, and moved into the shell on 3 Nov 2026 so all
apps look the same. Tyler: "we still need to have all apps to be standardize".

## What it is made of

- **`FoldingMenu`:** the dropdown itself. It is 294px wide when it has folding
  rows. With `fit` it is as wide as its longest row, at least 160px, for a
  menu of actions alone. `align="end"` opens it leftward from a ⋮ at the right
  of the screen, `align="start"` rightward. A tall menu scrolls inside the
  screen.
- **`MenuSection`:** one folding row: its name on the left, what it holds now
  in grey on the right, and an arrow that turns as it opens. The fields under
  it sit 16px from the menu's edge and save themselves. There is no Save
  button.
- **`useOpenSections`:** which folding rows are open. Each opens on its own.
- **`MenuLine`:** the one line, edge to edge, between the folding rows and the
  actions.
- **`MenuAction`:** an action under the line, such as Duplicate. `destructive`
  draws it red, for Delete, which always comes last.
- **Rows:** 32px tall at 13px, with no gap and no line between them.
- **Boxes opened from inside it** (selects, date pickers, the media library)
  don't close the menu.

## Where it is used

- **Travel:** the trip's ⋮, an activity's ⋮, the schedule's "+ Add" and the ⋮
  after its tabs.
- **Video:** the ⋮ in the editor's Thumbnail panel, holding How many to make,
  Picture model, Check it, Templates and Copy a style.
- **Every other app** has the file after its next shell merge, and draws a new
  ⋮ menu with it.

The UI standard's "The one dropdown look" says how it is laid out
(`.agents/skills/Ui-standards/SKILL.md`).
