# Embeddable listing badge

Directory admins can allow listing owners to share a small badge on another
website. The switch is off by default and lives at **Settings → CMS → Listing
badges**. It saves immediately when changed.

An owner of a published listing opens **My listings**, chooses the small badge
or larger card, chooses light or dark, and copies the one-line frame code. The
badge shows the listing photo, name, site name, and a link back to the listing.
Ratings will appear only after the separate ratings feature exists.

The badge address is intentionally allowed to appear inside a frame on any
website. This exception belongs only to the badge response. It is a static page
with no app scripts, cookies, or visit recording, and it has a strict browser
policy that prevents scripts and forms.

Only published listings can be shown. A disabled site, draft, deleted listing,
or unknown listing returns a plain not-found response. Known badges are cached
for five minutes in the browser and one hour in shared caches. Requests are
limited per visitor address.
