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

- Try an existing authenticated browser state first.
- If the app needs a login, use the local test account
  `typham2@gmail.com` / `gundam11`.
- The local test credentials intentionally live in this skill. Do not repeat
  them in a shell command, screenshot, log, report, or tracked browser-state
  file.
- A failed or unavailable login does not automatically block validation. Follow the fallback workflow below.
- Ask the user to authenticate only when the changed behavior is itself about authentication, sessions, account permissions, or another condition that no fallback can reproduce.

## When the signed-in app is unavailable

Validate the changed behavior through the closest supported runtime instead of
handing the check to the user.

1. Prefer an existing browser-accessible test page, story, fixture, or harness
   that renders the real component. Do not add a temporary route just for the
   check.
2. Otherwise run the narrowest component or integration test that renders the
   changed UI and exercises the changed interaction. The test must assert the
   visible result and the relevant empty, error, or boundary state. A type check
   or a unit test of a helper alone is not a UI validation fallback.
3. Add or strengthen that component test when the current request authorizes
   implementation or audit fixes. Re-run it and confirm it fails when the
   requested behavior is absent.
4. Report which runtime proved the behavior. Mention unavailable signed-in
   browser coverage once as a limitation, without asking the user to repeat the
   check.

## Report

State the app and workflow checked, what passed, any console or network issue,
and the runtime used. Do not call a component test a browser check. Do not keep
repeating an authentication or environment limitation after a fallback has
proved the requested behavior.

## This Repo

- **Browse local apps as `http://localhost:<port>`**, using the port from
  `local-apps.json`. The servers listen on `::1`, and `localhost` resolves
  there — but the sign-in server fn checks the request's origin and rejects a
  bare `http://[::1]:<port>` host with "Invalid origin", which the login form
  swallows into the generic "We could not complete that request." message. A
  `curl` probe that must hit the raw socket may still use `[::1]`; the browser
  must not. Probing `127.0.0.1` can report that a running app is down.
- **Wait a moment after the login form appears before filling it.** Submitting
  before hydration does a native GET (the URL grows a bare `?`) and nothing
  happens.
- **Standalone Playwright is always the browser path in this repo.** Run it
  from the shell against the app's existing port. The optional in-app browser
  controller is unrelated. An empty controller browser list does not mean
  Playwright is unavailable and must never block validation. Do not initialize
  or inspect the browser controller before trying standalone Playwright here.
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
