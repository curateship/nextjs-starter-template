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

## Write an ad like this

Tyler, 6 Nov 2026: "Meta's three boxes". A card on the open ad's right panel
writes a new ad in that ad's style for the project's topic
(`AdCopyCards` in `src/components/viral/project-ads.tsx`,
`src/server/viral/ad-copy.ts`).

- **What it writes.** Main text, headline and description, the three boxes
  Meta's ad form has. Each has its own Copy, so they paste straight in.
- **The lengths.** The writer aims at what Meta shows before it cuts text
  off: 125 characters of main text, 40 of headline, 30 of description
  (`AD_COPY_AIMS` in `src/lib/viral/ads.ts`). Each box says how long it came
  out, such as "132 of about 125 characters". An ad that runs over is kept,
  never refused.
- **The cost.** One call to the writer picked on Settings → AI writer, shown
  first with its name: about 1 cent with Gemini Flash or GPT-5 mini, 2 cents
  with Claude Opus 5. It goes on the AI meter as `viral_ad_copy` and counts
  against the project's spend limit.
- **Kept after a new search.** Search ads replaces the project's ads, so the
  written ones are kept apart, by the project and the ad's library id
  (`viral_ad_copies`). The same ad found again shows them again. Every press
  is kept, newest first.
- **Refused.** The ad has to be in the project's list now. A sample's
  made-up ads have no Write an ad button and the server refuses them too, and
  a project with no topic is refused before the AI is asked.

## The sample

The sample project has two made-up ads, so the row has something to show. It
is never searched, and nothing is written from its ads.

## Not proven

No real search has been run, because no Meta token has been set up yet. No
real AI call has written an ad; the server test stubs the writer and Meta,
and the card has not been opened in a browser.
