# Where the code lives

Promo posts to social networks. Reddit is the first and the others are coming,
so the folders are split by one question: **will the next network share this, or
is it Reddit's own?**

Shared sits in `social/`. Reddit's own sits in `social/reddit/`. Adding
Instagram is adding `social/instagram/` beside it and touching nothing else.

## What every network shares

| Folder | What is in it |
| --- | --- |
| `src/server/social/` | The tables, accounts, proxies, saved keywords, the job queue, the runner that hands a job to a network, AI drafting, and the regular upkeep. |
| `src/server/browser/` | The isolated browser: Docker, the typed command client, starting and stopping a session. It knows nothing about any network. |
| `src/lib/social/` | What both halves of the app need at runtime: statuses, job kinds, proxy kinds, the comment length cap, and the wordings. |
| `src/lib/api/social/account.ts` | The account, the proxy and the browser, as endpoints. |
| `src/components/social/account-settings.tsx` | The settings tab for all of it. |

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

1. `docker/browser/routines/instagram.py`, exposing the same four routines:
   what it can see, search, read a thread, post. Add it to `NETWORKS` in
   `routines/__init__.py`.
2. `src/server/social/instagram/` for searching, reading and posting.
3. `src/lib/social/instagram/options.ts` for anything only Instagram has.
4. `src/components/social/instagram/` and a route beside `admin/reddit.tsx`.
5. Add the calls to `src/server/browser/command.ts`, which already carries the
   network in every address.

Nothing in `social/` or `browser/` should need changing. If it does, that is
the sign the thing being added was shared after all and belongs one level up.

## Two secrets and where each lives

- **The proxy password** is encrypted with the shell's own `encryptSecret` and
  stored. It never comes back out to a browser: the read that builds the
  settings screen has a `hasPassword` flag and no password field. The only code
  that decrypts it is the code building the container's environment.
- **The command token and the stream password** are held in memory in the
  server process and never written down. A restart loses them, and the session
  they belonged to is shut down and replaced rather than left running
  unreachable. That is the right trade: a stale container is cheap, a leaked
  token that drives a signed-in account is not.

## What stays where it is

- **The tables keep their `promo_` names.** A table is renamed for a very good
  reason and this is not one. `promo_accounts` already carries a `platform`
  column, which is how a second network shares them.
- **The route is `/admin/reddit`.** A folder name is ours to change and an
  address is not.
