# Video docs

This folder belongs to the Video app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

## What is in this folder

- [editor-chrome.md](editor-chrome.md) — which lines around the editor come from
  the shell, which ones the editor draws itself, and why it never hides a shell
  one.
- [clip-volume-and-speed.md](clip-volume-and-speed.md) — how loud and how fast
  one clip plays, why volume stops at full, and how a speed other than 1x
  changes every sum that turns clip time into file time.
- [media-addresses.md](media-addresses.md) — where the address of a picture or a
  clip comes from, and why every call that asks for one waits for the answer.

The AI tools, the credit ledger and the export and render path were built before
this folder existed, and none of them is written up.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
