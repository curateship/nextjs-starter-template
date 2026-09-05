# CMS and Custom Shell

CMS uses the shared Custom Shell code for accounts, billing, automations,
navigation, public pages and settings. Directory routes, tables, migrations,
imports and app options belong to CMS.

The CMS settings tabs are registered in `src/app/options.ts`. Site identity,
Directory and Listing badges load their own panels through the shell's settings
tab extension. Adding a CMS setting does not require editing the shared settings
page.

CMS enables `workspaces.siteBranding`. A site's favicon, logo, dark logo and
share image stay in that site's workspace settings. Public requests read the
site selected by the domain. Empty image fields use the app-wide images.
The Site identity panel edits those fields through the shell's guarded settings
endpoint. The site's accent colour uses `publicTheme.brandColor`, including
existing colours converted by migration `0075_custom_shell_public_brand_color`.

The shell's site-branding contract is documented once in the repo's
`docs/shell/shell-and-apps.md`.

## Applying updates

Copy shell-owned files from Custom Shell. Keep CMS's `src/app/`, directory
files, migrations, import scripts, environment and workspace documents.
Preserve the `cms` package name and the import command when merging package
scripts and dependencies. Regenerate the route tree from CMS's combined routes.

Run the full test suite after a shell merge, then the app and Node TypeScript
checks. Validate the existing CMS server on port 3015 in a browser.

The current shell includes database migrations through
`0076_custom_shell_single_site_public_navigation.sql`. Apply pending migrations
with `npm run db:migrate` against the intended CMS database before running the
updated app. Supply `CUSTOM_SHELL_DATABASE_URL` explicitly; the migration
command does not load a local environment file. The background worker has its own build and start commands,
`npm run build:worker` and `npm run worker`. Production releases must run that
worker for scheduled shell and directory work.
