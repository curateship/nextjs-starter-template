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
- Never store credentials in a skill, command, screenshot, log, or report.
- If authentication is required and no approved session or test credential exists, ask the user to authenticate.

## Report

State the app and workflow checked, what passed, any console or network issue, and any runtime limitation. Do not report a native or backend-only path as validated from browser rendering alone.
