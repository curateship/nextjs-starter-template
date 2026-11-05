# Winning ads

Tyler, 4 Nov 2026: "Meta's ad library". The Winning ads row on a project's
left panel, under the Vault row, turns the middle panel into ads from Meta's
ad library that match the project's keywords and have run 30 days or more.
An ad somebody keeps paying for that long is making them money
(`src/components/viral/project-ads.tsx`, `src/server/viral/meta-ads.ts`).

## Setting it up

Settings → Meta holds the token, kept scrambled like the YouTube key; the
browser only ever sees its last four characters. Making one needs a verified
Meta developer account: an app at developers.facebook.com, identity
confirmed for the Ad Library API, then a token from the Graph API Explorer.
Test asks the library about "coffee" and says how many ads came back.

## What a search does

- **The keywords.** Search ads asks about the project's first 5 keywords, 50
  ads each. A project with no keywords is told to add one.
- **The countries.** The UK and Ireland. Meta only lists everyday ads that
  reached the EU or the UK, so these are the English-speaking places it can
  answer for (`AD_COUNTRIES` in `src/lib/viral/ads.ts`).
- **What is kept.** Ads still running whose start date is 30 days ago or more.
  Each search replaces the project's last list (`viral_ads`), and when it ran
  is kept in `viral_ad_runs`.
- **A failure.** Meta's reason is kept with the project and shown over the old
  list, which stays. A refused token says to paste a fresh one.

## What each ad shows

The list runs newest first, by the day each ad started, as the task asked,
and the first ad in it is the one that opens on the right. The advertiser, how many days it has run, its words and title, the platforms
it shows on, the keyword that found it, and a link to its public page in
Meta's ad library. The library's answer has no picture or video, only a page
that needs the token to open, so the picture is seen on Meta's public page
instead and the token never reaches the browser.

## The sample

The sample project has two made-up ads, so the row has something to show. It
is never searched.

## Not proven

No real search has been run, because no Meta token has been set up yet.
