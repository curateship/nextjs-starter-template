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
  stops it being used for spam, and the admin queue that listing and event
  reports land in.
- `directory-search-suggestions.md` — the listings and categories the public
  search box offers as a visitor types, its keyboard, and how often it asks the
  server.
- `home-page-rows.md` — the rows a site builds its own home page from, the five
  kinds, and the rules that hold for every one of them.
- `image-fields.md` — what happens when an image field is clicked, and why the
  picker opens as a window inside an editing window.
- `posts.md` — each site's Posts page: writing posts, listing cards in a post, and
  where posts appear once published.
- `events.md` — each site's events: writing them, the Events page's list and
  month and its category, date and distance filters, featured events, the site's time zone and why times are stored as a day and a clock
  time, when an event counts as over, the event page, where events appear in
  search, the sitemap and the feed, Google's event markup, the share card,
  adding events to a calendar or subscribing to them, duplicating an event,
  private events, the Suggest an event form with its review queue,
  listing owners adding events from My listings, the Draft events
  automation step that reads a page and drafts the events on it, and
  reporting a problem on an event.
- `promotions.md` — each site's deals: writing them in Admin → Promotions,
  the Deals page and each deal's page, deal types and headlines, the times
  of day a deal runs and how "On now" is worked out, the rules Tyler set, how
  the site's time zone decides when a deal is over, and the one filter every
  public read goes through.

## Adding a doc

One file per subject, named after the subject, plus its line above in the same
turn as the code. Write it the way `.agents/skills/unslop/SKILL.md` says.
