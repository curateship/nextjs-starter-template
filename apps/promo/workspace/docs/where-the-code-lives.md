# Where the code lives

Promo posts to social networks. Reddit is the first and the others are coming,
so the folders are split by one question: **will the next network share this, or
is it Reddit's own?**

Shared sits in `social/`. Reddit's own sits in `social/reddit/`. Adding
Instagram is adding `social/instagram/` beside it and touching nothing else.

The isolated browser sits one level further out, in `browser/`, because it is
not a social feature at all. Tyler, 5 Oct 2026: "proxy and browser isolation is
an app wide feature, not just a reddit feature."

## What every network shares

| Folder | What is in it |
| --- | --- |
| `src/server/browser/` | The isolated browser and everything it needs: the proxy, profile and session tables, proxy testing and the guard against inside addresses, making a profile, Docker, the typed command client, and opening, closing and watching a browser. It knows nothing about any network. |
| `src/server/social/` | The accounts, saved keywords, the job queue, the runner that takes a job to its account, its profile and its browser, AI drafting, and the regular upkeep. |
| `src/lib/social/` | What both halves of the app need at runtime: statuses, job kinds, proxy kinds, the comment length cap, and the wordings. |
| `src/lib/browser/` | The Proxies and Browser profiles dashboards' wordings, and how the bell draws a dead-proxy notice. |
| `src/lib/api/browser/` | The two dashboards' endpoints. Open, close, restart and check never touch a browser; each writes a job. |
| `src/components/browser/` | The Proxies and Browser profiles dashboards, their windows, and the browser window inside the app. |
| `src/server/social/voices.ts` | Voices: the words the AI is told, shared by any number of accounts on any network. |
| `src/lib/api/social/account.ts` | The Reddit account and the status the Reddit dashboard reads, as endpoints. |
| `src/lib/api/social/voices.ts` | The Voices dashboard's endpoints. |
| `src/components/social/account-settings.tsx` | The Reddit account tab in Settings: which profile and which voice the account uses. |
| `src/components/social/voices/` | The Voices dashboard and its window. |

## What belongs to Reddit alone

| Folder | What is in it |
| --- | --- |
| `src/server/social/reddit/` | Searching Reddit, reading a thread, posting a comment, and the ranking that decides which posts are worth answering. |
| `src/lib/social/reddit/options.ts` | Reddit's own sort orders and time windows, and the key its screen remembers its panels under. |
| `src/lib/api/social/reddit/` | The endpoints the Reddit screen calls. |
| `src/components/social/reddit/` | The three panels of the Reddit screen. |
| `docker/browser/routines/reddit.py` | The only file that knows how a Reddit page is put together. |

## The browser container

`docker/browser/` builds one image, `promo-browser`, that serves every network.
It knows nothing about Reddit: what it can be asked to do comes from
`routines/`, one module per network, and a request names both the network and
the routine — `/reddit/search` runs the `search` that `routines/reddit.py`
registered.

Two networks can each have a routine called `search` without colliding, because
`routines/__init__.py` gathers them under a prefixed name.

## Adding the next network

1. `docker/browser/routines/instagram.py`, exposing the same routines: what it
   can see (both the full look and the quick one that does not move the page),
   search, read a thread, post. Add it to `NETWORKS` in
   `routines/__init__.py`.
2. `src/server/social/instagram/` for searching, reading and posting.
3. `src/lib/social/instagram/options.ts` for anything only Instagram has.
4. `src/components/social/instagram/` and a route beside `admin/reddit.tsx`.
5. Add the calls to `src/server/browser/command.ts`, which already carries the
   network in every address.
6. The browser program writes down who is signed in after each job, for each
   account inside the profile it used. That loop in `src/server/social/runner.ts`
   reads Reddit's quick check today; Instagram adds its own beside it.

Nothing else in `social/` or `browser/` should need changing. If it does, that is
the sign the thing being added was shared after all and belongs one level up.

## Who opens a browser

Only the browser program, `worker/src/social-browser.ts`. It starts, drives and
closes every browser, and it is the only program holding the key to one. A
dashboard writes an `open`, `close` or `check` job and reads the rows the
browser program writes. The shell's ticker asks Docker about containers, which
needs no key, and never opens or drives one.

## Three secrets and where each lives

- **The proxy password** is encrypted with the shell's own `encryptSecret` and
  stored. It never comes back out to a browser: the read that builds the
  settings screen has a `hasPassword` flag and no password field. The only code
  that decrypts it is the code building the container's environment, and the
  proxy test.
- **The command token** drives a signed-in browser, so it is held in the browser
  program's memory and never written down. A restart loses it, and the browser
  it belonged to is closed and replaced on the next job rather than left
  running unreachable. That is the right trade: a stale container is cheap, a
  leaked token that drives a signed-in account is not.
- **The window password** is what the stream window asks for. A dashboard has to
  show it and is not the program that opened the browser, so it is stored on
  the session row, encrypted with `encryptSecret` the same way a proxy password
  is. It only works on this computer and is new every time a browser opens.

## What stays where it is

- **The tables keep their `promo_` names**, including the ones that moved to
  `browser/`. A table is renamed for a very good reason and this is not one.
  `promo_accounts` already carries a `platform` column, which is how a second
  network shares them.
- **The route is `/admin/reddit`.** A folder name is ours to change and an
  address is not.
