# App panels

Opening a link puts that app's real screen in Personal's middle panel. The
panel runs from the top of the window to the bottom, and the app shows exactly
as it does in its own tab, its own top navigation included. Personal keeps only
its left menu beside it. The frame is `src/components/panel-frame.tsx`.

## Why apps show their own top navigation

Until 18 Oct 2026 Personal asked each app to hide its own menu and top bar, and
drew a top bar of its own with a row of tabs that moved the app from outside.
That needed code in every app: a "panel view" in the shell, notes passed
between Personal and the app, and Trade's Hide profit and loss reworked
because its switch lived in the hidden top bar. Tabs still flashed white, and
Trade's figures misbehaved in Arc. Tyler, 18 Oct 2026: "remove these codes and
find a better way and not touch other apps to make it work. We dont want to be
changing every apps to fix these type of issues", then "Why not let other apps
show its top navigation?"

So Personal asks nothing of an app:

- **The frame loads the screen's plain address**, with no frame name and no
  `?panel=1`. The shell, CMS and Project still carry the panel view, but it
  only switches on when asked, and Personal no longer asks.
- **Moving around inside the app is the app's own click**, so it never
  reloads. The app's top navigation is where you change page inside it.
- **Everything the app keeps in its top bar works**, such as Trade's Hide
  profit and loss switch and its figures.
- **What Personal gives up:** it can't see inside another site's page, so its
  address and the browser tab's title stay on the screen you opened from the
  menu, not the page you moved to inside the app. Trade on live went back to
  its morning code the same day (commit 91feda5b5).

## Hiding an app's own left menu

Tyler, 18 Oct 2026: "trade sidebar should be hidden", without changing Trade.

- **Personal slides the app's left edge out of sight.** The app's page is
  made wider by the hidden width and moved left by the same amount, inside a
  panel that clips at its edge, so the app's own menu sits behind Personal's
  and its top navigation and page fill the panel. The app itself is
  untouched, and opened in its own tab it is unchanged.
- **The width is dragged into place once per app.** Personal can't read
  another site's layout, so it can't find the menu's width itself. With Edit
  the menu on, a line at the panel's left edge, labelled "Drag the line to
  hide this app's menu", slides the open app as you drag it. The width is
  saved for that app (by host, so every screen of it) when you let go. Drag
  it back to the left edge to show the whole page again. The arrow keys move
  it 8 pixels a press. `src/components/app-menu-handle.tsx`.
- **Trade's left menu is 180 pixels wide** (measured in Arc, 18 Oct 2026).
- **Saved in the menu file** as `appMenuWidths`, such as
  `{ "trade.barelycompany.com": 180 }`, in the app's own pixels, so zoom
  doesn't change it. `appMenuWidth` and `setAppMenuWidth` in
  `src/lib/menu.ts`.
- **What it can't know:** if the app's own menu is made wider or narrower
  inside the app, the width needs dragging again. The app's pop-ups centre on
  the whole page, hidden part included, so they sit half the hidden width
  right of centre. A page narrow enough to fold the app's menu away (under
  768 pixels, page plus hidden part) loses that much of its left edge.
- **Phone view hides nothing**, because a phone-sized page has no side menu.

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
- **The browser tab** reads "Trade · Personal": the name of the menu link the
  screen belongs to (`screenName` in `src/lib/menu.ts`), then Personal's.

## Keeping recent screens open

Tyler picked this on 17 Oct 2026 (task Panels/03, part 8). Going back to a
screen opened a moment ago is instant and keeps its place, scroll and any
half-filled form.

- **Up to three frames stay loaded** to start, one per screen last opened
  from the menu. "Screens kept loaded" in the cog menu raises it to 5, 8 or
  10; Tyler asked for the choice on 21 Oct 2026. The open one shows. The others sit behind it, made invisible but kept
  at full size, so their app keeps its layout and scroll.
- **Clicking a menu link whose frame is kept shows that frame as it was**,
  wherever you had moved inside it.
- **Clicking the link of the screen already open loads it again**, which is
  also the way back to that link's screen after moving around inside the app.
- **One screen past the cap drops the frame shown longest ago.** The cap
  starts at `DEFAULT_KEPT_FRAMES` in `src/lib/frames.ts`, and the cog's
  choices are `KEPT_FRAME_CHOICES` there. Lowering it closes nothing at once;
  the next new screen opened drops the extras. Each kept frame is a whole app
  running, so an app that checks for new data on a timer keeps doing it while
  hidden.
- **One link can stay loaded on top of the cap.** "Stay loaded" in a
  link's form (`menu.md`) marks it. Once that link's screen has been opened,
  its frame is never the one dropped, and it doesn't count toward the cap,
  so that many other screens stay loaded beside it. Tyler asked for this on
  18 Oct 2026 and chose one link, loaded on its first click rather than as
  soon as Personal opens. The frame belongs to the link's own address, so a
  deeper page of the same app opened from Recent screens is an ordinary
  frame. Turning the switch off lets the frame go the next time one is
  dropped. `addFrame` in `src/lib/frames.ts` skips it.
- **The frames are never moved around the page**, because moving an iframe in
  the page reloads it. They stay in the order they were opened.
- **"Opening trade.barelycompany.com"** with a spinner shows until a frame's
  page has loaded.
- The rules are pure functions in `src/lib/frames.ts`, tested in
  `src/lib/frames.test.ts`. `src/lib/use-open-screen.ts` ties them to the
  address and `src/components/panel-frame.tsx` draws them.

## The controls at the bottom of the menu

Personal has no top bar. Its controls sit at the bottom of the left menu, under
the list of bottom links (`menu.md`). Tyler moved them there on 18 Oct 2026.
The code is `src/components/sidebar-footer.tsx`.

- **The row:** Back, Forward and Reload at the left, the cog at the right.
  While the menu is saving, or a save failed, a line above the row says so.
- **Back and Forward** press the browser's own Back and Forward. A move made
  inside the app is in the browser's history too, so Back steps back inside
  the app first, the same as the browser's own button, and a step to an entry
  Personal made shows that screen, from its kept frame when there is one.
- **Back greys out when Personal has nothing to go back to.** It counts only
  Personal's own steps, since it can't see the app's, and steps from before a
  reload of Personal come from the browser (`navigation.canGoBack`). The
  counting is in `src/lib/use-open-screen.ts`.
- **Reload** loads the open screen again inside the same frame, swapping the
  frame's address in place, so Back still steps through the moves made before
  it. A new frame took those moves out of the browser's history (found in the
  browser check, 17 Oct 2026). It hides on the start page.
- **The cog** opens upward and holds the rest:
  - **Open in its own tab**, a real link to the screen's own address. Hidden on
    the start page.
  - **Recent screens**: the last ten screens opened, newest first, with no
    repeats. Each row shows the screen's menu name, or its path when it has
    none, and the host under it. This browser keeps the list, under
    `personal-recent-screens` in localStorage. `src/lib/recent-screens.ts`.
  - **Pin to the menu**, shown while a screen is open that no panel link goes
    to exactly. It lists the bottom of the menu, each section and "Under"
    each section link, and adds a link at the end of the one picked. Pinning
    works with editing off.
  - **Zoom** draws the panel at 100, 90, 80 or 67 per cent. The frame is made
    larger by 1/zoom and scaled back down from its top left, so it still fills
    the panel. One zoom for every screen, kept by this browser under
    `personal-panel-zoom`.
  - **Phone view** makes the frame 390 pixels wide, centred, full height. The
    app picks its phone layout because its window is that wide. Zoom is off
    while it is on. Kept under `personal-panel-phone`.
  - **Screens kept loaded**: 3, 5, 8 or 10, the cap above. One number for
    every screen, kept by this browser under `personal-panel-kept`.
  - **Menu shade**, a slider that makes the left menu lighter or darker, saved
    in the menu file. `menu.md` has the rest.
  - **Edit the menu** and **Sign out**.
  - Recent screens, Pin, Zoom, Screens kept loaded and Menu shade are views the dropdown steps into, with a row
    at the top that steps back out, because the shell's dropdown has no
    sub-menus.
- **On a phone** the menu is hidden, and a menu button in the bottom-left
  corner opens it over the page, clear of the app's own top navigation.

## Apps that refuse frames

An app that refuses to be framed shows "refused to connect" in the panel. CMS
refuses every frame except, in development, `http://localhost:3021`
(CMS's `who-may-frame-cms.md`). Trade, Project and Video send no such rule, so
any site may frame them.

## Signing in

Each app has its own accounts, and Personal has none. The first time a panel
shows an app, it shows that app's sign-in page. Sign in there once and the
frame stays signed in.

That only works when Personal and the app are the same site to the browser.
`localhost:3021` and `localhost:3015` are, because ports don't count. Live
Personal is `https://personal.barelycompany.com` (`launch.md`), so an app at
an address under `barelycompany.com`, such as `trade.barelycompany.com`, signs
in inside its panel. An app on a domain of its own only ever shows its sign-in
page there, because the browser keeps its sign-in out of a frame on another
site. Local Personal showing a live app is the same case.
