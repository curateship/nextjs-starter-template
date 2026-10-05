# The isolated browser

Everything the app does on Reddit happens inside one real browser running in a
container, routed through a proxy, with its own fingerprint and its own cookies.
It is not an extra: Reddit does not answer anything else.

## What it is

Camoufox, a Firefox built to be hard to fingerprint, running inside Neko, which
streams the window over video so a person can watch and take over. The image is
built from `docker/browser/`.

It was copied from `apps/anti-detect`, not shared with it. Pointing promo at that
app's image would put two apps in one file, which is the thing the shell's rules
exist to prevent: anti-detect's browser sleeps forever on purpose, waiting for a
human, and promo's has to take instructions.

## How code drives it

The container runs a small server on a port bound to this machine only, and it
accepts four named instructions and nothing else:

- **what it can see** — signed in as whom, and whether a challenge is in the way
- **search** — a keyword, and the posts come back as data
- **thread** — a post, and its replies come back
- **comment** — a post and some words, and the new comment's address comes back

Four named instructions rather than a general way to drive a browser. The page
knowledge lives in one Python file beside the browser, so when Reddit redesigns
the fix is in one file. Everything else, the queue, the order, the drafting and
the database, stays in TypeScript.

Every instruction carries a secret the container was started with. Without it the
port is a way for anything on the machine to post from a signed-in Reddit
account.

## Reading Reddit two ways

Adding `.json` to a Reddit address returns the page as data, in a shape that has
barely moved in ten years. A plain program gets a 403 for it, but this browser
has already solved Reddit's puzzle and holds the cookie that proves it, so the
same request from inside the page answers. That is the first choice.

When it is refused, the posts are read off the rendered page instead. Less
steady, so it is the fallback, and a search says which of the two answered.

## Signing in happens once

Open the browser in Settings, sign in to Reddit in the window it streams, and the
cookies land in that account's own storage, which outlives every restart of the
container. It is not asked again.

**The window asks for a name and a password.** Any name will do. The password is
shown on the Settings screen beside the link, is new every time the browser is
opened, is held in the app's memory and nowhere else, and only works on this
computer. Without it the window cannot be opened at all, which is why it is
shown rather than kept.

**A cold start takes a while.** The image has to come up, Neko has to bring up a
display, and Camoufox has to launch a patched Firefox on it: between 30 and 90
seconds on a Mac. The browser counts as ready when it answers, not when Reddit
has finished loading, so the window's address appears as soon as there is a
window to watch.

The same window is where a captcha gets cleared. When Reddit shows one mid-search
the job stops, the post keeps the status it had, and the screen hands over the
link to the window rather than retrying.

## The proxy

Optional, and the thing to set before posting regularly. Without one, Reddit sees
this computer's own address.

Testing a proxy sends one request through it to a service that echoes back what
the far end saw: the address, the country, the city, the network and the clock.
The clock matters as much as the address, because a browser with a US exit
address sitting on a Moscow clock is an obvious mismatch.

A proxy host that resolves to an address inside the network is refused outright.
Otherwise a proxy row would be a way to make the server fetch its own
neighbours.

The password is encrypted where it is stored and never comes back out to a
browser. The only thing that ever decrypts it is the code starting the container.

## One browser per account, and it gets shut down

One live browser per account, held to one by the database rather than by hoping.
A second container opening the same cookie storage would corrupt it.

A browser nobody has used for an hour is shut down, because an idle one still
holds about 1.5GB of memory. The cookies stay; only the container goes.

## Why it runs in its own process

A search through a real browser takes tens of seconds. The app's shared
background loop fires every fifteen and runs every other job in turn, so a
browser search sitting on it would hold up everything else.

So the browser has a process of its own, started with `npm run social:browser`,
and the two talk through a job table. Pressing Search writes a row and returns;
the browser process picks it up. Two copies of that process are safe: a job is
claimed before any work starts, and a claim that goes stale is handed back after
five minutes and given up after three tries.

The shared loop keeps only the quick jobs: re-testing a proxy every ten minutes,
and shutting down an idle browser.
