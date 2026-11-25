# Junk emails on listings

A listing never shows, sends to or keeps an email that is nobody's inbox.

## Where they came from

The Eat Drink Toronto import read each restaurant's email off its own website,
and a website's source holds addresses that are not the restaurant's. On
24 Nov 2026 the local copy had 463 of them, one on each of 463 listings:

- **191 error-tracking addresses**, the service a Wix site reports its crashes
  to: `605a7b…@sentry-next.wixpress.com`, `…@o244637.ingest.us.sentry.io`.
- **206 template placeholders** a site theme ships with: `example@domain.com`,
  `example@mail.com`, `info@mysite.com`, `hi@mystore.com`.
- **66 image names** that happen to contain an @: `account-default@2x.png`.

On a listing page they read as the restaurant's email, and Outreach wrote to
them.

## The rule

`isJunkEmail` in `src/lib/directory/contact-links.ts` is the one rule. An email
is junk when its domain is sentry.io or wixpress.com or ends in one, ends in
an image extension (png, jpg, gif, webp, svg), is a placeholder domain
(domain.com, yourdomain.com, mysite.com, mystore.com), or its name before the
@ is "example".

`example.com` is left alone. It is the address every test and sample uses, and
the import carried only nine of them.

`cleanContactLinks` applies the rule every time a listing's links are read or
saved, so a junk email is never drawn and can never be saved again, whatever
the stored row says.

## Taking them out of the saved listings

The page hides them either way, but Outreach finds a listing's address with a
query over the stored links, and the admin's edit form shows what is stored. A
one-off command makes the stored rows match:

```
npm run drop:junk-emails            # lists what it would take out
npm run drop:junk-emails -- --write # takes them out
```

It reads `CUSTOM_SHELL_DATABASE_URL` from `.env.local`, changes nothing without
`--write`, and a second run finds nothing.

- **This Mac:** run with `--write` on 24 Nov 2026. 463 emails came out of 463
  listings, and a second run found 0.
- **Live (eatdrinktoronto.com):** owed. Run it once against the live database
  after the next deploy, look at the list first, then run it with `--write`.
  The Outreach count on the left page drops by about the same number.
