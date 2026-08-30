# Custom Shell docs

This library explains the working Custom Shell application. The folders match
the product areas an admin or developer sees, so a new doc has an obvious home.
Start with [the application map](architecture/application-map.md) for the route,
server, data, and app-extension boundaries.

Rules shared by every app remain in the repo's `docs/shell/` folder. Do not copy
those rulebooks here. `docs/shell/shell-and-apps.md` explains ownership,
`docs/shell/what-lives-where.md` explains file placement, and the repo's
`docs/README.md` indexes the shared architecture, security, UI, deployment, and
local setup docs.

## Accounts

- [Authentication and sessions](accounts/authentication-and-sessions.md)
- [Account security](accounts/security.md)

## AI

- [Providers, keys, and usage](ai/providers-keys-and-usage.md)

## Architecture

- [Application map](architecture/application-map.md)
- [Routes and integrations](architecture/routes-and-integrations.md)

## Automations

- [Automations](automations/overview.md)
- [Automation run refresh](automations/run-refresh.md)
- [App-owned automation run results](automations/app-owned-run-results.md)

## Billing

- [Plans, subscriptions, and entitlements](billing/plans-subscriptions-and-entitlements.md)

## Content

- [Announcements and changelog](content/announcements-and-changelog.md)
- [Public pages, search, and SEO](content/public-pages-search-and-seo.md)
- [Public page load errors](content/public-page-load-errors.md)

## Email and notifications

- [Newsletters and broadcasts](email/newsletters-and-broadcasts.md)
- [System emails](email/system-emails.md)
- [Notifications](email/notifications.md)

## Feedback

- [Feedback and roadmap](feedback/feedback-and-roadmap.md)

## Media

- [Media library, picker, and storage](media/library-picker-and-storage.md)

## Operations

- [Background work](operations/background-work.md)
- [Maintenance, health, cleanup, and traffic](operations/maintenance-health-cleanup-and-traffic.md)

## People and workspaces

- [Users, contacts, and segments](people/users-contacts-and-segments.md)
- [Workspaces and membership](people/workspaces-and-membership.md)

## Settings

- [Administration and personalization](settings/administration-and-personalization.md)

## UI

- [App shell and navigation](ui/app-shell-and-navigation.md)
- [Home and dashboards](ui/home-and-dashboards.md)
- [Dashboard controls](ui/dashboard-controls.md)
- [Forms, tables, dialogs, and accessibility](ui/forms-tables-dialogs-and-accessibility.md)

## Adding a doc

Put the file in the folder for the product area it explains and add its link to
this index in the same change. Use one file per subject. Update an existing file
when behavior changes instead of creating a second version of the same truth.

Write what the app does, why the rule exists, and where ownership changes. Keep
screenshots in `assets/`. If a subject applies unchanged to every app built on
Custom Shell, update the matching repo doc instead of repeating it here.
