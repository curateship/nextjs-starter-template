# Adding an app to a phone's home screen

Every app built on the shell can be added to a phone's home screen. Its icon
then opens the app full screen, without the browser's address bar, the way an
installed app opens. Tyler asked for this on 13 Oct 2026 so Project's morning
check-in is one tap away, and chose to give it to every app from the shell.

## What a phone reads

- **The manifest.** `/manifest.webmanifest` answers a small JSON file with the
  app's name, the name under the icon, the page the icon opens, and the icons
  (`src/routes/manifest[.]webmanifest.ts`, built by `webAppManifest` in
  `src/lib/home-screen.ts`). `display` is `standalone`, which is what makes
  it open full screen.
- **The page head.** Every page links the manifest and adds
  `mobile-web-app-capable`, `apple-mobile-web-app-capable` and
  `apple-mobile-web-app-title`, which iPhones read in place of the manifest's
  name (`src/routes/__root.tsx`).
- **The icons are the browser tab's.** The shell already cuts a 180px and a
  512px picture from the logo uploaded in Settings, for the tab and for
  iPhones. The manifest lists those two, from the same light or dark version
  the tab shows. An app with no logo lists no icons, and the phone draws one
  from the name.
- **The name** is the app's name from Settings, or on a multisite app the
  visited site's. The file can be cached for an hour, so a new name or logo
  reaches a phone within the hour, and only when it is added again.

## What an app chooses

`homeScreen` in the app's `src/app/options.ts`:

- `startPath`: the page the icon opens, such as `"/dashboard"`. Unset opens
  the front page. A signed-out person is sent to sign in as usual.
- `shortName`: the name under the icon, when the app's name is longer than
  a phone shows (about 12 characters). Unset uses the app's name.

Project opens My dashboard (`/dashboard`).

## What it doesn't do

- **No notices on the phone.** Nothing is pushed to the phone. Project's rule
  that the check-in reminder is a bell notice only still holds.
- **No offline pages.** There is no service worker. With no connection the
  icon opens the same error a browser would show.
- **No app stores.** It is a shortcut to the website.

## Things to know

- **The local dev server never hands a browser the manifest.** Nitro's dev
  step sends any request that isn't for a page, a manifest included, to
  Vite's static files, which answer 404 whatever the address. `curl` or a
  plain `fetch` of `/manifest.webmanifest` gets the real file, and the live
  server has no such step, so check the deployed site's browser.
- **iPhones sign in again once.** A home-screen app on an iPhone keeps its
  own cookies, separate from Safari, so the first open asks to sign in.

## Test road map

1. `curl http://localhost:<port>/manifest.webmanifest` shows the name, the
   start page and two icon addresses, and each icon address opens a picture.
2. Any page's source has `<link rel="manifest" href="/manifest.webmanifest"/>`
   and the three `web-app` tags.
3. On the deployed site, on a phone: Share then "Add to Home Screen" on an
   iPhone, or the menu then "Add to Home screen" on Android. The icon shows the
   logo, and opening it shows the start page with no address bar.
