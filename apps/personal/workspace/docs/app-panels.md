# App panels

Opening a link puts that app's real screen in Personal's middle panel. Personal
keeps its own left menu and top bar around it. The frame is
`src/components/panel-frame.tsx`.

## Addresses

- **Personal's address names the screen.** `http://localhost:3021/localhost:3015/admin/listings`
  shows `http://localhost:3015/admin/listings`. The first part after Personal's
  own is the app's host, and the rest is the screen's path. A local host
  (`localhost`, `127.0.0.1`) is opened over http and any other host over https.
  `personalPath` and `appUrlFromPersonalPath` in `src/lib/menu.ts` do the
  conversion.
- **A reload lands on the same screen**, because the address says which one.
- **`http://localhost:3021/` with nothing after it** opens the start screen
  when one is chosen ("Personal opens here" in a link's form, see `menu.md`),
  and swaps the address to it, so Back doesn't return to an empty page.
  Without one it shows a line asking you to pick a screen from the menu. The
  logo row always goes to that empty start page.

## The frame

- **The framed app hides its own menu.** The frame is named `shell-panel` and
  its first address carries `?panel=1`. Every app built on Custom Shell then
  draws only its middle panel. The repo's `docs/shell/panel-view.md` is that
  side. An app without that shell change shows its full menu inside the panel.
- **Personal's address follows the frame.** After every move inside the frame,
  the app reports its path and page name. Personal swaps its own address to
  match, without reloading the frame, and the browser tab reads like
  "Notifications · Personal". Personal only listens to reports from the open
  app's address and its own frame (`readPanelReport` in `src/lib/panel.ts`).
- **Only Personal's own moves reload the frame**: a menu click on a screen
  that isn't kept, Reload, or clicking the link of the screen already open.
- **"Opening localhost:3015"** with a spinner shows until the frame's page has
  loaded.

## Keeping recent screens open

Tyler picked this on 17 Oct 2026 (task Panels/03, part 8). Going back to a
screen opened a moment ago is instant and keeps its place, scroll and any
half-filled form.

- **Up to three frames stay loaded**, one per screen last opened. The open one
  shows. The others sit behind it, made invisible but kept at full size, so
  their app keeps its layout and scroll.
- **Clicking a menu link whose frame is kept shows that frame as it was**,
  even if it has moved deeper since, such as from Listings to one listing.
  Personal's address and tab title come from where that frame is now.
- **A fourth screen drops the frame shown longest ago.** `MAX_KEPT_FRAMES` in
  `src/lib/frames.ts` is the cap. Each kept frame is a whole app running, so
  an app that checks for new data on a timer keeps doing it while hidden.
- **Each frame listens for its own reports only**, so a hidden frame's moves
  change that frame and never Personal's address.
- **The frames are never moved around the page**, because moving an iframe in
  the page reloads it. They stay in the order they were opened.
- The rules are pure functions in `src/lib/frames.ts`, tested in
  `src/lib/frames.test.ts`. `src/lib/use-open-screen.ts` ties them to the
  address and `src/components/panel-frame.tsx` draws them.

## The top bar's panel buttons

Parts 1 to 7 of task Panels/03, 17 Oct 2026. From 768px wide they sit in the
top bar. On a phone, Back, Forward, Reload, Open in its own tab, Recent
screens and Pin move into the cog's dropdown, so the bar still fits at 390px.

- **The open screen's name** stands at the bar's left end when no sub-link
  row is there, such as "CMS · Listings". Tyler chose the section title on
  17 Oct 2026. The first part is the left-menu section of the link that
  matches the screen, or the app's host when no section link matches (a
  top-bar link, or a deep page with no link). The second part is the page
  name the app reported, or the link's label before the note arrives or for a
  site that never sends one. With neither, the host stands alone. Long names
  are cut short. `screenName` in `src/lib/menu.ts`. The start page shows
  nothing there.
- **Back and Forward** at the bar's left end press the browser's own Back and
  Forward. Measured on 17 Oct 2026 in Chromium: the browser's Back steps
  inside the framed app (one listing, then Listings, then Dashboard) with no
  reload, and Personal's address follows each step, because the frame's own
  moves are in the browser's history. A step inside the frame doesn't reload
  it; a step to an entry Personal made shows that screen, from its kept frame
  when there is one.
- **Back greys out when there is nothing to go back to, as a best guess.**
  Personal can't see the framed app's history, so it counts: each link
  opened and each move inside the frame is one step, and its own Back and
  Forward take one off or put one back. Tyler chose the best guess on 17 Oct
  2026 over an exact count that needs a Custom Shell change. The count is one
  step off after the browser's own arrows step inside the frame, and then
  Back can leave Personal for the site before it. Steps from before a reload
  of Personal come from the browser (`navigation.canGoBack`). The counting is
  in `src/lib/use-open-screen.ts`.
- **Reload** loads the page the frame is on now, not the page its link first
  opened. It loads it again inside the same frame, swapping the frame's
  address in place, so Back still steps through the moves made before it.
  Making a new frame instead took those moves out of the browser's history,
  and Back then did nothing (found in the browser check, 17 Oct 2026). A
  second click on the open link reloads the same way.
- **Open in its own tab** is a real link to the screen's own address, so it
  opens with the app's full menu. Both it and Reload hide on the start page.
- **Recent screens** (the clock) lists the last ten screens shown, newest
  first, with no repeats, deep pages included. Each row shows the page name,
  or its path when the page sent none, and the host under it. Clicking one
  opens it like a menu link. This browser keeps the list, under
  `personal-recent-screens` in localStorage, so a reload keeps it and another
  browser starts empty. Tyler chose this on 17 Oct 2026, so the menu file
  isn't rewritten on every move. `src/lib/recent-screens.ts`.
- **Pin** shows while a screen is open that no panel link goes to exactly. Its
  dropdown lists the top bar, each section and "Under" each left-menu link.
  Picking one adds a link named after the page (the host when it sent no
  name), with the link icon, at the end of that place, and the pin goes away.
  Pinning works with editing off: it is the one menu change that doesn't
  need the switch.
- **Zoom**, in the cog, draws the panel at 100, 90, 80 or 67 per cent, so a
  busy dashboard fits. The frame is made larger by 1/zoom and scaled back
  down from its top left, so it still fills the panel exactly. One zoom for
  every screen, kept by this browser under `personal-panel-zoom`. Tyler chose
  that on 17 Oct 2026. Small text gets harder to read, and the framed app's
  pop-ups shrink with it.
- **Phone view**, in the cog, makes the frame 390 pixels wide, centred, full
  height, with a thin line each side. The framed app picks its phone layout on
  its own because its window is 390 pixels wide. Zoom is off while it is on.
  Kept by this browser under `personal-panel-phone`.
- The cog's dropdown steps into Recent screens, Pin to the menu and Zoom as
  lists of their own, with a row at the top that steps back out, because the
  shell's dropdown has no sub-menus.
- The buttons are in `src/components/top-bar.tsx`, the zoom and phone view in
  `src/lib/use-panel-view.ts` and `src/components/panel-frame.tsx`.
- **An app that refuses frames** shows "localhost refused to connect" in the
  panel. CMS refused every frame from another address, so in development it
  now lets `http://localhost:3021` frame it (CMS's `who-may-frame-cms.md`).
  Trade lets only itself and Personal frame it: `http://localhost:3021` on
  this Mac, `https://personal.barelycompany.com` live (Trade's
  `shown-in-personal.md`). Project and Video send no such rule.

## Signing in

Each app has its own accounts, and Personal has none. The first time a panel
shows an app, it shows that app's sign-in page. Sign in there once and the
frame stays signed in.

This only works locally. The browser treats `localhost:3021` and
`localhost:3015` as one site, because ports don't count, so it sends the app's
sign-in into the frame. On the live sites each app has its own domain, and the
browser keeps an app's sign-in out of a frame on a different domain, so the
panel would only ever show the sign-in page. The fix is an address for each
app under `barelycompany.com`, the domain live Personal is on
(`https://personal.barelycompany.com`, `launch.md`). Trade is the first:
`trade.barelycompany.com` is the same site, so live Trade signs in inside
live Personal's panel. Each app also needs the panel view and a framing rule
that names Personal, as Trade has.
