# CMS docs

This folder belongs to the CMS app. Nothing in it comes from Custom Shell, so
nothing in it ever conflicts when the shell is merged in. Everything true of
every app built on the shell is in the repo's `docs/shell/` instead.

## What is in this folder

- `shell-integration.md` — shell updates, storage settings, CMS extensions, site branding
  and the database and worker commands needed after an update.
- `directory-saves-featured-outreach.md` — saved collections, featured
  placement, owner card status, and the outreach that goes with them.
- `submission-review-email.md` — what an admin is told after approving or
  rejecting a submission, and why a failed email never undoes the decision.
- `embeddable-listing-badge.md` — the badge a listing owner can put on another
  website, and the setting that allows it.
- `directory-radius.md` — when the directory distance picker becomes usable
  and how to check location-dependent filtering.
- `listing-view-counts.md` — where a listing's view figures come from and what
  each column counts.
- `directory-page-layout.md` — how the browse page, a category page and a
  listing are laid out, what a day with two services stores, and where
  neighbourhood labels come from.
- `import-eatdrinktoronto.md` — the one-off command that copies one old
  Directory site into one CMS site, and the second command that loads the
  fields it left behind.
- `sitemap-files.md` — the numbered sitemap files a site's listings come in,
  and what happens at the edges of them.
- `listing-problem-reports.md` — the "Report a problem" link on a listing, what
  stops it being used for spam, and the admin queue the reports land in.
- `directory-search-suggestions.md` — the listings and categories the public
  search box offers as a visitor types, its keyboard, and how often it asks the
  server.
- `posts.md` — each site's Posts page: writing posts, listing cards in a post, and
  where posts appear once published.
- `events.md` — each site's events: writing them, the Events page's list and
  month, the site's time zone and why times are stored as a day and a clock
  time, when an event counts as over, the event page, where events appear in
  search, the sitemap and the feed, Google's event markup, and the share card.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
