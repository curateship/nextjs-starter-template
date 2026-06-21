---
name: validate-live
description: Validates code changes by opening the relevant app in a real browser and checking that the changed page or workflow works. Trigger when the user says "validate", "check it", "test it", "does it work", or "verify". Also trigger proactively after significant browser-facing changes such as new components, layout changes, form changes, and bug fixes. Use for live browser validation across any app in this monorepo, not unit tests or linting.
---

# Validate UI Changes

## Communication

Always explain things in plain English. Start with the user-visible meaning, define necessary technical terms briefly, and avoid unexplained jargon before naming files, APIs, commands, or implementation details.
When triggered with "validate live", open a real browser and verify the relevant app behaves as intended.

## Pick The Target App

Determine the app from the changed files or the user's request.

- For paths like `apps/<app>/...`, target `<app>`.
- For shared packages or services, identify the app that imports the changed code. If unclear, inspect references with `rg` and choose the app most directly affected.
- If multiple apps are affected, validate the highest-risk app first and tell the user which additional apps still need checking.
- If the target is a Tauri/native-only workflow, do not pretend a normal browser can validate native behavior. Validate only browser-renderable UI, or report that live validation needs the Tauri shell.

Use `local-apps.json` as the source of truth for known local ports. If an app is missing from that file, inspect the app's package scripts and config for a port. If no reliable port can be found, ask the user.

## Dev Server Rules

Use an existing app-specific dev server whenever possible. Do not disrupt the user's local ports.

1. Read the target app's port from `local-apps.json`.
2. Check whether anything is already listening on that port:

```bash
lsof -nP -iTCP:<port> -sTCP:LISTEN
```

3. If a listener exists, probe the matching app URL:

```bash
curl -sS -I http://127.0.0.1:<port>/
```

If sandboxed localhost checks report connection refused while `lsof` shows a listener, assume sandbox networking may be blocking localhost. Re-run the same localhost check with escalation before deciding the server is unavailable.

4. If the server responds, use `http://127.0.0.1:<port>` as the base URL for the whole validation.
5. If the port is occupied but not reachable, stop validation and report that the app's port is occupied but not reachable from the tool environment.
6. If the port is free, start only the target app, never the whole Turbo stack.

Prefer root app-specific scripts when present:

```bash
npm run dev:<app>
```

If there is no root shortcut, use the package name from `apps/<app>/package.json`:

```bash
npm run dev --workspace=<package-name>
```

Only pass an explicit port when the app's dev command supports it. Do not start another app on a random alternate port unless the user approves that port in the current turn.

Never run root `npm run dev` for validation. It starts the whole workspace and can collide with other apps. Never kill, restart, or replace an existing server unless the user explicitly asks.

## Auth State

Use app-specific browser auth state.

```bash
playwright-cli state-load .playwright-cli/<app>.auth.json
```

If the state file does not exist or the app redirects to login:

- Do not use hardcoded credentials.
- Use credentials only if the user provided them in the current task or the repo has explicit local test credentials intended for this app.
- If credentials are unavailable, stop and ask the user to log in or provide test credentials.
- After a successful login, save state to `.playwright-cli/<app>.auth.json`.

Public or unauthenticated pages do not need auth setup.

## Determine Which Page To Check

Infer the route from the changed files and framework.

- Next.js App Router: `apps/<app>/src/app/admin/products/page.tsx` -> `/admin/products`.
- Next.js Pages Router: `apps/<app>/src/pages/settings.tsx` -> `/settings`; `index.tsx` maps to `/`.
- Vite/SPA apps: start at `/`, then use visible navigation or route definitions to reach the affected view.
- Component changes: find pages that import the component and validate one representative page that exercises the changed behavior.
- Dynamic segments such as `[siteId]` or `:id`: navigate to the parent/list page first, grab a real ID or link from the UI, then navigate to the specific page.

If route inference is uncertain, inspect app routing files and prefer the smallest workflow that proves the changed behavior.

## Validation Steps

1. Navigate to the relevant page:

```bash
playwright-cli goto http://127.0.0.1:<port>/<route>
```

2. Wait for data to load. Apps may fetch remote or local data:

```bash
sleep 3
playwright-cli snapshot
```

3. Check for errors:

- Text containing "Server error", "Error", "Not found", "500", or "failed"
- Red error UI elements
- Empty pages that should have content
- Missing elements that the code change should have added
- Console errors that indicate the changed workflow is broken

4. Verify the actual requested change:

- Layout changes: confirm element order, spacing, and visibility.
- Form changes: exercise the field, submit path, validation, and disabled/loading states where practical.
- Navigation changes: click through the affected links or buttons.
- Data changes: confirm the relevant data renders and updates as expected.

5. Report findings clearly:

- Target app and base URL
- Page or workflow checked
- Whether it loaded successfully
- Whether the specific change works
- Any issues or blockers found

6. Close the browser when done:

```bash
playwright-cli close
```

## Cleanup

After validation passes, clean up only files modified during the current task:

- Remove debugging `console.log` statements added during development.
- Remove unused imports introduced by the change.
- Remove dead code introduced by the change.
- Remove temporary files such as `test-*`, `debug-*`, or `tmp-*`.

Do not touch unrelated files.

## Troubleshooting

- If the page shows loading skeletons after 5+ seconds, check the dev server logs and network state.
- If redirected to login after loading auth state, the session expired. Re-authenticate only with user-provided or repo-documented local test credentials.
- If you get connection refused, follow Dev Server Rules. Do not probe random ports.
- If browser validation cannot cover the affected native or backend-only behavior, report the limitation and run the closest appropriate non-browser verification.
