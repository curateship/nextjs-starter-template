# Viral and the shell

Viral is a copy of `apps/shell`. Shell changes reach it by a merge from the shell's workspace, one way, as `docs/shell/shell-and-apps.md` explains. Each merge is recorded here.

## Shell merge, 5 November 2026

Every shell change up to 5 Nov is in Viral: 7 files replaced and 0 added, with nothing deleted. Each replaced file was first matched against every version of that file in the shell's history, and each was an unedited older shell copy.

**What arrived.**

- **The Overview's widget tabs follow Settings → Styling → Dashboard tabs.**
- **The dev server leaves `playwright-core` out of its start-up scan**, in `vite.config.ts`. That package's Mac add-on stopped the dev server starting.
- **The document editor takes an app's own `clean` rule**, so an app can add kinds of content to a document. Leaving it out keeps today's rules. See `docs/shell/document-editor.md`.

**No migration was new.** The shell has added none since 0097, and Viral already had every one.

**Kept as Viral's own.** `src/app/` stays Viral's own.
