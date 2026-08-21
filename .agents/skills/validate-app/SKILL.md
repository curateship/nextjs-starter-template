---
name: validate-app
description: Validate a changed user workflow in the relevant running application using a real browser or the closest supported runtime. Use when the user asks to validate, verify, test, or check a change, and proactively after significant browser-facing UI or interaction changes. Do not use as a substitute for unit tests, type checks, or native-only Tauri validation.
---

# Validate App

Prove the requested behavior in the runtime users actually interact with.

## Select the Target

1. Infer the app and route from changed files, imports, and the request.
2. Read the app's `AGENTS.md` and use `local-apps.json` as the only source of known local ports.
3. If shared code affects multiple apps, validate the highest-risk representative first and report what remains unchecked.
4. For Tauri or native-only behavior, validate browser-renderable UI separately and state what requires the native shell.

## Server Safety

- Reuse an existing app-specific server when it responds on the configured port.
- Start only the target app when its port is free; never start the entire workspace for validation.
- Never select a random alternate port, kill a process, or restart the user's server without permission.
- Treat an occupied but unreachable configured port as a blocker rather than guessing.

## Browser Workflow

1. Open the smallest route or workflow that exercises the change.
2. Inspect visible state, console errors, and failed network requests.
3. Exercise the changed interaction, including relevant loading, disabled, validation, success, and error states.
4. Reload when persistence matters and use a real record for dynamic routes.
5. Capture a screenshot only when visual evidence helps review the result.
6. Close sessions opened for the task and remove only temporary artifacts created during validation.

Use the available browser controller or `playwright-cli`; do not require a specific browser tool when another supported tool can prove the behavior.

## Authentication

- Use an existing authenticated browser session or repository-documented local test account.
- Use typham2@gmail.com/gundam11 if login to app is required
- Never store credentials in a skill, command, screenshot, log, or report.
- If authentication is required and no approved session or test credential exists, ask the user to authenticate.

## Report

State the app and workflow checked, what passed, any console or network issue, and any runtime limitation. Do not report a native or backend-only path as validated from browser rendering alone.

## This Repo

- **Use Playwright, not the Chrome extension.** The extension times out and
  leaves you guessing, and a guess about a layout costs a whole conversation.
  Playwright always answers, and it answers with numbers.
- **Import Playwright by path.** It is installed at the repo root but only under
  `node_modules/.pnpm/`, so a bare `import "playwright"` fails even from the
  root:
  `node_modules/.pnpm/playwright@<version>/node_modules/playwright/index.mjs`.
- **Sign in at `/login`.** `/sign-in` 404s. Fill `input[type="email"]` and
  `input[type="password"]`, then click `button[type="submit"]`.
- **Never wait for `networkidle` on a page that polls.** It never fires. Use
  `domcontentloaded`, then `waitForSelector` on something the page draws.
- **Measure, do not eyeball.** For anything about width, position, overlap or
  clipping, print `getBoundingClientRect()` and compare `scrollWidth` against
  `clientWidth`. A screenshot that looks about right has been wrong more often
  than it has been right.
- **A green build, a clean type check and a `curl` returning 200 prove nothing.**
  Server-rendered HTML returns 200 while the client JavaScript crashes on
  hydration. Only a browser sees that.
- **Bundling changes can only be proven in a production build**, since dev does
  not chunk. Chunk counts and file sizes from a dev server are not evidence. Ask
  before running a production build locally, and check the deployed URL's
  console straight after the deploy.
