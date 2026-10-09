# The isolated browser

Everything the app does on Reddit happens inside a real browser running in a
container, routed through a proxy, with its own fingerprint and its own cookies.
It is not an extra: Reddit does not answer anything else.

Which proxy, which fingerprint and which cookies is a browser profile's
business, not the Reddit account's. [Browser profiles](profiles.md) explains
that record.

## What it is

Camoufox, a Firefox built to be hard to fingerprint, running inside Neko, which
streams the window over video so a person can watch and take over. The image is
built from `docker/browser/`.

It was copied from `apps/anti-detect`, not shared with it. Pointing promo at that
app's image would put two apps in one file, which is the thing the shell's rules
exist to prevent: anti-detect's browser sleeps forever on purpose, waiting for a
human, and promo's has to take instructions.

**The image is pinned.** Neko's base is pinned to the digest its "latest" pointed
at on 6 Oct 2026, and Camoufox's Python package to 0.5.7, which pins its own
browser build (Firefox 156.0.1, Camoufox beta.34). A build with no cached
layers made that day came out with the same browser. Moving to a newer one is
a deliberate edit to two lines in the Dockerfile, and a thing to test, rather
than whatever was newest on the day of a rebuild.

**The compiler never ships.** One dependency builds itself from C, so the image is
built in two stages: the compiler, the build and the download happen in the
first, and only Python, the browser and the launcher are copied into the
second. The old single stage installed the compiler in one layer (351MB) and
"removed" it in a later one, which saved nothing. The image went from 6.43GB to
5.95GB. Most of what is left is the browser's bundled fonts, 2.1GB for all
three operating systems.

**Each run records its build.** A session row keeps Docker's id for the image it
ran on, and a profile's history marks the first run on a new build.

## One identity per profile, the same on every launch

An identity is what a site can read about the machine: its screen, graphics
card, fonts, operating system and browser. A profile is meant to look like the
same machine every time.

**It did not.** Only the operating system reached the browser and Camoufox made
the rest up at every launch. Measured on 6 Oct 2026, one profile launched three
times read 1536x864, 1536x864 and 1920x1080, an AMD, an Intel and an AMD
graphics card, and 42, 39 and 39 fonts.

**Now the first launch makes one and every later launch is handed it back.**
Camoufox draws everything from a fingerprint and salts each draw with that
fingerprint, so the same fingerprint gives the same machine. Measured after the
change: one profile launched three times read the same screen, graphics card
and 42 fonts each time, and a second profile read differently on all three.
Through the app, Main kept the same identity across three launches and a check
a page made later read the same screen, card and fonts.

- **Where it is kept.** In the profile's own volume, beside its cookies, as a
  file. It is about 400KB, mostly the media types the machine plays, too big
  for a container's settings. Kept with the cookies, it lives and dies with
  them: a new volume is a new machine, which is why a duplicate profile gets its
  own on its first launch.
- **What the app keeps.** The identity's id, so it can tell the machine changed,
  and what a page read through it, so the Browser profiles dashboard shows the
  machine without asking a browser.
- **What follows the proxy.** The clock and the language follow the proxy's
  country at every launch. The screen, graphics card, fonts and operating system
  never change.
- **Every profile claims Windows,** the most common desktop.
- **A new identity is deliberate:** a button on the profile's Identity tab, with a
  warning that every signed-in site will see a different machine. The next
  launch makes it, once.

## What a website sees

The proxy test proves a proxy works from the server. It says nothing about
whether the browser itself uses it for everything, or what else the browser
gives away. "Check what a site sees" on a profile's Identity tab writes a job;
the browser program opens a tab of its own and reads the outside address and
country a site sees, from the same echo service the proxy test uses, the clock,
the languages, and every address the browser offers for a video call, the usual
way a real address leaks past a proxy. At the same moment the proxy is tested
from the server, or this computer's own address is read when there is no proxy.

Each line says what was seen and whether it matches. A line only gets a verdict
when the comparison is certain; otherwise it says what was seen and leaves the
conclusion to the reader. The result is kept on the profile with when it was
taken.

**Found on its first run, 6 Oct 2026:** with no proxy, the browser's clock was
on UTC and its language en-US while this computer's address is in Toronto. The
clock only follows an address when there is a proxy, so a profile with none
sits on UTC.

## How code drives it

The container runs a small server on a port bound to this machine only, and it
accepts five named instructions and nothing else:

- **what it can see** — signed in as whom, and whether a challenge is in the way.
  Goes to Reddit's front page to find out.
- **a quick look** — the same two answers without moving the page. It reads
  Reddit's own "who am I" with the page's cookies and looks at what is already
  on screen. If the page is not on Reddit it says it could not tell, rather than
  "signed out".
- **search** — a keyword, and the posts come back as data
- **thread** — a post, and its replies come back
- **comment** — a post and some words, and the new comment's address comes back

Named instructions rather than a general way to drive a browser. The page
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

Open the profile's browser on the Browser profiles dashboard and the browser
shows inside the app, in a large window over the list. Turn on the switch under
the picture to take control, sign in to Reddit, and the cookies land in the
profile's own storage, which outlives every restart of the container. It is not
asked again. Then press **Check who is signed in**, so the Reddit dashboard
knows the name. [The Browser profiles dashboard](profiles-dashboard.md) has the
details.

**Pressing Open does not open anything itself.** It writes an `open` job, and the
browser program opens the browser. The window says what it is waiting for until
the browser answers: the browser program to pick the job up, then the container.

**Nobody types the window's password.** The stream asks for a name and a password
before it shows anything, and Neko's own page reads both from `?usr=` and `?pwd=`
in its address. The window is handed that address. The password is new every
time the browser opens, only works on this computer, and is stored on the
session row encrypted with the shell's `encryptSecret`, because the dashboard is
not the program that opened the browser.

**A cold start takes a while.** The image has to come up, Neko has to bring up a
display, and Camoufox has to launch a patched Firefox on it: between 30 and 90
seconds on a Mac, and 14 seconds once the image is warm. The browser counts as
ready when it answers, not when Reddit has finished loading.

The same window is where a captcha gets cleared. When Reddit shows one mid-search
the job stops, the post keeps the status it had, and the Reddit dashboard links
to the profile on the Browser profiles dashboard rather than retrying.

## The proxy

Optional, and the thing to set before posting regularly. Without one, Reddit sees
this computer's own address. A profile picks its proxy on the Browser profiles
dashboard, and proxies are added, tested and deleted on the
[Proxies dashboard](proxies-dashboard.md).

**A browser never opens behind a dead proxy.** When a profile's proxy failed its
last test, opening is refused at once with the proxy's name: "The proxy
US-residential-3 failed its last test at 14:02. Test it on the Proxies
dashboard." Before, it waited five minutes and blamed the browser.

Testing a proxy sends one request through it to a service that echoes back what
the far end saw: the address, the country, the city, the network and the clock.
The clock matters as much as the address, because a browser with a US exit
address sitting on a Moscow clock is an obvious mismatch.

A proxy host that resolves to an address inside the network is refused outright.
Otherwise a proxy row would be a way to make the server fetch its own
neighbours.

The password is encrypted where it is stored and never comes back out to a
browser. The only things that ever decrypt it are the code starting the
container and the proxy test.

## Who is signed in, without asking the browser

After every job, the browser program takes the quick look and writes down what
it saw on the Reddit account: the signed-in name, whether Reddit is asking the
browser something, what, and when that was read. A job that failed still gets
the look, because a failed search is often a sign-out or a captcha.

The Reddit dashboard and Settings read those saved answers and never ask a
browser. They used to, and the question sent the page to Reddit's front page.
The Reddit dashboard asks every two seconds while a search runs, so a sign-in
form being typed into in the window was replaced every two seconds.

The look that moves the page runs only for a `check` job, which is the **Check
who is signed in** button.

## One browser per profile, closed gently

One live browser per browser profile, held to one by the database rather than by
hoping. A second container opening the same cookie storage would corrupt it.

**Closing asks first.** The browser is asked to stop and given ten seconds,
then removed, the way anti-detect does it. The launcher answers the ask by
closing Firefox properly, because Firefox writes cookies to disk on a delay and
a browser removed seconds after a sign-in could lose the sign-in. The cookies
stay; only the container goes.

**An idle one is closed.** A browser nobody has used for an hour is shut down,
because an idle one still holds memory. The hour is a setting, on the Browsers
tab of Settings, from 5 minutes to a day.

**A dead one is noticed.** Every pass of the shell's ticker asks Docker whether
each browser marked running still is. One that stopped on its own, or was
removed by hand, is marked `error` with the reason and the time. The next job
opens a fresh one instead of failing three times against a port nothing
answers on.

**A leftover one is removed.** Every promo browser carries promo's label and the
id of its session row. On the same pass, any container no live row claims is
closed and removed, keeping its volume. Several worktrees share this Mac's
Docker, each with its own promo database, so a container also carries a mark
made from its database's address, and only containers with this database's
mark are ever touched.

## How many run at once

**A limit, for the whole machine.** The Browsers tab of Settings says how many
browsers may be open at once: 3 by default, from 1 to 20. The tab saves itself
1.2 seconds after the last keystroke, or at once on Enter, and says "Saved" in
the top bar; there is no Save button. It counts every
person's, because the memory is the machine's. Opening one more is refused at
once, in words, never queued: "2 browsers are open, which is the limit. Stop
one on the Browser profiles dashboard, or raise the limit in Settings." Before
the limit, the only ceiling was the forty ports the code tries, about 60GB.

The count and the opening happen as one step under a database lock every copy
of the browser program shares, so two opens at the same moment cannot both
slip under it. Lowering the limit closes nothing: the browsers already open
stay, and no more open until enough have closed.

**A ceiling on each browser.** Each runs with 1,536MB of memory, no swap on
top, and one processor. Past the memory line Docker stops it, and the
dead-browser check below says so. The figures started from anti-detect's
1,536MB and half a processor, then were measured on 6 Oct 2026 with real
Reddit searches: memory peaked at 1.04GB, so it stayed; half a processor sat at
its cap the whole time and a warm search took 9 to 10 seconds against 1 to 2 on
a full one, so it became one.

**A port something else holds is stepped over.** Each browser takes three ports
counted up from 7900, 8900 and 9900, and the database says which are free. A
port can still be held where the database cannot see it: by a browser being
closed, which keeps its ports for up to ten seconds after its row says stopped,
or by another program on the machine. When Docker refuses one, that attempt is
removed without a trace in the profile's history and the next free ports are
tried. Running profiles side by side found this on the first try.

## Why it runs in its own process

A search through a real browser takes tens of seconds. The app's shared
background loop fires every fifteen and runs every other job in turn, so a
browser search sitting on it would hold up everything else.

So the browser has a process of its own, started with `npm run social:browser`,
and the two talk through a job table. Pressing Search writes a row and returns;
the browser process picks it up. Two copies of that process are safe: a job is
claimed before any work starts, and a claim that goes stale is handed back after
ten minutes and given up after three tries. Ten, because opening a cold browser
can take five and a comment typed at a person's pace up to four more; a comment
is never handed back at all.

**Several profiles work at the same time.** Each job is filed under the
profile it works in, its lane: a dashboard job names its profile, and a Reddit
job works in its account's, the person's oldest Reddit account when the job
names none. The queue and the runner pick that account by one rule, so a job
always runs in the profile it was filed under. Jobs in one lane run one at a time and in order,
because a browser has one page and one driver. Jobs in different lanes run side
by side, as many at once as the limit above allows, so a two-minute comment on
one profile no longer holds up a search on another. The claim skips any profile
that already has a job running, in the same statement, under a lock every copy
of the program shares, so two copies cannot both start work on one profile.
Measured on 6 Oct 2026: site checks on two profiles both started in the same
second, while a second check on the first waited for the first to finish.

Told to stop, the program takes no new work and waits for every job in flight.
A raised limit is used within fifteen seconds, without a restart.

**It is the only program that opens, drives or closes a browser.** The command
key a browser is started with lives in that program's memory and nowhere else.
When Settings opened browsers from the site, the site and the browser program
each held keys the other did not, and each closed any browser it had no key
for. Signing in from Settings and then pressing Search closed the browser that
had just been signed in. Now open, close and check are jobs like a search.

A restart of the browser program loses its keys. On the next job it closes the
browser it can no longer talk to and opens a fresh one on the same cookies.
With one owner there is no other program's browser to close by mistake.

The shared loop keeps only the quick jobs: re-testing a proxy every ten minutes,
and the three browser checks above, none of which needs a key.
