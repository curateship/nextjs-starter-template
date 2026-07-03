# Personal IDE Architecture Overview

Personal IDE is a Tauri desktop app for editing local apps in isolated Git worktrees. The first real capability is local workspace files plus an editor. The rest of the app is becoming real piece by piece: terminals, tasks, skills, docs, Git changes, and sync.

## Goals

- Edit local app files from a compact desktop IDE.
- Keep each workspace isolated in its own Git worktree and branch.
- Let tasks, skills, docs, terminals, and Git state belong to the active workspace.
- Keep actions explicit. Task and skill shortcuts prepare terminal prompts; they do not run automatically.
- Avoid hiding real Git or file-system behavior behind fake state.

## App Shape

The app has three main panels:

- Left navigator: Tasks, Files, Skills, Docs, and Changes.
- Center editor: tabbed CodeMirror editor with save, diff preview, image paste, and dirty state.
- Right sidebar: workspace list and workspace actions.

The bottom bar is for pinned skill shortcuts and terminal input clearing. Hardcoded custom commands were removed.

Panels are resizable. Most visual chrome is intentionally flat: simple dividers, no heavy cards, no nested card layout.

## Frontend Stack

- React + TypeScript + Vite.
- Tailwind v4.
- Local shadcn/ui-style components.
- CodeMirror for text/code editing.
- xterm.js for terminal rendering.
- dnd-kit for pinned skill reordering.
- Tauri `invoke` for native commands.

The frontend must run inside the Tauri shell for native features. Opening the Vite frontend in a normal browser will break native calls because Tauri `invoke` is not available there.

## Native Backend

The Rust backend owns real local operations:

- Workspace creation and selection.
- Git worktree setup.
- File reads and writes.
- File/folder create, rename, duplicate, trash, reveal.
- Task, skill, and doc listing/creation.
- Git status, commit, sync, discard, and diff data.
- PTY terminal sessions.
- Opening local server URLs.

Paths are resolved and canonicalized in Rust. File browser operations stay inside the active workspace app root. The Changes panel can also open existing text files from the active worktree root when Git reports changes outside the selected app folder.

## Workspace Model

When a workspace is added:

1. The folder picker opens at the repo `apps` directory and the user picks an app folder.
2. Rust finds the Git root.
3. Rust creates a Git worktree in Personal IDE app data.
4. Rust creates an isolated branch named like `personal-ide/workspace-1`.
5. The selected app path is mapped into the matching folder inside the worktree.
6. Personal IDE creates:
   - `workspace/tasks`
   - `workspace/skills`
   - `workspace/docs`
7. Local env files are copied from the selected app folder into the worktree app folder:
   - `.env`
   - `.env.local`
   - `.env.development`
   - `.env.development.local`

Workspace rows show the app folder name as the main name. The generated workspace number stays as secondary metadata.

Workspace order is saved and user-controlled through drag and drop in the Workspaces sidebar. Generated server ports for unlisted web apps are assigned from that saved order.

When a new app is created:

1. The user enters a safe app folder name.
2. Rust resolves the repo's primary worktree from the Custom Shell scaffold and creates a Personal IDE worktree branch.
3. Rust copies the Custom Shell app into the new app path inside that worktree.
4. Local-only and generated scaffold folders such as `node_modules`, `.git`, `workspace`, and env files are skipped.
5. Rust rewrites generated metadata, including `package.json`, `README.md`, `AGENTS.md`, `vite.config.ts`, `.gitignore`, and local database bootstrap files.
6. Rust creates the initial generated-app commit scoped to that app folder.
7. The generated app is registered as a normal repo-backed workspace, so Sync uses the repo's existing `origin`.

Tauri apps are detected by `src-tauri`. They are labeled as desktop apps and do not show the normal web server URL/play control because they must be run through Tauri, not as a plain browser app.

## Workspace Removal

Workspace removal has two paths:

- Detach: removes the workspace from Personal IDE and closes its terminals. Files, branch, and worktree stay on disk.
- Delete: removes the worktree only if Git is clean. If there are uncommitted changes, the app refuses.

Delete does not delete the Git branch in V1.

## File Browser

Files are shown as a lazy expandable tree. The frontend stores relative paths only.
Loaded directories are silently refreshed while a workspace is active and the app is visible. The
Files header also has a manual refresh button for the workspace root.

Supported actions:

- Single click folder: expand/collapse.
- Single click file: open in editor.
- Double click: inline rename.
- Right click file/folder: New File, New Folder, Rename, Duplicate, Copy Relative Path, Reveal in Finder, Delete.
- Empty panel right click: New File, New Folder, Refresh.

Delete moves files/folders to OS Trash through Rust, not permanent deletion.

Creation uses inline inputs near the logical location instead of prompt dialogs.

## Editor

The editor uses CodeMirror with language detection and plaintext fallback.

Current behavior:

- Tabs open text files.
- The global Settings view opens as a synthetic editor tab.
- Existing open tabs are focused instead of duplicated.
- Dirty tabs show an indicator.
- Save writes the existing file through Rust.
- `Ctrl/Cmd-S` saves the active file.
- Closing a dirty tab asks for confirmation.
- Renaming a file updates matching open tabs.
- Deleting a file closes matching open tabs.
- Clicking changed files opens the file or diff view.
- Pasting an image into the editor saves the image into `workspace/docs/assets` and inserts Markdown like:
  ```md
  ![](workspace/docs/assets/pasted-image-123.png)
  ```

Binary files and oversized files are rejected with inline errors. File errors auto-clear after a few seconds.

## Tasks

Tasks are Markdown files in `workspace/tasks`.

Each task uses frontmatter as the source of truth:

```md
---
status: active
---

Task notes go here.
```

Statuses are dynamic. `active` is the default filter and means any task that is not `done`.
`done` is the only completed status with special UI behavior. Other frontmatter values such as
`in_progress` or `blocked` appear as filter choices.

Task rows open the task Markdown file in the editor. Starting a task pastes a plain-language prompt into the active terminal. It does not run automatically.

## Skills

Skills live in:

```text
workspace/skills/<skill-slug>/SKILL.md
```

The Skills panel lists local workspace skills and opens `SKILL.md` in the editor.

Skills can include a one-line `tags` field in `SKILL.md` frontmatter. The navigator filters by:
`define`, `plan`, `build`, `verify`, `review`, and `ship`.

Skill shortcuts can be pinned to the bottom bar. Pins are Personal IDE UI settings, not workspace files, so pinning/reordering does not create Git changes.

Pinned skills are stored per workspace in app-local settings. Clicking a pinned skill pastes:

```text
Use the {skill.name} skill from {skill.path}.
```

Pinned skill order can be changed with drag and drop.

## Docs

Docs live in `workspace/docs`.

The Docs panel lists Markdown files and opens them in the editor. Docs share the same right-click file actions as files, tasks, and skills where applicable.

## Terminal

Terminals use xterm.js in the frontend and a Rust PTY backend.

Terminal sessions are keyed by terminal id, not workspace id. Each session stores its owning workspace.

Behavior:

- Workspaces can have multiple terminals.
- Terminal tabs are in the top terminal bar.
- Tabs are plain text with an `x` close icon.
- Adding a terminal uses the current open count for display names, so if Terminal 2 is closed, the next one is Terminal 2 again.
- Closing a terminal kills its shell.
- Closing the last terminal leaves the terminal content area blank.
- Each terminal keeps up to 800 scrollback lines in memory.
- Task and skill prompts paste into the active terminal.
- If no terminal exists, prompt actions create Terminal 1 first.
- The Clear control clears active terminal input.

The terminal can still be visually fragile because PTY apps and shell redraw behavior are tricky. Resizing/fitting is handled by xterm fit logic.

## Server Helpers

For web apps, Personal IDE can start a dev server in a workspace terminal and open its localhost URL.

Known web apps use the fixed ports in `local-apps.json`. Web apps not listed there use the next compact generated ports after the highest fixed port, assigned by current workspace list order. Desktop/Tauri workspaces do not reserve ports, and deleted workspace numbers do not create port gaps.

For app folders inside a monorepo, the generated server command is:

```bash
test -d ../../node_modules || (cd ../.. && npm install)
cd ../.. && CORE_APP_ORIGINS="http://127.0.0.1:<port>,http://localhost:<port>" CUSTOM_SHELL_APP_ORIGINS="http://127.0.0.1:<port>,http://localhost:<port>" npm run dev --workspace="<package-name>" -- --port <port>
```

For standalone app repos, the generated server command is:

```bash
test -d node_modules || npm install
CORE_APP_ORIGINS="http://127.0.0.1:<port>,http://localhost:<port>" CUSTOM_SHELL_APP_ORIGINS="http://127.0.0.1:<port>,http://localhost:<port>" npm run dev -- --port <port>
```

`--host` was removed because Hub's Next dev command rejects it.

Tauri apps are not started through this web server helper.

Apps created from the Custom Shell scaffold are repo-backed workspaces. Their generated `vite.config.ts` defaults to port `3000`, and the Start Server helper passes the assigned workspace port at runtime.

Generated Custom Shell apps also get an ignored `.env.local` with local `CUSTOM_SHELL_APP_ORIGINS`, an app-named `CUSTOM_SHELL_DATABASE_URL`, an app-specific `CUSTOM_SHELL_POSTGRES_PORT`, app-branded login copy, and a `predev` database setup script. The setup script starts local Postgres with the app name as the Docker Compose project, creates the app database, applies copied SQL migrations, and seeds the local admin account before the dev server starts.

`CUSTOM_SHELL_DATABASE_URL` is the only supported database URL override for Custom Shell-derived apps. `DATABASE_URL` and alternate Postgres URL schemes are intentionally not supported.

## Git

Each workspace has an isolated branch.

The Changes panel shows real Git status for the whole active worktree repo. Files inside the selected app open as app-relative editor tabs. Text files outside the selected app, such as root config files, open as repo-relative editor tabs.

Repos without a remote named `origin` can still commit locally, but Sync requires `origin`. Generated apps must be created inside a repo that already has `origin`.

Deleting a workspace requires a clean worktree and no unpushed workspace commits. When those checks pass, Personal IDE stops compose services for the workspace app, then removes both the worktree and its local `personal-ide/workspace-*` branch so the workspace number can be reused.

Implemented actions:

- Refresh.
- Open changed file.
- Open diff preview for changed files.
- Discard file.
- Discard all.
- Commit.
- Sync.

Commit:

- Stages all changes.
- Creates a local commit on the workspace branch.

Sync:

- Refuses if the workspace has uncommitted files.
- Pushes the workspace branch.
- Checks out `develop` in the main repo.
- Pulls `origin/develop`.
- Merges the workspace branch into `develop`.
- Pushes `develop`.
- Fast-forwards the workspace branch to `develop`.
- Pushes the fast-forwarded workspace branch.
- Refreshes the Changes panel, open files, file tree, and workspace resources.

The Changes panel keeps preview sections for pending merge commits and develop updates. Sync is the only publish/update action and is enabled when there are unpushed workspace commits, workspace commits not merged into `develop`, or `develop` commits not yet in the workspace branch.

Preview counts:

- Pending merge means workspace branch commits not merged into local `develop`.
- Develop updates means `develop` commits not yet in the workspace branch.

## App Settings

Personal IDE stores app-only settings outside the project files. Current use:

- Pinned skill order per workspace.
- Global default task template.

These settings should not create Git changes.

## Known Constraints

- No PR flow yet.
- No task deletion UI yet outside file operations.
- No branch deletion when deleting a workspace.
- No full persistence for terminal tabs.
- No real agent execution yet.
- No automatic task execution.
- No merge conflict UI yet.
- Tauri apps must run through Tauri, not the browser-only Vite page.

## Useful Commands

From the repo root:

```bash
npm run dev:personal-ide
npm run build:personal-ide
```

From `apps/personal-ide`:

```bash
npm run dev
npm run tauri:dev
npm run tauri:build
npm run lint
```

`dev` is an alias for `tauri:dev`. `dev:frontend` is only for Tauri's internal Vite server and will not run the app by itself.
`tauri:dev` still compiles Rust before opening the desktop window. That is normal for Tauri development.
