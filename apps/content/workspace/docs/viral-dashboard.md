# Vault, Hooks and Formats

In Content these are the three rows of the Viral block on the Projects
dashboard's left page (`content-app.md`, "The Projects dashboard"; Tyler,
27 Nov 2026: "should be its own block called "Viral""), and the Viral block
on each project's page opens them. They were rows of Viral's own dashboard at
`/admin/viral`, which went on 27 Nov 2026 with its left page, Overview and
Projects row; a project's research is on its own page now.

Code: `src/components/viral/dashboard/sections/`, read by
`src/components/viral/dashboard/load-section.ts` and drawn by the Projects
dashboard (`projects-dashboard.tsx`). The address keys are in
`src/lib/viral/dashboard-search.ts`.

## Vault

Every project's saved ideas, or one project's when a saved view holds one
(`vault.md`; the Projects block that picked one went on 27 Nov 2026). The header holds "N selected", search, Select, Filter (Status,
Tag, and Show as List or Board) and Views, then New idea. The open idea is
on the right in the shell's record frame. Its ⋮ holds Status as a row, then
Open, Copy link, Download to computer, Copy to another project, and Delete
from the vault in red. Right-click an idea for Select and Delete.

## Hooks and Formats

Library → Hooks and Library → Formats became two rows (`library.md`), showing every project's.

- **Hooks:** every hook, or one project's when a saved view holds one. Filter holds Tag
  and Type; Views and New hook sit in the header. The open hook is on the
  right; its ⋮ copies it and opens it in a project, and your own hook's ⋮
  also holds Words, Link and Type as rows, and Delete hook.
- **Formats:** every saved format. The open format's project picker says
  which project Write a script writes for, starting on the person's first
  project. The open format's ⋮ holds Name and
  Delete format.
