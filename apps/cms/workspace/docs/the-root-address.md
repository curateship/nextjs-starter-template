# What `/` is

The address `/` is two different pages, and which one you get depends entirely
on the host that asked for it.

- **A site's own address gets that site's home page.** `eatdrinktoronto.com/`
  is the directory its visitors came for, built from the rows in
  `home-page-rows.md`.
- **The deployment's own address is the admin's front door.** It forwards to
  the admin's home when they are signed in, and to the sign-in form when they
  are not. It draws no page of its own.

## Why the deployment's root is not a marketing page

It used to be. Custom Shell's front page sells the shell, which is the right
answer for an app that sells itself and the wrong one for this one. Every site
CMS serves has an address of its own, so nobody arrives at the deployment's
root except the person who runs it. Tyler's call on 25 Sep 2026: "the root
index is just for admin".

The pricing table did not go anywhere. It is still at `/pricing`.

## Where a signed-in admin lands

At `/home`, not `/admin`. `/home` is the signpost that reads the Admin home
route setting in Settings → General, so changing that setting still decides
where the root lands. It also sends a member to the member home rather than to
an admin page they cannot open.

That makes two forwards for a signed-in admin, `/` to `/home` to
`/admin/dashboard`, both of them server redirects with nothing drawn in
between. Each one replaces the last rather than stacking, so Back never bounces
a reader straight out of the page they just reached.

## The distinction that matters

The endpoint behind `/` answers with the host it decided on, not with a page
alone. That is deliberate and it is the whole design.

A site answers "no page" in several ordinary situations: it has no home page
configured, or its rows all came back empty, or every row followed a page this
visitor may not see. All of those fall through to the shell's front page, and
always have. **Reading "no page" as "this must be the platform" would send a
site's own public visitors to a sign-in form.** A host that resolves to no
workspace at all counts as a site here too, so an address nobody has taken
keeps behaving exactly as it did.

Only the deployment's own host forwards. `src/app/options.test.ts` holds that
line, including a test named for the fall-through case.
