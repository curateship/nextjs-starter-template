"""What the browser actually does on Medium.

The only file in the app that knows how a Medium page is put together, the
way `reddit.py` is for Reddit. When Medium redesigns, the fix is here.

Every routine takes the live Playwright page and returns plain data the
TypeScript side stores. None of them touch the database or decide what to
write: the app does that, and only after a person pressed a button.

Two ways to read Medium, in this order:

1. **Medium's own data.** Measured on 21 Oct 2026 from a page already on
   medium.com, these answer with plain data instead of a page:
   - `/feed/tag/<tag>`, `/feed/<publication>` and `/feed/@<writer>` are
     Medium's public feeds, each holding the newest ten stories;
   - `/p/<story>?format=json` is one story: its words, its writer and their
     followers, its publication, its tags, its claps and how many responses
     it has, all in one answer;
   - `/p/<story>/responses` is the responses under a story, each a story of
     its own with its writer, words and claps;
   - `/@<writer>?format=json` is a writer's page: when they joined and how
     many follow them;
   - `/<publication>?format=json` is a publication: its name, its about
     words, its menu (where "Submission guidelines" usually is), and what the
     account looking may do there (`virtuals.permissions`).
   A plain request from outside a browser gets Cloudflare's "Attention
   Required" page for all but the feeds, so these are asked from inside the
   page, with its cookies, the way `reddit.py` asks Reddit's JSON. The JSON
   answers start with `])}while(1);</x>`, which is cut off before reading.
2. **The rendered page**, for what has no data address: the search page,
   whose results are drawn as `article[data-testid="post-preview"]`, and
   everything an account writes.

What has been seen working: every read above, signed out, in a real
Chromium on 21 Oct 2026. What has not: anything signed in. Responding,
publishing, editing, deleting, the stats page, the list button and the
follow button were written from how Medium's pages are put together, and
the first run with a real account is their test. Each one says which step
failed when it fails, and every write is checked afterwards against
Medium's own data rather than trusted.
"""

import html
import json
import random
import re
import time
import urllib.parse

import human

NAV_TIMEOUT_MS = 45_000
FETCH_TIMEOUT_MS = 20_000

# What every data answer starts with, so a script cannot read it as code.
JSON_GUARD = "])}while(1);</x>"

# A story's words are kept to this many characters: enough for the AI to
# answer and for a sentence to be picked, and short enough to store.
STORY_TEXT_CHARS = 6_000

# How many of a story's responses are kept for the AI to read first.
TOP_RESPONSES = 5

# Medium's search page draws ten results before it asks to scroll.
SEARCH_LIMIT = 20

# The paragraph kinds in a story's data that are words: a paragraph, the
# two heading sizes, the two quote styles, code and the two list kinds.
# Pictures, embeds and dividers are left out.
WORD_PARAGRAPHS = {1, 3, 6, 7, 8, 9, 10, 13}

# A visit around a response. Medium is read more slowly than a feed of
# links, so the time before is spent reading one or two stories.
FEED_BEFORE_SECONDS = (60, 150)
STORIES_BEFORE = (1, 2)
FEED_AFTER_SECONDS = (20, 60)
VISIT_BUDGET_SECONDS = 800
TYPING_SECONDS_PER_CHARACTER = 0.25
RESPONSE_RESERVE_SECONDS = 150

# A warming account's day on Medium.
WARM_UP_READ_SECONDS = (150, 360)
WARM_UP_STORIES = (2, 4)
# A writer is followed on about one warm-up day in three, never more than one a day.
FOLLOW_CHANCE = 0.35

# How long the app waits for a just-sent response to show in Medium's data.
LANDED_WAIT_SECONDS = 25

STORY_LINKS = "article[data-testid='post-preview'] a[href]"


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


def _short(error):
    return (str(error) or error.__class__.__name__).splitlines()[0][:200]


# Medium's editor turns straight quotes and dashes into curly ones, so words
# are compared with both put back to plain.
PLAIN_MARKS = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " "})


def _plain(text):
    """Words as they compare: plain quotes and dashes, one space, lower case."""
    return re.sub(r"\s+", " ", (text or "").translate(PLAIN_MARKS)).strip().lower()


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


def _on_medium(page):
    host = urllib.parse.urlparse(page.url or "").hostname or ""
    return host == "medium.com" or host == "www.medium.com"


def _ensure_on_medium(page):
    """A data address is asked from a medium.com page, so its cookies go with it."""
    if not _on_medium(page):
        _goto(page, "https://medium.com/")
        page.wait_for_timeout(random.randint(1500, 3000))


def _fetch(page, path, accept="application/json"):
    """Asks for a medium.com address from inside the page. Status 0 is no answer at all."""
    script = """
    async ([target, accept, limit]) => {
      const stop = new AbortController()
      const timer = setTimeout(() => stop.abort(), limit)
      try {
        const response = await fetch(target, {
          headers: { accept },
          credentials: "include",
          cache: "no-store",
          signal: stop.signal,
        })
        return { ok: response.ok, status: response.status, body: await response.text() }
      } catch (error) {
        return { ok: false, status: 0, body: "" }
      } finally {
        clearTimeout(timer)
      }
    }
    """
    return page.evaluate(script, [path, accept, FETCH_TIMEOUT_MS]) or {"ok": False, "status": 0, "body": ""}


def _data(page, path):
    """Medium's data for an address, or None when it refused or is not data."""
    answer = _fetch(page, path)
    if not answer.get("ok"):
        return None
    body = answer.get("body") or ""
    if body.startswith(JSON_GUARD):
        body = body[len(JSON_GUARD):]
    try:
        parsed = json.loads(body)
    except (ValueError, TypeError):
        return None
    if not isinstance(parsed, dict) or not parsed.get("success"):
        return None
    return parsed.get("payload") or {}


def _story_id(value):
    """A story id the app asked about, checked so it can only ever be one."""
    text = (value or "").strip()
    if not re.fullmatch(r"[0-9a-f]{8,16}", text):
        raise CommandError("the story id is not one Medium uses")
    return text


def _slug(value, routine):
    text = (value or "").strip().lstrip("@")
    if not re.fullmatch(r"[A-Za-z0-9._-]{1,120}", text):
        raise CommandError("%s: that is not a name Medium uses in an address" % routine)
    return text


def _seconds(milliseconds):
    return milliseconds / 1000 if isinstance(milliseconds, (int, float)) and milliseconds > 0 else None


def _paragraph_text(paragraphs):
    """A story's words, paragraph by paragraph, capped."""
    out = []
    total = 0
    for paragraph in paragraphs or []:
        if paragraph.get("type") not in WORD_PARAGRAPHS:
            continue
        text = (paragraph.get("text") or "").strip()
        if not text:
            continue
        out.append(text)
        total += len(text) + 2
        if total >= STORY_TEXT_CHARS:
            break
    return "\n\n".join(out)[:STORY_TEXT_CHARS]


def _story_from_data(payload, story_id):
    """One story out of `/p/<id>?format=json`, in the shape the app stores."""
    value = payload.get("value") or {}
    references = payload.get("references") or {}
    virtuals = value.get("virtuals") or {}
    users = references.get("User") or {}
    stats = references.get("SocialStats") or {}
    collections = references.get("Collection") or {}
    writer_id = value.get("creatorId") or ""
    writer = users.get(writer_id) or {}
    followers = (stats.get(writer_id) or {}).get("usersFollowedByCount")
    collection = collections.get(value.get("homeCollectionId") or "") or {}
    paragraphs = ((value.get("content") or {}).get("bodyModel") or {}).get("paragraphs") or []
    title = value.get("title") or ""
    words = _paragraph_text(paragraphs)
    # The title is the story's first paragraph; it is kept once, as the title.
    if words.startswith(title):
        words = words[len(title):].lstrip()
    return {
        "storyId": story_id,
        "url": value.get("mediumUrl") or "https://medium.com/p/%s" % story_id,
        "title": title,
        "subtitle": virtuals.get("subtitle") or "",
        "writerId": writer_id,
        "writerHandle": writer.get("username") or "",
        "writerName": writer.get("name") or "",
        "writerFollowers": int(followers) if isinstance(followers, (int, float)) else None,
        "publicationSlug": collection.get("slug") or "",
        "publicationName": collection.get("name") or "",
        "tags": [tag.get("slug") for tag in virtuals.get("tags") or [] if tag.get("slug")][:5],
        "postedSeconds": _seconds(value.get("firstPublishedAt")),
        "claps": int(virtuals.get("totalClapCount") or 0),
        "responseCount": int(virtuals.get("responsesCreatedCount") or 0),
        "membersOnly": bool(virtuals.get("isLockedPreviewOnly") or value.get("isSubscriptionLocked")),
        "allowResponses": value.get("allowResponses") is not False,
        "deleted": bool(value.get("deletedAt")),
        "text": words,
    }


def _story(page, story_id):
    payload = _data(page, "/p/%s?format=json" % story_id)
    if payload is None:
        return None
    return _story_from_data(payload, story_id)


def _feed_ids(page, path):
    """The story ids in one of Medium's feeds, newest first."""
    answer = _fetch(page, path, "application/rss+xml, text/xml")
    if not answer.get("ok"):
        raise CommandError("search: Medium's feed answered %s" % (answer.get("status") or "nothing"))
    body = answer.get("body") or ""
    ids = re.findall(r"<guid[^>]*>https://medium\.com/p/([0-9a-f]{8,16})</guid>", body)
    seen = []
    for story_id in ids:
        if story_id not in seen:
            seen.append(story_id)
    return seen


def _search_page_ids(page, query):
    """The story ids on Medium's search page for these words, best match first."""
    _goto(page, "https://medium.com/search?q=%s" % urllib.parse.quote(query))
    try:
        page.locator("article[data-testid='post-preview']").first.wait_for(state="attached", timeout=20_000)
    except Exception:  # noqa: BLE001 - an empty page is reported below
        signs = _page_signs(page)
        if signs["blocked"]:
            raise CommandError("search: %s" % signs["reason"])
        return []
    script = """
    () => {
      const out = []
      for (const card of document.querySelectorAll("article[data-testid='post-preview']")) {
        for (const link of card.querySelectorAll("a[href]")) {
          const path = (link.getAttribute("href") || "").split("?")[0]
          const found = path.match(/(?:\\/p\\/|-)([0-9a-f]{8,16})$/)
          if (found) { out.push(found[1]); break }
        }
      }
      return out
    }
    """
    ids = page.evaluate(script) or []
    seen = []
    for story_id in ids:
        if story_id not in seen:
            seen.append(story_id)
    return seen[:SEARCH_LIMIT]


def medium_search(page, args):
    """The stories a keyword finds, each read from Medium's own data.

    A tag, a publication and a writer are read off their public feed. Search
    words go through the search page. Every story is then read once from
    `/p/<id>?format=json`, which brings its writer's followers, its claps and
    its response count in the same answer (two seconds for ten, measured
    21 Oct 2026). A story whose data does not answer is left out and counted.
    """
    kind = (args.get("kind") or "").strip()
    value = (args.get("value") or "").strip()
    if not value:
        raise CommandError("search: nothing to search for")

    if kind == "search":
        ids = _search_page_ids(page, value[:200])
    else:
        _ensure_on_medium(page)
        if kind == "tag":
            path = "/feed/tag/%s" % _slug(value, "search")
        elif kind == "publication":
            path = "/feed/%s" % _slug(value, "search")
        elif kind == "writer":
            path = "/feed/@%s" % _slug(value, "search")
        else:
            raise CommandError("search: Medium has no keyword kind called %s" % kind)
        ids = _feed_ids(page, path)

    stories = []
    unread = 0
    for story_id in ids:
        story = _story(page, story_id)
        if story is None:
            unread += 1
            continue
        story["position"] = len(stories)
        stories.append(story)
        page.wait_for_timeout(random.randint(150, 450))
    return {"stories": stories, "unread": unread}


def _responses(page, story_id):
    """The responses under a story, as Medium's data lists them."""
    payload = _data(page, "/p/%s/responses" % story_id)
    if payload is None:
        return None
    users = (payload.get("references") or {}).get("User") or {}
    out = []
    for item in payload.get("value") or []:
        virtuals = item.get("virtuals") or {}
        paragraphs = ((item.get("previewContent") or {}).get("bodyModel") or {}).get("paragraphs") or []
        writer_id = item.get("creatorId") or ""
        out.append(
            {
                "id": item.get("id") or "",
                "writerId": writer_id,
                "writer": (users.get(writer_id) or {}).get("username") or "",
                "text": _paragraph_text(paragraphs)[:2_000],
                "claps": int(virtuals.get("totalClapCount") or 0),
                "replies": int(virtuals.get("responsesCreatedCount") or 0),
                "hidden": bool(item.get("responseHiddenOnParentPostAt")),
                "deleted": bool(item.get("deletedAt")),
                "postedSeconds": _seconds(item.get("firstPublishedAt") or item.get("createdAt")),
            }
        )
    return out


def medium_story(page, args):
    """One story read in full for the right column: its words, its top responses, its writer."""
    story_id = _story_id(args.get("storyId"))
    _ensure_on_medium(page)
    story = _story(page, story_id)
    if story is None:
        raise CommandError("story: Medium did not answer for that story")
    responses = _responses(page, story_id) or []
    shown = [item for item in responses if not item["hidden"] and not item["deleted"] and item["text"]]
    shown.sort(key=lambda item: item["claps"], reverse=True)
    story["responses"] = [
        {"id": item["id"], "writer": item["writer"], "text": item["text"], "claps": item["claps"]}
        for item in shown[:TOP_RESPONSES]
    ]
    return story


def medium_check(page, args):
    """Reads one sent response, or one article, again, from the reader.

    For a response: whether it is still under its story (Medium can hide a
    response, and a writer can), its claps, and the responses under it. For
    an article: whether it is still up, its claps and the responses under it.
    Views and reads are only shown to the writer, so they are `stats`, in the
    account's own browser.
    """
    story_id = _story_id(args.get("storyId"))
    target = (args.get("responseId") or "").strip()
    _ensure_on_medium(page)
    if target:
        target = _story_id(target)
        under = _responses(page, story_id)
        if under is None:
            raise CommandError("check: Medium did not answer for the story the response is under")
        mine = next((item for item in under if item["id"] == target), None)
        own = _story(page, target)
        visible = bool(mine) and not mine["hidden"] and not mine["deleted"] and bool(own) and not own["deleted"]
        incoming = _responses(page, target) or []
        return {
            "found": bool(mine),
            "visible": visible,
            "claps": (mine or {}).get("claps") if mine else (own or {}).get("claps"),
            "incoming": [item for item in incoming if not item["deleted"]],
        }
    story = _story(page, story_id)
    if story is None:
        return {"found": False, "visible": False, "claps": None, "incoming": [], "publicationSlug": "", "responseCount": None}
    incoming = _responses(page, story_id) or []
    return {
        "found": True,
        "visible": not story["deleted"],
        "claps": story["claps"],
        "incoming": [item for item in incoming if not item["deleted"]],
        "publicationSlug": story["publicationSlug"],
        "responseCount": story["responseCount"],
    }


def _page_signs(page):
    """Whether the page on screen is something only a person can clear. Never moves the page."""
    script = """
    () => {
      const title = (document.title || "").toLowerCase()
      const text = ((document.body && document.body.innerText) || "").slice(0, 4000).toLowerCase()
      const turnstile = Boolean(document.querySelector('iframe[src*="challenges.cloudflare.com"], #challenge-form, #cf-challenge-running'))
      const refused = title.includes("attention required") || text.includes("sorry, you have been blocked")
      const checking = title.includes("just a moment") || text.includes("verify you are human")
      return { turnstile, refused, checking, url: location.href, host: location.hostname }
    }
    """
    signs = page.evaluate(script) or {}
    if signs.get("refused"):
        reason = "Medium's Cloudflare says this browser is blocked"
    elif signs.get("turnstile") or signs.get("checking"):
        reason = "Medium is asking the browser to prove it is a person"
    else:
        reason = ""
    return {"blocked": bool(reason), "reason": reason, "url": signs.get("url") or "", "host": signs.get("host") or ""}


def _viewer(page):
    """Who the page is signed in as, read off the data Medium draws its page from.

    Every Medium page carries `window.__APOLLO_STATE__`, whose ROOT_QUERY has
    `viewer` (null signed out, measured 21 Oct 2026) pointing at the signed-in
    User. Returns (checked, handle, user id).
    """
    script = """
    () => {
      const state = window.__APOLLO_STATE__
      if (!state || !state.ROOT_QUERY || !("viewer" in state.ROOT_QUERY)) return { checked: false }
      const viewer = state.ROOT_QUERY.viewer
      if (!viewer || !viewer.__ref) return { checked: true, handle: null, id: null }
      const user = state[viewer.__ref] || {}
      return { checked: true, handle: user.username || null, id: user.id || null }
    }
    """
    answer = page.evaluate(script) or {}
    return bool(answer.get("checked")), answer.get("handle"), answer.get("id")


def _profile(page, handle):
    """When a writer joined and how many follow them, from their page's data."""
    payload = _data(page, "/@%s?format=json" % handle)
    if payload is None:
        return {"joinedSeconds": None, "followers": None, "userId": None}
    user = payload.get("user") or {}
    user_id = user.get("userId") or ""
    stats = ((payload.get("references") or {}).get("SocialStats") or {}).get(user_id) or {}
    followers = stats.get("usersFollowedByCount")
    return {
        "joinedSeconds": _seconds(user.get("createdAt")),
        "followers": int(followers) if isinstance(followers, (int, float)) else None,
        "userId": user_id or None,
    }


def medium_state_quick(page, args=None):
    """Who is signed in, and whether a check is on screen, without moving the page.

    Asked after every Medium job, so it never navigates: a person may be
    halfway through signing in in the same window. `checked` is False when
    the page is not a Medium page, so a look at another site is never written
    down as "signed out".
    """
    signs = _page_signs(page)
    if not _on_medium(page):
        return {"checked": False, "handle": None, "blocked": False, "reason": "", "joinedSeconds": None, "followers": None}
    checked, handle, _user_id = _viewer(page)
    if not checked:
        return {"checked": False, "handle": None, "blocked": signs["blocked"], "reason": signs["reason"], "joinedSeconds": None, "followers": None}
    profile = _profile(page, handle) if handle else {"joinedSeconds": None, "followers": None}
    return {
        "checked": True,
        "handle": handle,
        "blocked": signs["blocked"],
        "reason": signs["reason"],
        "joinedSeconds": profile["joinedSeconds"],
        "followers": profile["followers"],
    }


def medium_state(page, args=None):
    """The full look: goes to Medium's front page first, so it runs only for a `check` a person asked for."""
    try:
        _goto(page, "https://medium.com/")
        page.wait_for_timeout(random.randint(2000, 3500))
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        # Not looked at, so never written down as signed out.
        return {"checked": False, "handle": None, "blocked": False, "reason": _short(error), "joinedSeconds": None, "followers": None}
    return medium_state_quick(page)


def medium_sign_in(page, args):
    """Opens Medium's emailed sign-in link in this profile's browser, then says who is signed in.

    The app checks the link is https on medium.com before the job is written;
    it is checked again here, because this port drives a browser.
    """
    link = (args.get("url") or "").strip()
    parsed = urllib.parse.urlparse(link)
    if parsed.scheme != "https" or parsed.hostname not in ("medium.com", "www.medium.com"):
        raise CommandError("sign in: that is not a link on medium.com")
    try:
        _goto(page, link)
    except Exception:  # noqa: BLE001 - the error would carry the link, which signs in whoever has it
        raise CommandError("sign in: the link would not open in the browser") from None
    # The link signs in and then moves the page on to Medium's front page.
    page.wait_for_timeout(6000)
    if not _on_medium(page):
        _goto(page, "https://medium.com/")
        page.wait_for_timeout(2500)
    return medium_state_quick(page)


def _first_visible(scope, selectors, timeout_ms):
    """The first of these shapes that is on screen, or None. Each is tried in turn."""
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
        for selector in selectors:
            locator = scope.locator(selector)
            try:
                count = locator.count()
            except Exception:  # noqa: BLE001 - a page moving under us
                count = 0
            for index in range(min(count, 6)):
                item = locator.nth(index)
                try:
                    if item.is_visible():
                        return item
                except Exception:  # noqa: BLE001
                    continue
        scope.wait_for_timeout(300) if hasattr(scope, "wait_for_timeout") else time.sleep(0.3)
    return None


def _read_stories(page, tags, stories, visit, deadline):
    """Reads `stories` stories off a tag's page, the way the feed before a response does."""
    for _ in range(stories):
        if time.monotonic() >= deadline:
            return
        tag = random.choice(tags) if tags else None
        try:
            _goto(page, "https://medium.com/tag/%s/recommended" % tag if tag else "https://medium.com/")
            page.wait_for_timeout(random.randint(1500, 3000))
            visit["_sizes"].extend(human.browse(page, random.uniform(8, 20), deadline))
            links = page.locator(STORY_LINKS)
            candidates = []
            for index in range(min(links.count(), 40)):
                href = links.nth(index).get_attribute("href") or ""
                if re.search(r"-[0-9a-f]{8,16}(\?|$)", href):
                    candidates.append(index)
            if not candidates:
                continue
            human.click(links.nth(random.choice(candidates)))
            page.wait_for_timeout(random.randint(2500, 4500))
            if time.monotonic() < deadline:
                human.read_page(page, random.randint(1500, 5000), visit["_sizes"])
            visit["storiesRead"] += 1
        except Exception as error:  # noqa: BLE001 - the visit carries on without it
            visit["problems"].append("reading a story: %s" % _short(error))


def _new_visit():
    return {"beforeSeconds": 0, "afterSeconds": 0, "storiesRead": 0, "problems": [], "_sizes": []}


def _finish_visit(visit):
    sizes = visit.pop("_sizes")
    visit["scrolls"] = len(sizes)
    return visit, human.describe_scrolls(sizes)


def _landed(page, story_id, viewer_id, text, wait_seconds=LANDED_WAIT_SECONDS, must_read=False):
    """Our response under the story, found in Medium's data by its writer and its opening words.

    With `wait_seconds` 0 it looks once, which is how a second try finds out
    the first one landed after all. With `must_read`, responses that would not
    load stop the routine: "could not look" is not "not there".
    """
    opening = _plain(text)[:40]
    deadline = time.monotonic() + wait_seconds
    while True:
        responses = _responses(page, story_id)
        if responses is None and must_read:
            raise CommandError("respond: Medium's responses would not load, so whether an earlier try is there already cannot be checked. Nothing was typed.")
        for item in responses or []:
            if viewer_id and item["writerId"] != viewer_id:
                continue
            if _plain(item["text"]).startswith(opening):
                return item["id"]
        if time.monotonic() >= deadline:
            return None
        page.wait_for_timeout(2500)


def _open_response_box(page, story_id):
    """Opens the responses beside a story and returns the box to type in."""
    _goto(page, "https://medium.com/p/%s?responsesOpen=true" % story_id)
    page.wait_for_timeout(random.randint(2500, 4000))
    box = _first_visible(
        page,
        [
            "[role='dialog'] [contenteditable='true']",
            "[aria-label*='respon' i] [contenteditable='true']",
            "[contenteditable='true'][role='textbox']",
            "textarea",
        ],
        12_000,
    )
    if box is None:
        opener = _first_visible(page, ["button[aria-label='responses']", "button[aria-label*='respon' i]"], 6_000)
        if opener is None:
            raise CommandError("respond: there is no responses button on the story")
        human.click(opener)
        page.wait_for_timeout(random.randint(1500, 2500))
        box = _first_visible(page, ["[role='dialog'] [contenteditable='true']", "[contenteditable='true'][role='textbox']", "textarea"], 10_000)
    if box is None:
        raise CommandError("respond: the response box did not open")
    return box


def _select_line(page, line):
    """Selects one sentence of the story on screen and opens the highlight menu's Respond."""
    script = """
    (line) => {
      const article = document.querySelector("article") || document.body
      const walker = document.createTreeWalker(article, NodeFilter.SHOW_TEXT)
      const wanted = line.trim()
      let node
      while ((node = walker.nextNode())) {
        const at = node.textContent.indexOf(wanted)
        if (at < 0) continue
        const range = document.createRange()
        range.setStart(node, at)
        range.setEnd(node, at + wanted.length)
        const selection = window.getSelection()
        selection.removeAllRanges()
        selection.addRange(range)
        node.parentElement.scrollIntoView({ block: "center" })
        const box = range.getBoundingClientRect()
        return { x: box.left + box.width / 2, y: box.top + box.height / 2 }
      }
      return null
    }
    """
    point = page.evaluate(script, line[:500])
    if not point:
        raise CommandError("respond: that line is not in the story on screen")
    page.wait_for_timeout(random.randint(400, 900))
    page.mouse.move(point["x"], point["y"])
    page.mouse.down()
    page.mouse.up()
    respond = _first_visible(page, ["button[aria-label*='respond' i]", "button:has-text('Respond')"], 5_000)
    if respond is None:
        raise CommandError("respond: the highlight menu showed no Respond button for that line")
    human.click(respond)
    page.wait_for_timeout(random.randint(1500, 2500))
    box = _first_visible(page, ["[role='dialog'] [contenteditable='true']", "[contenteditable='true'][role='textbox']"], 10_000)
    if box is None:
        raise CommandError("respond: the response box did not open for that line")
    return box


def medium_respond(page, args):
    """Writes one response under a story, or under a response, inside an ordinary visit.

    Before: one or two stories read in the account's tags. Then the story,
    read, then the response typed at a person's pace and sent. Afterwards
    Medium's own data is read until the response shows, so the app is told
    where it landed rather than trusting a click. An answer to somebody's
    response is the same routine: on Medium a response is a story of its
    own, and answering it is responding under it.

    Only called after a person pressed Post. Never sent twice: once Respond
    is pressed, a failure to find it afterwards says it may already be up.
    """
    story_id = _story_id(args.get("storyId"))
    text = (args.get("text") or "").strip()
    line = (args.get("line") or "").strip()
    tags = [tag for tag in (args.get("tags") or []) if isinstance(tag, str) and re.fullmatch(r"[a-z0-9-]{1,80}", tag)]
    if not text:
        raise CommandError("respond: no words to send")

    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = RESPONSE_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()
    _ensure_on_medium(page)
    _checked, _handle, viewer_id = _viewer(page)
    if not viewer_id:
        raise CommandError("respond: this browser is not signed in to Medium")

    # A second try after a first that stopped part-way: if the first one is
    # under the story already, it is reported and nothing is typed again.
    already = _landed(page, story_id, viewer_id, text, wait_seconds=0, must_read=True)
    if already:
        return {"responseId": already, "responseUrl": "https://medium.com/p/%s" % already, "visit": {"alreadyThere": True}}

    try:
        _read_stories(page, tags, random.randint(*STORIES_BEFORE), visit, min(deadline - reserve, started + random.uniform(*FEED_BEFORE_SECONDS)))
    except Exception as error:  # noqa: BLE001 - the response still goes
        visit["problems"].append("the reading before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)

    try:
        _goto(page, "https://medium.com/p/%s" % story_id)
        page.wait_for_timeout(random.randint(2000, 3500))
        human.read_page(page, random.randint(1500, 4000), visit["_sizes"])
    except Exception as error:  # noqa: BLE001
        raise CommandError("respond: the story would not open: %s" % _short(error))
    signs = _page_signs(page)
    if signs["blocked"]:
        raise CommandError("respond: %s" % signs["reason"])

    box = _select_line(page, line) if line else _open_response_box(page, story_id)
    try:
        human.click(box)
    except Exception as error:  # noqa: BLE001
        raise CommandError("respond: the response box could not be pressed: %s" % _short(error))
    gaps = human.type_text(box, text)
    human.pause_before_submit(page)
    send = _first_visible(page, ["[role='dialog'] button:has-text('Respond')", "button:has-text('Respond')", "button[data-testid*='respond' i]"], 8_000)
    if send is None:
        raise CommandError("respond: there is no Respond button under the box")
    human.click(send)

    response_id = _landed(page, story_id, viewer_id, text)
    if not response_id:
        raise CommandError("respond: Respond was pressed but the response does not show on the story yet. It may already be on Medium; look before sending again.")

    after = time.monotonic()
    try:
        visit["_sizes"].extend(human.browse(page, random.uniform(*FEED_AFTER_SECONDS), deadline))
    except Exception as error:  # noqa: BLE001 - it is on Medium already
        visit["problems"].append("the reading after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after)
    record, scrolls = _finish_visit(visit)
    print("medium respond: %s; %s; %s" % (human.describe_gaps(gaps), scrolls, "; ".join(record["problems"]) or "no problems"), flush=True)
    return {"responseId": response_id, "responseUrl": "https://medium.com/p/%s" % response_id, "visit": record}


def _paste_html(page, target, html_text, plain_text):
    """Pastes words into the editor as a person pasting from a document would.

    With `target` None the words go where the caret already is, which is how
    an article's body follows its title: a click would put the caret wherever
    the pointer landed instead.
    """
    script = """
    ([html, plain]) => {
      const target = document.activeElement
      if (!target) return false
      const data = new DataTransfer()
      data.setData("text/html", html)
      data.setData("text/plain", plain)
      const event = new ClipboardEvent("paste", { clipboardData: data, bubbles: true, cancelable: true })
      return target.dispatchEvent(event)
    }
    """
    if target is not None:
        human.click(target)
    page.wait_for_timeout(random.randint(300, 700))
    page.evaluate(script, [html_text, plain_text])
    page.wait_for_timeout(random.randint(1200, 2200))


def _body_html(body):
    """The article's plain text as the HTML a pasted document carries: headings and paragraphs."""
    out = []
    for block in re.split(r"\n\s*\n", body.strip()):
        block = block.strip()
        if not block:
            continue
        escaped = block.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
        if block.startswith("## "):
            out.append("<h3>%s</h3>" % escaped[3:].strip())
        elif block.startswith("# "):
            out.append("<h3>%s</h3>" % escaped[2:].strip())
        else:
            out.append("<p>%s</p>" % escaped.replace("\n", "<br>"))
    return "".join(out)


def _published_with_title(page, handle, title):
    """The id of the account's own published story with this title, or None.

    Read off the account's public feed before anything is written, so a
    second try after a first that published without saying so never
    publishes the article twice.
    """
    if not re.fullmatch(r"[A-Za-z0-9_.-]{1,60}", handle or ""):
        raise CommandError("publish: the account's Medium name is not one Medium gives, so its stories cannot be checked")
    answer = _fetch(page, "/feed/@%s" % handle, "application/rss+xml, text/xml")
    if not answer.get("ok"):
        raise CommandError("publish: the account's own stories would not load, so whether an earlier try is published already cannot be checked. Nothing was written.")
    wanted = _plain(title)
    for item in re.findall(r"<item>(.*?)</item>", answer.get("body") or "", re.S):
        found = re.search(r"<title>(?:<!\[CDATA\[)?(.*?)(?:\]\]>)?</title>", item, re.S)
        guid = re.search(r"<guid[^>]*>https://medium\.com/p/([0-9a-f]{8,16})</guid>", item)
        if found and guid and _plain(html.unescape(found.group(1))) == wanted:
            return guid.group(1)
    return None


def medium_publish(page, args):
    """Publishes one article from the account's own browser.

    The title is typed; the body is pasted, as a person pasting from a
    document would, because typing 1,200 words at a person's pace takes
    longer than the visit allows. Then Publish, the tags, the publication when
    one is named, and Publish now. Medium's own data is read afterwards, so the
    app is told the article's real address.
    """
    title = (args.get("title") or "").strip()
    subtitle = (args.get("subtitle") or "").strip()
    body = (args.get("body") or "").strip()
    tags = [tag for tag in (args.get("tags") or []) if isinstance(tag, str)][:5]
    cover = (args.get("coverUrl") or "").strip()
    publication = (args.get("publication") or "").strip()
    if not title or not body:
        raise CommandError("publish: an article needs a title and words")

    _ensure_on_medium(page)
    _checked, handle, viewer_id = _viewer(page)
    if not viewer_id:
        raise CommandError("publish: this browser is not signed in to Medium")
    earlier = _published_with_title(page, handle, title)
    if earlier:
        story = _story(page, earlier)
        return {"storyId": earlier, "url": (story or {}).get("url") or "https://medium.com/p/%s" % earlier, "handle": handle}

    try:
        _goto(page, "https://medium.com/new-story")
    except Exception as error:  # noqa: BLE001
        raise CommandError("publish: the editor would not open: %s" % _short(error))
    page.wait_for_timeout(random.randint(3000, 5000))
    title_box = _first_visible(page, ["[data-testid='editorTitleParagraph']", "h3.graf--title", "[contenteditable='true'] h3", "[contenteditable='true']"], 15_000)
    if title_box is None:
        raise CommandError("publish: the editor did not open")
    human.click(title_box)
    human.type_text(title_box, title)
    page.keyboard.press("Enter")
    if subtitle:
        page.wait_for_timeout(random.randint(300, 700))
        page.keyboard.insert_text(subtitle)
        page.keyboard.press("Enter")
    cover_html = '<p><img src="%s"></p>' % cover.replace('"', "") if cover.startswith("https://") else ""
    _paste_html(page, None, cover_html + _body_html(body), body)

    publish = _first_visible(page, ["button:has-text('Publish')", "[data-action='show-prepublish']"], 10_000)
    if publish is None:
        raise CommandError("publish: there is no Publish button above the editor")
    human.click(publish)
    page.wait_for_timeout(random.randint(2000, 3000))

    topics = _first_visible(page, ["input[placeholder*='topic' i]", "[role='dialog'] input[type='text']", "[data-testid*='tag' i] input"], 8_000)
    if topics is None and tags:
        raise CommandError("publish: there is no box for the topics")
    for tag in tags:
        human.click(topics)
        human.type_text(topics, tag.replace("-", " "))
        page.wait_for_timeout(random.randint(900, 1600))
        page.keyboard.press("Enter")
        page.wait_for_timeout(random.randint(400, 900))

    if publication:
        picker = _first_visible(page, ["[role='dialog'] button:has-text('Publishing to')", "[role='dialog'] button:has-text('Change')"], 5_000)
        if picker is None:
            raise CommandError("publish: there is no way to pick a publication, so this account may not write for %s" % publication)
        human.click(picker)
        page.wait_for_timeout(random.randint(800, 1500))
        option = _first_visible(page, ["[role='dialog'] [role='option']:has-text(%s)" % json.dumps(publication), "[role='dialog'] button:has-text(%s)" % json.dumps(publication)], 5_000)
        if option is None:
            raise CommandError("publish: %s is not offered, so this account does not write for it" % publication)
        human.click(option)
        page.wait_for_timeout(random.randint(800, 1500))

    now = _first_visible(page, ["button:has-text('Publish now')", "button[data-testid='publishConfirmButton']", "[role='dialog'] button:has-text('Publish')"], 8_000)
    if now is None:
        raise CommandError("publish: there is no Publish now button")
    human.click(now)

    deadline = time.monotonic() + 40
    story_id = None
    while time.monotonic() < deadline:
        page.wait_for_timeout(2000)
        found = re.search(r"-([0-9a-f]{8,16})(?:\?|$)", page.url or "")
        if found and "/new-story" not in (page.url or ""):
            story_id = found.group(1)
            break
    if not story_id:
        raise CommandError("publish: Publish now was pressed but the page never moved to the article. It may already be on Medium; look before publishing again.")
    story = _story(page, story_id)
    return {"storyId": story_id, "url": (story or {}).get("url") or page.url, "handle": handle}


def _owner_menu(page, step, item_words):
    """Opens a story's own "More" menu once and presses the first of the items named, for the writer only."""
    more = _first_visible(page, ["button[aria-label='More options']", "button[aria-label*='more' i]", "[data-testid*='more' i] button"], 8_000)
    if more is None:
        raise CommandError("%s: there is no More button on the page" % step)
    human.click(more)
    page.wait_for_timeout(random.randint(700, 1300))
    selectors = []
    for words in item_words:
        selectors += ["[role='menu'] :text-is(%s)" % json.dumps(words), "button:text-is(%s)" % json.dumps(words), "a:text-is(%s)" % json.dumps(words)]
    item = _first_visible(page, selectors, 5_000)
    if item is None:
        raise CommandError("%s: the menu has no %s" % (step, " or ".join(item_words)))
    human.click(item)
    page.wait_for_timeout(random.randint(1200, 2000))


def _gone(page, story_id):
    """True when Medium says the story is deleted or not there, None when it could not be read."""
    answer = _fetch(page, "/p/%s?format=json" % story_id)
    if answer.get("status") == 404:
        return True
    if not answer.get("ok"):
        return None
    payload = _data(page, "/p/%s?format=json" % story_id)
    if payload is None:
        return None
    value = payload.get("value") or {}
    return bool(value.get("deletedAt"))


def medium_delete(page, args):
    """Deletes one response or article the account wrote, through its own menu, and checks it went."""
    story_id = _story_id(args.get("storyId"))
    try:
        _goto(page, "https://medium.com/p/%s" % story_id)
    except Exception as error:  # noqa: BLE001
        raise CommandError("delete: the story would not open: %s" % _short(error))
    page.wait_for_timeout(random.randint(2500, 4000))
    _owner_menu(page, "delete", ["Delete story", "Delete"])
    confirm = _first_visible(page, ["[role='dialog'] button:has-text('Delete')", "button:has-text('Delete')"], 6_000)
    if confirm is None:
        raise CommandError("delete: there is no Delete to confirm")
    human.click(confirm)
    page.wait_for_timeout(4000)
    _ensure_on_medium(page)
    gone = _gone(page, story_id)
    if gone is None:
        raise CommandError("delete: Delete was pressed, but Medium would not say whether it went. Look on Medium before deleting again.")
    return {"done": gone}


def medium_edit(page, args):
    """Changes the words of one response or article the account wrote, in Medium's own editor."""
    story_id = _story_id(args.get("storyId"))
    text = (args.get("text") or "").strip()
    title = (args.get("title") or "").strip()
    if not text:
        raise CommandError("edit: no words to save")
    try:
        _goto(page, "https://medium.com/p/%s/edit" % story_id)
    except Exception as error:  # noqa: BLE001
        raise CommandError("edit: the editor would not open: %s" % _short(error))
    page.wait_for_timeout(random.randint(3000, 4500))
    editor = _first_visible(page, ["[contenteditable='true']"], 15_000)
    if editor is None:
        raise CommandError("edit: the editor did not open, so this account may not be the one that wrote it")
    human.click(editor)
    page.keyboard.press("ControlOrMeta+A")
    page.keyboard.press("Backspace")
    page.wait_for_timeout(random.randint(400, 900))
    if title:
        human.type_text(editor, title)
        page.keyboard.press("Enter")
        # Pasted where the caret already is, after the title, as publish does.
        _paste_html(page, None, _body_html(text), text)
    else:
        human.type_text(editor, text)
    save = _first_visible(page, ["button:has-text('Save and publish')", "button:has-text('Save')", "button:has-text('Update')"], 8_000)
    if save is None:
        raise CommandError("edit: there is no Save button")
    human.click(save)
    page.wait_for_timeout(5000)
    _ensure_on_medium(page)
    story = _story(page, story_id)
    if story is None:
        raise CommandError("edit: Save was pressed, but Medium would not show the story afterwards. Look on Medium before changing it again.")
    # An article's "## " heading marks are not words on the page.
    opening = _plain(re.sub(r"^#+\s*", "", text, flags=re.M))[:30]
    return {"done": opening in _plain(story.get("text", ""))}


def _number(text):
    """"1.2K" is 1200, "3,410" is 3410, anything else None."""
    found = re.fullmatch(r"\s*([\d.,]+)\s*([KkMm]?)\s*", text or "")
    if not found:
        return None
    value = float(found.group(1).replace(",", ""))
    scale = {"k": 1_000, "m": 1_000_000}.get(found.group(2).lower(), 1)
    return int(round(value * scale))


def medium_stats(page, args):
    """An article's views and reads, which Medium shows only to its writer, off its stats page."""
    story_id = _story_id(args.get("storyId"))
    _goto(page, "https://medium.com/me/stats/post/%s" % story_id)
    page.wait_for_timeout(random.randint(4000, 6000))
    script = """
    () => (document.body && document.body.innerText) || ""
    """
    text = page.evaluate(script) or ""
    out = {}
    for label, key in (("views", "views"), ("reads", "reads")):
        found = re.search(r"([\d.,]+[KkMm]?)\s*\n\s*%s\b" % label, text, re.IGNORECASE) or re.search(r"\b%s\s*\n\s*([\d.,]+[KkMm]?)" % label, text, re.IGNORECASE)
        out[key] = _number(found.group(1)) if found else None
    return out


def medium_warm_up(page, args):
    """A warming account's day on Medium: a few stories read in its tags, now and then a writer followed.

    Nothing is written, clapped or highlighted.
    """
    tags = [tag for tag in (args.get("tags") or []) if isinstance(tag, str) and re.fullmatch(r"[a-z0-9-]{1,80}", tag)]
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    visit = _new_visit()
    try:
        _goto(page, "https://medium.com/")
    except Exception as error:  # noqa: BLE001
        raise CommandError("warm up: Medium would not open: %s" % _short(error))
    page.wait_for_timeout(random.randint(2000, 3500))
    # A signed-out visit is not the account's day on Medium.
    _checked, _handle, viewer_id = _viewer(page)
    if not viewer_id:
        raise CommandError("warm up: this browser is not signed in to Medium")
    visit["_sizes"].extend(human.browse(page, random.uniform(30, 70), deadline))
    budget = min(deadline, started + random.uniform(*WARM_UP_READ_SECONDS))
    _read_stories(page, tags, random.randint(*WARM_UP_STORIES), visit, budget)
    followed = []
    if random.random() < FOLLOW_CHANCE:
        try:
            follow = _first_visible(page, ["article button:has-text('Follow')", "button:has-text('Follow')"], 4_000)
            if follow is not None and (follow.inner_text() or "").strip() == "Follow":
                human.click(follow)
                page.wait_for_timeout(random.randint(1200, 2200))
                found = re.search(r"/@([A-Za-z0-9._-]+)", page.url or "")
                followed.append(found.group(1) if found else "")
        except Exception as error:  # noqa: BLE001
            visit["problems"].append("following a writer: %s" % _short(error))
    record, scrolls = _finish_visit(visit)
    print("medium warm-up: %d stories read; %s; %s" % (record["storiesRead"], scrolls, "; ".join(record["problems"]) or "no problems"), flush=True)
    return {"storiesRead": record["storiesRead"], "followed": [name for name in followed if name], "problems": record["problems"]}


def medium_add_to_list(page, args):
    """Puts one story on the account's public Medium list named, making the list the first time."""
    story_id = _story_id(args.get("storyId"))
    name = (args.get("list") or "").strip()[:60]
    if not name:
        raise CommandError("list: the list has no name")
    try:
        _goto(page, "https://medium.com/p/%s" % story_id)
    except Exception as error:  # noqa: BLE001
        raise CommandError("list: the story would not open: %s" % _short(error))
    page.wait_for_timeout(random.randint(2500, 4000))
    human.read_page(page, random.randint(800, 2000))
    save = _first_visible(page, ["button[aria-label*='Add to list' i]", "button[data-testid*='bookmark' i]", "button[aria-label*='bookmark' i]"], 8_000)
    if save is None:
        raise CommandError("list: there is no save button on the story")
    human.click(save)
    page.wait_for_timeout(random.randint(900, 1600))
    # The list by its whole name, so a list called "AI" never matches "AI tools".
    exact = re.compile(r"^\s*%s\s*$" % re.escape(name), re.I)
    labels = page.locator("[role='dialog'] label, label").filter(has_text=exact)
    existing = labels.first if labels.count() else None
    if existing is None:
        create = _first_visible(page, ["button:has-text('Create new list')", "button:has-text('New list')"], 4_000)
        if create is None:
            raise CommandError("list: there is no way to make the list %s" % name)
        human.click(create)
        page.wait_for_timeout(random.randint(700, 1200))
        field = _first_visible(page, ["[role='dialog'] input[type='text']", "input[placeholder*='name' i]"], 5_000)
        if field is None:
            raise CommandError("list: there is no box for the list's name")
        human.click(field)
        human.type_text(field, name)
        make = _first_visible(page, ["[role='dialog'] button:has-text('Create')"], 4_000)
        if make is None:
            raise CommandError("list: there is no Create button")
        human.click(make)
        page.wait_for_timeout(random.randint(1200, 2000))
    else:
        box = existing.locator("input[type='checkbox']")
        # Pressing a ticked list takes the story off it, so a story already
        # there is left alone.
        if box.count() and box.first.is_checked():
            page.keyboard.press("Escape")
            return {"done": True}
        human.click(existing)
        page.wait_for_timeout(random.randint(700, 1200))
        if box.count() and not box.first.is_checked():
            raise CommandError("list: the list was pressed, but the story does not show as on it")
    page.keyboard.press("Escape")
    return {"done": True}


def medium_publication(page, args):
    """A publication's name, its about words, its submission guidelines, and whether this account may publish there.

    Run in the account's own browser, so `virtuals.permissions` is the
    account's own: true for `canPublish` or `canSubmit` means it writes there.
    The guidelines are the story the publication's menu links as "submission"
    or "write for us", read like any story.
    """
    slug = _slug(args.get("slug"), "publication")
    _ensure_on_medium(page)
    payload = _data(page, "/%s?format=json" % slug)
    if payload is None:
        raise CommandError("publication: Medium has no publication at medium.com/%s" % slug)
    collection = payload.get("collection") or {}
    permissions = ((collection.get("virtuals") or {}).get("permissions")) or {}
    checked, _handle, viewer_id = _viewer(page)
    rules = ""
    for item in collection.get("navItems") or []:
        title = (item.get("title") or "").lower()
        if not re.search(r"submi|write for|contribut|guideline", title):
            continue
        story_id = item.get("postId") or (re.search(r"-([0-9a-f]{8,16})(?:\?|$)", item.get("url") or "") or [None, None])[1]
        if story_id:
            story = _story(page, story_id)
            if story:
                rules = story["text"][:4_000]
                break
    return {
        "slug": collection.get("slug") or slug,
        "name": collection.get("name") or slug,
        "description": collection.get("description") or "",
        "rules": rules,
        "signedIn": bool(viewer_id),
        "writes": bool(permissions.get("canPublish") or permissions.get("canSubmit")),
    }


def medium_profile(page, args):
    """When a writer joined and how many follow them, from the reader.

    For an account that runs on a phone: the Medium app does not show when
    the account joined, and Promo's warm-up counts from that day.
    """
    handle = _slug(args.get("handle"), "profile")
    _ensure_on_medium(page)
    return _profile(page, handle)


def medium_find_response(page, args):
    """Medium's id for a response a phone sent, found under its story by the
    account's name and the response's opening words. The Medium app does not
    show a response's address, so the reader looks it up afterwards. "" when
    it is not there yet."""
    story_id = _story_id(args.get("storyId"))
    writer = (args.get("writer") or "").strip().lstrip("@").lower()
    text = (args.get("text") or "").strip()
    if not writer or not text:
        raise CommandError("find response: it needs the account's name and the words")
    _ensure_on_medium(page)
    opening = _plain(text)[:40]
    for item in _responses(page, story_id) or []:
        if item["writer"].lower() == writer and _plain(item["text"]).startswith(opening):
            return {"responseId": item["id"]}
    return {"responseId": ""}


# What this network can be asked to do. The package's __init__ prefixes each
# name with "medium.", and a name nobody registered is refused.
ROUTINES = {
    "state": medium_state,
    "quick_state": medium_state_quick,
    "sign_in": medium_sign_in,
    "search": medium_search,
    "story": medium_story,
    "check": medium_check,
    "respond": medium_respond,
    "publish": medium_publish,
    "edit": medium_edit,
    "delete": medium_delete,
    "stats": medium_stats,
    "warm_up": medium_warm_up,
    "add_to_list": medium_add_to_list,
    "publication": medium_publication,
    "profile": medium_profile,
    "find_response": medium_find_response,
}
