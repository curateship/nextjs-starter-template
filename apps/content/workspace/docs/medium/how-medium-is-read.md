# How Medium is read

Promo reads Medium in a real browser, never with a plain request, and reads
Medium's own data rather than the screen wherever Medium has it. The only file
that knows how a Medium page is put together is
`docker/browser/routines/medium.py`.

## Why a browser

Measured on 21 Oct 2026: a plain request for a Medium story, its search page or
its data gets Cloudflare's "Attention Required" page (status 403). Medium's
public feeds answer a plain request, but nothing else does. From inside a page
already on medium.com, every address below answers with plain data.

## Medium's own data

Each answer starts with `])}while(1);</x>`, which is cut off before reading.

| Address | What it gives |
| --- | --- |
| `/feed/tag/<tag>` | A tag's ten newest stories |
| `/feed/<publication>` | A publication's ten newest |
| `/feed/@<writer>` | A writer's ten newest |
| `/p/<story>?format=json` | One story: its words, its writer and their followers, its publication, tags, claps and how many responses |
| `/p/<story>/responses` | The responses under a story, each a story of its own with its writer, words, claps and whether the writer hid it |
| `/@<writer>?format=json` | When a writer joined and their followers |
| `/<publication>?format=json` | A publication's name, about words, menu, and what the account looking may do there |

Search words have no data address that answered, so the reader opens Medium's
search page and reads its results, drawn as `article[data-testid="post-preview"]`.
Each found story is then read from its own data. Ten stories take about two
seconds.

Who is signed in comes from `window.__APOLLO_STATE__`, the data every Medium
page is drawn from: its `ROOT_QUERY.viewer` is null signed out.

## What has been proved, and what has not

**Proved against the real site on 21 Oct 2026**, by running `medium.py`'s own
code in a real Chromium on medium.com, signed out, and then the app's own search
code writing into the local database:

- a tag, search words, a publication and a writer each found ten stories, with
  their writers' followers, claps and responses;
- a story read with its five top responses;
- a response and an article read again;
- the signed-out look;
- a publication, with its submission guidelines read from its menu.

The real reader is Camoufox, which is Firefox, so the first run there is the
proof for Camoufox.

**Not proved**, because it needs a real Medium account: everything signed in.
Responding, answering one line, publishing, editing, deleting, the stats page,
the Medium list, following a writer, and what a publication lets an account do.
Each was written from how Medium's pages are put together. Each step says which
step failed when it fails, and every write is checked afterwards against
Medium's own data rather than trusted. The same goes for the Medium app on a
phone.

## The tests

- `docker/browser/test_medium.py` checks the reading code against answers with
  the shapes measured on 21 Oct 2026, the words cut to a line. Run from
  `apps/promo` with `python3 -m unittest discover -s docker/browser -p "test_*.py"`.
- `src/server/social/medium/medium.test.ts` covers the server: keywords, the
  ranking, finding and hiding stories, every check on Post, sending, Try again,
  answers, readings, articles, publications, pausing, the sign-in link and the
  spend line, with the browser stood in for.
- `rack/test_promo_rack.py` has `MediumAppTest` for the phone's response step.
