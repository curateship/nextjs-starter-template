# Where the code lives

Promo posts to social networks: Reddit, and since phone farm file 06
Instagram and TikTok. The folders are split by one question: **will the next
network share this, or is it one network's own?**

Shared sits in `social/`. Reddit's own sits in `social/reddit/`. Instagram and
TikTok share `social/phone-apps/`, because on Promo's side the two are the
same steps in two apps; what differs between them is a table of limits and
each app's buttons on the rack.

The isolated browser sits one level further out, in `browser/`, because it is
not a social feature at all. Tyler, 5 Oct 2026: "proxy and browser isolation is
an app wide feature, not just a reddit feature."

## What every network shares

| Folder | What is in it |
| --- | --- |
| `src/server/browser/` | The isolated browser and everything it needs: the proxy, profile and session tables, proxy testing and the guard against inside addresses, making a profile, Docker, the typed command client, opening, closing and watching a browser, the limit on how many are open (`settings.ts`), and backups (`backups.ts`). It knows nothing about any network. |
| `src/server/social/` | The accounts, saved keywords, the job queue with one lane per profile, the runner that takes a job to its account, its profile and its browser, AI drafting, and the regular upkeep. |
| `src/lib/social/` | What both halves of the app need at runtime: statuses, job kinds, proxy kinds, the comment length cap, and the wordings. |
| `src/lib/browser/` | The Proxies and Browser profiles dashboards' wordings, the bounds of the browser settings, and how the bell draws a dead-proxy notice. |
| `src/lib/api/browser/` | The two dashboards' endpoints and the Browsers tab's. Open, close, restart, check, backup and restore never touch a browser; each writes a job. |
| `src/components/browser/` | The Proxies and Browser profiles dashboards, their windows, the browser window inside the app, and the Browsers tab in Settings. |
| `src/server/social/voices.ts` | Voices: the words the AI is told, shared by any number of accounts on any network. |
| `src/lib/api/social/account.ts` | Settings → Reddit account's endpoints, for the oldest account in use. |
| `src/server/social/account-list.ts`, `src/lib/api/social/reddit-accounts.ts` | Every account on every platform as a list, with its status and platform, and the actions on ticked rows: the Accounts dashboard at `/admin/accounts`. |
| `src/lib/social/account-status.ts` | Warming up, Ready, Working and Banned, and the order the Projects dashboard lists accounts in. |
| `src/server/social/projects.ts`, `src/lib/api/social/projects.ts` | Projects: a description, the networks it uses, accounts and keywords, the check that an account comments only on its own project's posts, and which project an old screen's address now opens. |
| `src/lib/social/networks.ts` | The networks Promo has built, which a project can add ([Networks as modules](network-modules.md)). |
| `src/components/social/projects/` | The Projects table, and a project's own dashboard: the page that picks the network (`workspace.tsx`), the three columns any network fills (`project-columns.tsx`) and its project column. |
| `src/components/social/accounts/` | The Accounts dashboard, its Add account window and the status badge. |
| `src/lib/api/social/voices.ts` | The Voices dashboard's endpoints. |
| `src/components/social/account-settings.tsx` | The Reddit account tab in Settings: which profile and which voice the account uses. |
| `src/components/social/voices/` | The Voices dashboard and its window, with Try it. |
| `src/server/social/pause.ts` | Pausing an account or a whole project. |
| `src/server/social/notices.ts`, `src/lib/social/notice-words.ts`, `src/lib/social/notices.ts`, `src/lib/api/social/notices.ts` | Promo's bell notices: writing them, their headings, their icons, and where each opens. |
| `src/server/social/failures.ts` | What did not reach Reddit, read off its job: the Comments tab's Failed list, and the notice each failure rings. |
| `src/server/social/ai-tasks.ts` | The smaller things asked of the AI: the rules check, rewrites, keyword ideas, a post of your own, and trying a voice. All through `askModel` in `drafts.ts`. |
| `src/server/social/today.ts`, `src/lib/api/social/today.ts`, `src/components/social/today/` | The Today tab. |

## What belongs to Reddit alone

| Folder | What is in it |
| --- | --- |
| `src/server/social/reddit/` | Searching Reddit, reading a thread, posting a comment, and the ranking that decides which posts are worth answering. Also searching again by itself (`timed-searches.ts`), posts of your own (`own-posts.ts`), help-only posts (`help-posts.ts`), self-promotion threads (`promo-threads.ts`), what you said before (`past-answers.ts`), and deleting and editing a sent comment (`change-comment.ts`). |
| `src/lib/social/reddit/options.ts` | Reddit's own sort orders and time windows, the tabs across its middle column, and the keys the Projects dashboard remembers its columns under. |
| `src/lib/api/social/reddit/` | The keyword, post, draft and Post endpoints the Projects dashboard calls. |
| `src/components/social/reddit/` | Reddit's module (`reddit-module.tsx`): the keywords panel, the tabs and the posts list, the post-and-comment panel with the accounts dropdown (`account-picker.tsx`), and the Jobs window (`jobs-window.tsx`), which a project's dashboard shows when Reddit is picked. |
| `docker/browser/routines/reddit.py` | The only file that knows how a Reddit page is put together. Its Reddit app twin is `rack/promo_rack.py`. |

## What belongs to the networks that run on phones

Instagram and TikTok run on a phone only, in the real app, never in the
browser. Their code is shared between the two, because nothing on Promo's
side differs except limits.

| Folder | What is in it |
| --- | --- |
| `src/lib/social/networks.ts` | `PHONE_ONLY_NETWORKS`: the networks whose accounts may only run on a phone. |
| `src/lib/social/phone-apps.ts` | Their limits (caption, hashtags, bio, an answer's length), the inbox's kinds and statuses, and the words both halves draw. |
| `src/server/social/phone-apps/` | The shapes the rack's answers are checked against (`calls.ts`), the daily reading with the shadowban line and post numbers (`health.ts`), posting (`posts.ts`), the AI caption (`captions.ts`), the profile (`profile.ts`), messages and comments for every phone account, Reddit's included (`inbox.ts`), and what the module reads (`module.ts`). |
| `src/lib/api/social/phone-apps.ts` | The module's, the Messages dashboard's and the profile card's endpoints. |
| `src/components/social/phone-apps/` | The module (`app-module.tsx`), its Posts and Comments tables, the new post, the answer box, the accounts dropdown, and the Messages dashboard. |
| `rack/promo_rack.py` | Each app's steps, read off `APP_SCREENS`, and the notifications the rack reads once a minute. |

[Instagram and TikTok accounts, and the daily reading](instagram/accounts-and-the-daily-reading.md)
has the rest.

## Phones

Real Android phones are app-wide, like the browser: a device an account runs
on, belonging to no network.

| Folder | What is in it |
| --- | --- |
| `src/server/phones/` | The phones as records, the rack's side (pairing, signed messages, check-ins, the action queue), sending a job's step to a phone (`dispatch.ts`), health and the bell, the self-test, step pictures, the setup check and the Wi-Fi address guard (`setup.ts`), and wiping (`wipe.ts`). |
| `src/lib/phones/` | The phone farm's fixed lists and words, the setup check's lines (`setup-check.ts`) and the rack mix (`rack-mix.ts`). |
| `src/lib/api/phones/` | The Phones dashboard's endpoints. None of them talks to a phone; each writes an action the rack picks up. |
| `src/components/phones/` | The Phones dashboard, a phone's window and its tabs, the screen window, and the Rack, Self-test and Mix windows. |
| `rack/` | The program on the computer at home that drives the phones over adb: `promo_rack.py`, with every action, the Reddit app's steps, and the hands that tap, swipe and type like a person. The second file, beside `docker/browser/routines/reddit.py`, that knows how Reddit is put together: this one for the Reddit app. |

What ties an account to a phone, and the rules for important and throwaway
accounts, are about accounts, so they sit in `src/server/social/`:
`apart.ts` (the two groups kept apart) and `move-to-phone.ts` (a throwaway
moved from its browser profile to a phone). A comment a phone posted gets its
link from `src/server/social/reddit/comment-link.ts`.

## The browser container

`docker/browser/` builds one image, `promo-browser`, that serves every network.
It knows nothing about Reddit: what it can be asked to do comes from
`routines/`, one module per network, and a request names both the network and
the routine — `/reddit/search` runs the `search` that `routines/reddit.py`
registered.

Two networks can each have a routine called `search` without colliding, because
`routines/__init__.py` gathers them under a prefixed name.

Two pieces belong to no network. `routines/browser.py` reads what the browser
itself gives away, its identity and what a website sees, and is asked for as
`/browser/identity` and `/browser/site_check`. `human.py`, beside `routines/`,
is the person-pace helper every network's routines type and read with.

## Adding the next network

A network runs either in the browser, like Reddit, or on a phone only, like
Instagram and TikTok. Every network gets a module on a project's dashboard and
never a route or a left menu entry of its own: add it to `NETWORKS` in
`src/lib/social/networks.ts`, and a branch for it in
`src/components/social/projects/workspace.tsx` where the modules are picked
([Networks as modules](network-modules.md)).

### One that runs in the browser

1. `docker/browser/routines/<network>.py`, exposing the same routines: what it
   can see (both the full look and the quick one that does not move the page),
   search, read a thread, post. Add it to `NETWORKS` in
   `routines/__init__.py`.
2. `src/server/social/<network>/` for searching, reading and posting.
3. `src/lib/social/<network>/options.ts` for anything only it has.
4. `src/components/social/<network>/` with its module, the middle and right
   columns it fills on a project's dashboard, beside
   `src/components/social/reddit/reddit-module.tsx`.
5. Add the calls to `src/server/browser/command.ts`, which already carries the
   network in every address.
6. The browser program writes down who is signed in after each job, for each
   account inside the profile it used. That loop in `src/server/social/runner.ts`
   reads Reddit's quick check; the new network adds its own beside it.

### One that runs on a phone only

How Instagram and TikTok were added (phone farm file 06).

1. Add it to `PHONE_ONLY_NETWORKS` in `src/lib/social/networks.ts`. Adding an
   account to it then offers phones only, and a browser profile is refused
   (`checkPicks` in `src/server/social/accounts.ts`).
2. Its app's package in `APP_PACKAGES` and its buttons in `APP_SCREENS` in
   `rack/promo_rack.py`, and its steps registered in `ACTIONS` and
   `REHEARSALS` there, the same seven as Instagram's: state, quick_state,
   health, profile, post, inbox, reply.
3. The same names in `PHONE_APP_ROUTINES` and their words in
   `src/lib/phones/options.ts`, or the phone refuses them before anything is
   sent. The post and the profile join `NEEDS_A_PASS` in
   `src/server/phones/action-checks.ts`.
4. Its limits in `src/lib/social/phone-apps.ts`. If its steps answer in the
   same shapes, `src/server/social/phone-apps/` and the module in
   `src/components/social/phone-apps/` serve it with nothing else to change.
5. Its package's notifications are then read by the rack for messages and
   comments (`alert_kind` in `rack/promo_rack.py`).

Nothing else in `social/`, `browser/` or `phones/` should need changing. If it
does, that is the sign the thing being added was shared after all and belongs
one level up.

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
- **The old route `/admin/reddit` still answers,** by sending to
  `/admin/projects`. A folder name is ours to change and an address is not.
  `/admin/today`, `/admin/comments`, `/admin/jobs` and `/admin/reddit-accounts`
  send on the same way, each to its tab or window in a project.
