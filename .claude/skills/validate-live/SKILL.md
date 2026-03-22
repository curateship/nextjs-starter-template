---
name: validate-live
description: Validates code changes by opening the app in a real browser, logging in, and checking the relevant page works correctly. Trigger when the user says "validate", "check it", "test it", "does it work", or "verify". Also trigger proactively after significant code changes (new components, layout changes, form changes, bug fixes, etc.) to catch issues before the user has to ask. This is live browser validation, not unit tests or linting.
---

# Validate UI Changes

After making code changes, open a real browser to verify the page works as intended.

## Auth State

Before logging in, check if saved auth state exists:

```bash
playwright-cli state-load .playwright-cli/auth.json
```

If the state file doesn't exist or loading it still lands on `/login`, log in manually:

```bash
playwright-cli open http://localhost:3000/login
```

Then fill credentials and sign in:

```bash
# Get snapshot to find form refs
playwright-cli snapshot

# Fill login form (find the email/password textbox refs from snapshot)
playwright-cli fill <email-ref> "typham2@gmail.com"
playwright-cli fill <password-ref> "gundam11"
playwright-cli click <signin-button-ref>

# Save auth state for future runs
playwright-cli state-save .playwright-cli/auth.json
```

## Determine Which Page to Check

Based on the files that were just changed, figure out the correct URL:

- `apps/hub/src/app/admin/newsletters/contacts/page.tsx` → `/admin/newsletters/contacts`
- `apps/hub/src/app/admin/products/page.tsx` → `/admin/products`
- `apps/hub/src/app/admin/sites/[siteId]/settings/page.tsx` → `/admin/sites/<siteId>/settings` (find a valid siteId from the page)
- Component changes → navigate to a page that uses that component

The pattern is: strip `apps/hub/src/app` prefix, remove `page.tsx`, and that's the route. For dynamic `[param]` segments, navigate to the parent list page first, grab an ID from there, then navigate to the specific page.

## Validation Steps

1. **Navigate** to the relevant page:
   ```bash
   playwright-cli goto http://localhost:3000/<route>
   ```

2. **Wait for data to load** — the app fetches data from a remote DB which can take 2-4 seconds:
   ```bash
   sleep 3
   playwright-cli snapshot
   ```

3. **Check for errors** — look in the snapshot for:
   - Text containing "Server error", "Error", "Not found", "500", "failed"
   - Red error UI elements
   - Empty pages that should have content
   - Missing elements that your code change should have added

4. **Verify the change works** — based on what was asked:
   - If you added a breadcrumb → confirm the breadcrumb nav appears in the snapshot
   - If you fixed a button → confirm the button renders with correct text
   - If you changed layout → confirm elements are in expected order
   - If you added a feature → confirm the new UI elements appear

5. **Report findings** — tell the user clearly:
   - What page you checked
   - Whether it loaded successfully
   - Whether the specific change looks correct
   - Any issues found

6. **Close the browser** when done:
   ```bash
   playwright-cli close
   ```

## Cleanup

After validation passes, clean up the changed files before reporting:

- **Remove debugging `console.log` statements** added during development (not pre-existing ones)
- **Remove unused imports** that are no longer referenced
- **Remove dead code** — functions, variables, or components that are no longer called or rendered
- **Remove test/temp files** — any `test-*.js`, `debug-*.*`, `tmp-*.*` files created during the task

Only clean up code in files that were modified as part of the current task. Don't touch unrelated files.

## Troubleshooting

- If the page shows loading skeletons after 5+ seconds, the dev server may need restarting
- If redirected to `/login` after loading auth state, the session expired — log in again and re-save state
- If you get connection refused, the dev server isn't running — start it with `npm run dev` from the repo root
- Console errors are sometimes normal (React hydration warnings, etc.) — focus on actual page content errors
