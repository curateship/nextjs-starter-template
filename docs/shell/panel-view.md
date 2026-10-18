# Panel view

Any shell app can show one of its signed-in pages as the middle panel alone,
with no left menu and no top bar. Another app asks for this by loading the page
in a frame named `shell-panel`, with `?panel=1` on the address. Personal does
it to show the other apps' screens inside its own menu and top bar. The code is
`src/lib/layout/panel-view.ts`, read by `src/components/shell/shell-layout.tsx`.

```html
<iframe name="shell-panel" src="http://localhost:3020/dashboard?panel=1"></iframe>
```

## When a page draws as a panel

- **Only inside a frame.** `http://localhost:3020/dashboard?panel=1` opened in a
  tab of its own draws the full app. The browser checks `window.self !==
  window.top`.
- **Only when asked.** A frame with another name and no `?panel=1` gets the full
  app. The IDE's preview frames apps this way, so it is unaffected.
- **The frame's name is what lasts.** The browser keeps a frame's name through
  every page loaded in it: moves between screens, full reloads, and the sign-in
  page and wherever it sends people next. `?panel=1` can't be relied on to
  last. The sign-in page carries the address it was headed for in
  `?redirect=`, and once mounted the router rewrites the address through each
  route's search rules, and no shell route lists `panel` among them.
- **The address is what the server sees.** The server cannot see a frame's
  name, so it draws the first page as a panel when the address has `?panel=1`.
  That keeps the menu from flashing in before the browser takes over. A full
  reload inside the frame after `?panel=1` has gone draws the menu on the
  server and drops it as soon as the browser runs. A page opened with
  `?panel=1` in a tab of its own does the reverse.

## What a panel leaves out

The skip link, the left menu and the whole top bar. The bell, the save status,
the maintenance and paused-automations warnings and the viewing-as banner live
in the top bar, so a panel doesn't show them either. Pop-up windows, toasts, the
account window and feedback still work, and open inside the frame.

## The note the frame sends

In panel view, after every move, the shell posts this to `window.parent`:

```ts
{ type: "shell-panel", path: "/dashboard", title: "My dashboard" }
```

`path` is the address inside the app, without its search. `title` is the page's
name from the left menu, the same one the hidden page heading uses. The page
around the frame uses it to keep its own address and tab title in step.

The note goes to any parent (`"*"`). It carries nothing a stranger could use: an
address inside the app and a menu label. A page on another site never gets this
far signed in anyway, because the session cookie is `SameSite=Lax` and the
browser does not send it into another site's frame.

A page that reads the note must check `event.origin` against the app's address
and `event.source` against its own frame, since any page can post a message to
any window. Personal's `readPanelReport` in `apps/personal/src/lib/panel.ts`
does both.

## The note the frame takes

The page around the frame can ask the app to change page itself, the way a
click inside it would, so the frame doesn't load the whole app again:

```ts
frame.contentWindow.postMessage(
  { type: "shell-panel-go", path: "/admin/posts" },
  "http://localhost:3015"
)
```

`usePanelGo` in `src/lib/layout/panel-view.ts` listens while the page is a
panel, and `shell-layout.tsx` hands the path to the router's `navigate`. The
move then sends the usual note back. `readPanelGo` takes the note only from
`window.parent` and only for an address inside the app: it must start with one
`/`, with no `//` or `\` that could point at another site. The page around the
frame could load any address in it anyway, so the note adds nothing it couldn't
already do; it only skips the reload. Personal sends it when a link is in the
app already open (`apps/personal/workspace/docs/app-panels.md`). Added 18 Oct
2026 and copied unchanged into Trade and CMS.

## Sign-in

Each app signs people in on its own. The first time a frame opens an app, the
frame shows that app's sign-in page. After signing in there once, the frame
stays signed in like any tab. The sign-in pages are outside the signed-in shell,
so they send no note.

This works locally because the browser treats `localhost:3021` and
`localhost:3020` as one site: ports don't count. On the live sites each app has
its own domain, so the frame would only ever show the sign-in page. Live use
needs the framed app and the app around it under one parent domain, such as
`project.example.com` inside `example.com`.
