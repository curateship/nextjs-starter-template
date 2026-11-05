# The vault

Every project has a vault of viral ideas, and the Vault page in the left menu
shows every project's vault in one place. Tyler, 4 Nov 2026: "Per project +
all-vault page", "Keep a downloaded copy", "Status and tags", "Vault replaces
them" (Video's Favourites). The code is `src/server/viral/vault.ts`.

## What an idea keeps

Save to vault on the right panel keeps everything below. Status starts at
Idea.

- **The video.** Viral's own downloaded copy, so it still plays after the
  creator deletes it.
- **The numbers.** Views, likes, comments, followers, length, posted date,
  score and Outlier, copied from when it was saved.
- **The analysis picked**, copied so a later analysis never changes it.
- **Your notes.**

Saving the same video to the same project again updates that idea instead of
adding a second one. The idea keeps the file and cover it already has, even
when its saved video was deleted in between and the new one has no file yet.

## The copy of the video

- **One file, two users.** The vault item points at the saved video's
  downloaded file in the shell's media library. `media-in-use.ts` keeps the
  file in storage while a saved video or a vault item points at it.
- **Deleting the original.** Deleting the search result or the saved video
  never stops an idea playing.
- **Saved before the download.** An idea saved before the download finished
  takes the file the moment it lands (`fillVaultCopies`).
- **Deleting the idea.** Deleting an idea deletes its file and its cover,
  once nothing else uses them.
- **Deleting the project.** A project's ideas go with it, and their files
  and covers are deleted the same way, once nothing else uses them
  (`discardVaultFiles` in `src/server/viral/vault.ts`).

## Status and tags

- **Statuses.** Idea, Scripted, Sent and Posted. You change them by hand,
  except Sent, which turns on by itself after Send to Video.
- **Tags.** Tags are free text, kept per person and offered as you type
  (`viral_tags`). "Hooks" and "hooks" are one tag, spelled the first way it
  was typed.
- **Mass select.** Press Mass select in a vault list's header, tick ideas,
  then open "N selected". It holds Set status first, then Add a tag (pick a
  tag already used, or type a new one), then Delete, then Clear selection.
  Delete asks first, because each idea takes its kept copy of the video with
  it. Each change is one request (`changeVaultItems`). The answer lists the
  ids changed, the ones already that way and the ones skipped with a reason,
  and the toast says it in one line: "2 ideas set to Posted, 1 was already
  set to Posted. 1 was no longer in the vault." (`src/lib/viral/vault-bulk.ts`).
  The menu is `src/components/viral/vault-selected-menu.tsx`, the same on the
  Vault page and on a project's vault.

## Where it shows

- **Per project.** The project's left panel has a Vault row with a count
  (`vault_count`). Picking it lists that project's ideas in the middle panel
  (`?view=vault`) and opens the first one on the right
  (`src/components/viral/vault-list.tsx`, `vault-item-panel.tsx`). A video
  already in the vault says "In vault · save again" under Analyse with AI,
  and saving again updates that idea.
- **The Vault page.** `/admin/vault`, the Vault entry in the left menu, is
  a three-column dashboard drawn like the project page
  (`src/components/viral/vault-page.tsx`, route
  `src/routes/_authenticated/admin/vault.tsx`).
  - **Left.** "All projects" first, then every project that isn't archived,
    each with how many ideas its vault holds. Picking one keeps the middle to
    it (`?project=`).
  - **Middle.** The ideas, newest first, with the project's name under each
    title while All projects is picked. The header holds "N selected", Mass
    select, search, Filter and Views. There is no + Add, because ideas only
    arrive from Save to vault.
  - **Filter.** Status and Tag, which combine: Posted with the tag "hooks"
    shows only ideas that are both (`filterVaultItems` in
    `src/lib/viral/vault-view.ts`). The search looks in the title, the
    channel and the notes. All of it lives in the address.
  - **Views.** Kind `viral-vault`, with no record. A view keeps the search,
    status, tag and project. A view whose project was deleted, or whose tag
    no idea carries any more, says so and opens without it.
  - **Right.** The open idea (`?open=`), the same panel a project's vault
    opens. The first idea shown opens on arrival and after picking a
    project, and the page goes back to where it was when opened from the
    left menu.
  - **Empty.** With no ideas anywhere, the middle says "Save a video to the
    vault from a project's right panel."
