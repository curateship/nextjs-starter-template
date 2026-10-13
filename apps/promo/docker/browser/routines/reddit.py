"""What the browser actually does on Reddit.

This is the only file in the app that knows how a Reddit page is put together,
and it is deliberately the only one. When Reddit redesigns, the fix is here and
nowhere else. The next network gets a file beside this one — `instagram.py`,
`tiktok.py` — and nothing else moves.

Every routine takes the live Playwright page and returns plain data the
TypeScript side can store. None of them touch the database, decide what to
search for, or write a comment's words: the app does that.

Two ways to read a page, in this order:

1. **Reddit's own JSON.** Adding `.json` to a Reddit address returns the page as
   structured data, with a schema that has barely moved in ten years. A plain
   HTTP client gets a 403 for it, but this browser has already solved Reddit's
   JavaScript challenge and holds the cookie that proves it, so the same request
   made from inside the page usually answers.
2. **The rendered page.** If the JSON is refused, the post data is pulled off
   the `<shreddit-post>` elements Reddit draws. Less stable, so it is the
   fallback rather than the first choice.

The JSON shortcut is for the reader browser only, signed in to nobody: the app
runs searches, reply reads, rules reads and comment checks there and never in
an account's own browser. An account's browser only visits: the feed, a few
posts, and the post it comments on.
"""

import html
import json
import random
import re
import time
import urllib.parse

import human

# How long to wait for a navigation before giving up. Reddit behind a
# residential proxy is slow, and a real captcha never resolves at all, so this
# is generous but finite.
NAV_TIMEOUT_MS = 45_000

# How long a request made from inside a page may take. The browser has one
# driver, so a request that never answers would hold up every later job in
# that browser; this gives up instead and reports no answer (status 0).
FETCH_TIMEOUT_MS = 20_000

# Reddit's search answers at most this many posts a page. Asking for more than
# one page of them is a later job; one page is already more than a person can
# write comments on in a sitting.
SEARCH_LIMIT = 25

# The visit around a comment. Every length is drawn fresh for each visit, so
# two visits never take the same time or the same path.
FEED_BEFORE_SECONDS = (90, 210)
POSTS_BEFORE = (1, 2)
FEED_AFTER_SECONDS = (25, 75)
# A post opened from the feed is read for a few seconds, longer if it is long.
FEED_POST_CHARACTERS = (300, 1500)
# How far down the subreddit's newest posts the browser looks for the post
# before going to its address instead.
FIND_IN_SUBREDDIT_SCROLLS = 6

# A warming account's day: a longer stay in the feed and a few more posts.
WARM_UP_FEED_SECONDS = (180, 420)
WARM_UP_POSTS = (2, 4)

# The launcher stops a visit at 900 seconds. The visit plans to end by this,
# leaving room for one slow page after it.
VISIT_BUDGET_SECONDS = 800
# Kept back for reading the post and typing the comment, per character and
# on top, so the feed before can never eat the time the comment needs.
TYPING_SECONDS_PER_CHARACTER = 0.25
COMMENT_RESERVE_SECONDS = 120

# A post's title in a feed or a listing, which is what a person presses to
# open it. The whole card is a link too, but a press on its middle often lands
# on a picture or a video, which plays rather than opens. Adverts are a
# different element, so they are never opened.
POST_LINKS = "shreddit-post a[slot='title']"


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


def _fetch(page, url, credentials="include"):
    """Asks for a Reddit address from inside the page and keeps the status.

    `credentials` is "include" to send the page's cookies, which is how this
    browser gets past Reddit's challenge, or "omit" to ask as a stranger with
    none. Returns {"ok", "status", "body"}; status 0 means no answer at all.
    """
    script = """
    async ([target, credentials, limit]) => {
      const stop = new AbortController()
      const timer = setTimeout(() => stop.abort(), limit)
      try {
        const response = await fetch(target, {
          headers: { accept: "application/json" },
          credentials,
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
    return page.evaluate(script, [url, credentials, FETCH_TIMEOUT_MS]) or {"ok": False, "status": 0, "body": ""}


def _parse(answer):
    """The JSON in an answer from `_fetch`, or None when it refused or is not JSON."""
    if not answer or not answer.get("ok"):
        return None
    try:
        return json.loads(answer.get("body") or "")
    except (ValueError, TypeError):
        return None


def _fetch_json(page, url):
    """Asks for a Reddit address as JSON, using the page's own cookies.

    Returns the parsed object, or None when Reddit refuses. Never raises for a
    refusal: a refusal is an expected answer that sends the caller to the
    rendered page instead.
    """
    return _parse(_fetch(page, url))


def _on_reddit(page):
    """Whether the page is on Reddit, so a request from it carries Reddit's cookies."""
    host = urllib.parse.urlparse(page.url or "").hostname or ""
    return host == "reddit.com" or host.endswith(".reddit.com")


def _subreddit_name(args, routine):
    """The subreddit an app asked about, checked so it can only ever be a name."""
    name = (args.get("subreddit") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]{1,60}", name):
        raise CommandError("%s: no subreddit given" % routine)
    return name


def _search_url(query, subreddit, sort, window):
    params = {"q": query, "type": "posts", "sort": sort, "t": window}
    if subreddit:
        params["restrict_sr"] = "1"
        base = "https://www.reddit.com/r/%s/search/" % urllib.parse.quote(subreddit)
    else:
        base = "https://www.reddit.com/search/"
    return base + "?" + urllib.parse.urlencode(params)


def _text(value):
    """Reddit's words, with its HTML escaping undone.

    Reddit's JSON returns the body and every comment HTML-escaped: a quoted
    line comes back as "&gt;Yes, I know" rather than "> Yes, I know", and an
    apostrophe as "&#39;". Drawn straight onto a page that is what a reader
    sees. It is undone here, where the data is read, so nothing downstream has
    to remember.
    """
    return html.unescape(value) if isinstance(value, str) else ""


def _link_url(data):
    """Where a link post points, or "" for a post with words of its own.

    Passed on as Reddit gave it, with its HTML escaping undone. The app decides
    which links are worth reading: not pictures, not video, not Reddit itself.
    """
    if data.get("is_self"):
        return ""
    return _text(data.get("url_overridden_by_dest") or data.get("url"))


def _post_from_json(child):
    """One post out of Reddit's own listing shape."""
    data = child.get("data") or {}
    name = data.get("name") or ""
    if not name or not data.get("permalink"):
        return None
    created = data.get("created_utc")
    return {
        "redditId": name,
        "permalink": data.get("permalink") or "",
        "subreddit": data.get("subreddit") or "",
        "title": _text(data.get("title")),
        "body": _text(data.get("selftext")),
        "linkUrl": _link_url(data),
        "author": data.get("author") or "",
        "score": int(data.get("score") or 0),
        "commentCount": int(data.get("num_comments") or 0),
        # Seconds since the epoch, which the app turns into a real time. None
        # rather than now() when Reddit did not say, because a guessed age
        # would go straight into the ranking.
        "postedAtSeconds": int(created) if isinstance(created, (int, float)) else None,
        # Filled in by the caller, which knows the order.
        "position": 0,
    }


def _posts_from_page(page):
    """The fallback: read the posts off the rendered search results."""
    script = """
    () => {
      const out = []
      for (const el of document.querySelectorAll("shreddit-post")) {
        const attr = (name) => el.getAttribute(name) || ""
        const num = (name) => {
          const value = Number(attr(name))
          return Number.isFinite(value) ? value : 0
        }
        const permalink = attr("permalink")
        const id = attr("id")
        if (!permalink || !id) continue
        out.push({
          redditId: id,
          permalink,
          // Reddit writes this as "r/name"; the app stores it without the r/.
          subreddit: attr("subreddit-prefixed-name").replace(/^r\\//, ""),
          title: attr("post-title"),
          body: "",
          // The address a link post points to. A post with words points at
          // itself on Reddit, which the app drops.
          linkUrl: attr("content-href"),
          author: attr("author"),
          score: num("score"),
          commentCount: num("comment-count"),
          createdTimestamp: attr("created-timestamp"),
        })
      }
      return out
    }
    """
    rows = page.evaluate(script) or []
    posts = []
    for row in rows:
        stamp = row.pop("createdTimestamp", "")
        seconds = None
        if stamp:
            try:
                # Reddit writes an ISO time with a Z, which Python 3.11+ parses.
                from datetime import datetime

                seconds = int(
                    datetime.fromisoformat(stamp.replace("Z", "+00:00")).timestamp()
                )
            except (ValueError, TypeError):
                seconds = None
        row["postedAtSeconds"] = seconds
        row["position"] = 0
        posts.append(row)
    return posts


def reddit_search(page, args):
    """Posts matching a keyword, newest and quietest first being the app's job.

    With no words and one subreddit it is a watch, and returns that
    subreddit's newest posts instead of a search's.

    Navigating first is not optional even when the JSON path works: the
    navigation is what solves Reddit's challenge and sets the cookie the JSON
    request then needs.
    """
    query = (args.get("query") or "").strip()
    subreddit = (args.get("subreddit") or "").strip()
    if not query and not subreddit:
        raise CommandError("search: no query and no subreddit given")
    sort = args.get("sort") or "new"
    window = args.get("window") or "week"

    if query:
        url = _search_url(query, subreddit, sort, window)
        data_url = url.replace("/search/?", "/search.json?")
    else:
        # A watch: no words, one subreddit, its newest posts in Reddit's own
        # order, which for this listing is newest first.
        name = _subreddit_name(args, "search")
        url = "https://www.reddit.com/r/%s/new/" % name
        data_url = "https://www.reddit.com/r/%s/new.json?limit=%d" % (name, SEARCH_LIMIT)
    _goto(page, url)

    listing = _fetch_json(page, data_url)
    source = "json"
    posts = []
    if listing:
        children = ((listing.get("data") or {}).get("children")) or []
        for child in children:
            post = _post_from_json(child)
            if post:
                posts.append(post)
    if not posts:
        source = "page"
        posts = _posts_from_page(page)

    # The order Reddit answered in is the only relevance signal there is, so
    # each post carries its place in it. Upvotes are reported too but the app
    # does not rank on them: they measure how big a subreddit is.
    trimmed = posts[:SEARCH_LIMIT]
    for index, post in enumerate(trimmed):
        post["position"] = index

    return {
        "source": source,
        "posts": trimmed,
        "url": url,
    }


def reddit_thread(page, args):
    """A post and the replies already under it.

    The replies matter as much as the post: a draft that repeats what the top
    comment already said is worse than no draft.
    """
    permalink = (args.get("permalink") or "").strip()
    if not permalink:
        raise CommandError("thread: no permalink given")
    if not permalink.startswith("/"):
        raise CommandError("thread: permalink must start with /")

    url = "https://www.reddit.com" + permalink
    _goto(page, url)

    limit = int(args.get("replyLimit") or 8)
    parsed = _fetch_json(page, url.rstrip("/") + ".json?limit=%d" % limit)

    if isinstance(parsed, list) and len(parsed) >= 2:
        post_children = ((parsed[0].get("data") or {}).get("children")) or []
        post = _post_from_json(post_children[0]) if post_children else None
        replies = []
        for child in ((parsed[1].get("data") or {}).get("children")) or []:
            data = child.get("data") or {}
            text = _text(data.get("body"))
            if not text or data.get("author") in (None, "[deleted]"):
                continue
            replies.append(
                {
                    "author": data.get("author") or "",
                    "text": text,
                    "score": int(data.get("score") or 0),
                }
            )
            if len(replies) >= limit:
                break
        return {"source": "json", "post": post, "replies": replies}

    # The rendered fallback. Reddit's own comment elements carry the author and
    # the score as attributes and the words as their text.
    script = """
    (max) => {
      const out = []
      for (const el of document.querySelectorAll("shreddit-comment")) {
        const text = (el.textContent || "").trim()
        if (!text) continue
        out.push({
          author: el.getAttribute("author") || "",
          text: text.slice(0, 4000),
          score: Number(el.getAttribute("score")) || 0,
        })
        if (out.length >= max) break
      }
      return out
    }
    """
    body_script = """
    () => {
      const post = document.querySelector("shreddit-post")
      if (!post) return { title: "", body: "" }
      const body = post.querySelector('[slot="text-body"]')
      return {
        title: post.getAttribute("post-title") || "",
        body: (body && body.textContent ? body.textContent : "").trim(),
      }
    }
    """
    shown = page.evaluate(body_script) or {}
    return {
        "source": "page",
        "post": {
            "redditId": "",
            "permalink": permalink,
            "subreddit": "",
            "title": shown.get("title") or "",
            "body": shown.get("body") or "",
            "author": "",
            "score": 0,
            "commentCount": 0,
            "postedAtSeconds": None,
        },
        "replies": page.evaluate(script, limit) or [],
    }


def reddit_state(page, args=None):
    """Who the browser is signed in as, and whether something is in the way.

    Also the account's karma and age, read from the same answer. A handle of
    None means signed out. `blocked` means Reddit is showing a
    challenge or a captcha that only a person can clear, and the app shows the
    stream link rather than retrying.
    """
    try:
        _goto(page, "https://www.reddit.com/")
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        return {"handle": None, "blocked": True, "reason": str(error)}

    me = _me(page)
    signs = _page_signs(page)

    return {
        **me,
        "blocked": signs["blocked"],
        "reason": signs["reason"],
        "url": signs["url"],
    }


def _me(page):
    """Who the page's cookies are signed in as, with the account's karma and age.

    One read of Reddit's own "who am I", which already carries all three, so
    the karma and the age cost nothing beyond the handle. Every figure is None
    when signed out or unreadable, never 0: no karma and unknown karma are
    different answers.
    """
    me = _fetch_json(page, "https://www.reddit.com/api/me.json")
    data = (me.get("data") or {}) if isinstance(me, dict) else {}
    handle = data.get("name") or None
    karma = data.get("total_karma")
    if not isinstance(karma, (int, float)):
        parts = [data.get("link_karma"), data.get("comment_karma")]
        karma = sum(parts) if all(isinstance(part, (int, float)) for part in parts) else None
    created = data.get("created_utc")
    return {
        "handle": handle,
        "karma": int(karma) if handle and karma is not None else None,
        "createdSeconds": float(created) if handle and isinstance(created, (int, float)) else None,
    }


def _profile_read(page, handle):
    """Reddit's own data about a profile, asked with this browser's cookies.

    In the account's browser that is the account looking at itself. In the
    reader, signed in to nobody, it is a stranger looking. Says what came
    back; a refusal is Reddit refusing the browser, not proof about the
    profile.
    """
    script = """
    async ([handle, limit]) => {
      const target = `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`
      const stop = new AbortController()
      setTimeout(() => stop.abort(), limit)
      try {
        const response = await fetch(target, {
          headers: { accept: "application/json" },
          credentials: "include",
          cache: "no-store",
          signal: stop.signal,
        })
        let data = null
        try { data = ((await response.json()) || {}).data || null } catch (error) { data = null }
        return {
          status: response.status,
          found: Boolean(response.ok && data && data.name),
          suspended: Boolean(data && data.is_suspended),
        }
      } catch (error) {
        return { status: 0, found: false, suspended: false }
      }
    }
    """
    return page.evaluate(script, [handle, FETCH_TIMEOUT_MS])


def _in_own_tab(page, read):
    """Runs `read` on a tab of its own that has been to Reddit's front page.

    The page a person may be using is never moved.
    """
    tab = page.context.new_page()
    try:
        _goto(tab, "https://www.reddit.com/")
        _past_the_check(tab)
        return read(tab)
    finally:
        try:
            tab.close()
        except Exception:  # noqa: BLE001 - the reading is what matters
            pass


def reddit_health(page, args=None):
    """Karma, account age, and the profile as the account sees it.

    The account's half of a health reading. The stranger's half runs in the
    reader browser (`reddit_stranger_profile`), never here: asking as a
    stranger from inside the account's own browser still came from the
    account's browser and proxy. Says what loaded and what did not; the app
    words it, carefully.
    """

    def read(tab):
        me = _me(tab)
        signs = _page_signs(tab)
        profile = {"signedIn": _profile_read(tab, me["handle"])} if me["handle"] else None
        return {**me, "blocked": signs["blocked"], "reason": signs["reason"], "profile": profile}

    return _in_own_tab(page, read)


def reddit_stranger_profile(page, args):
    """A profile as a stranger sees it, from the reader browser.

    The reader is signed in to nobody, so its own cookies are a stranger's,
    and the request is the one a visitor's browser makes.
    """
    handle = (args.get("handle") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,40}", handle):
        raise CommandError("stranger_profile: no account name given")
    return _in_own_tab(page, lambda tab: _profile_read(tab, handle))


def _page_signs(page):
    """Whether the page on screen is a challenge only a person can clear.

    Reads the page as it is and never moves it.

    A captcha counts only when a person could see it. Reddit loads Google's
    invisible reCAPTCHA on every page, a 256 by 60 frame that is never shown,
    and counting any reCAPTCHA frame read every page as blocked. Measured on
    5 Oct 2026: the search page that had just returned 25 posts carried one
    such frame, hidden, and nothing else.
    """
    script = """
    () => {
      const text = ((document.body && document.body.textContent) || "").toLowerCase()
      const shown = (el) => {
        const box = el.getBoundingClientRect()
        if (box.width < 100 || box.height < 60) return false
        return typeof el.checkVisibility === "function"
          ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true })
          : el.offsetParent !== null
      }
      const challenge = Boolean(document.querySelector('form input[name="solution"]'))
      const captcha = [
        ...document.querySelectorAll(
          'iframe[src*="recaptcha"], iframe[src*="hcaptcha"], iframe[title*="challenge" i]'
        ),
      ].some((frame) => !String(frame.src).includes("size=invisible") && shown(frame))
      const refused = text.includes("whoa there") || text.includes("you've been blocked")
      return { challenge, captcha, refused, url: location.href, host: location.hostname }
    }
    """
    signs = page.evaluate(script) or {}
    if signs.get("refused"):
        reason = "Reddit says this browser is blocked"
    elif signs.get("captcha"):
        reason = "a captcha is on screen"
    elif signs.get("challenge"):
        reason = "Reddit is asking the browser to prove it is a person"
    else:
        reason = ""
    return {
        "blocked": bool(reason),
        "reason": reason,
        "url": signs.get("url") or "",
        "host": signs.get("host") or "",
    }


def _short(error):
    """An error as one short line for a visit's record."""
    return (str(error) or error.__class__.__name__).splitlines()[0][:200]


def _open_feed_post(page, visit, deadline):
    """Opens one post from the posts on screen, reads it a little, comes back.

    Picks one at random among those a person could see now. Returns whether a
    post was opened. A failure is written down and the feed carries on.
    """
    try:
        links = page.locator(POST_LINKS)
        # The window's own height: a persistent Camoufox window has no set
        # viewport for Playwright to report.
        height = page.evaluate("() => window.innerHeight") or 900
        shown = []
        for index in range(min(links.count(), 30)):
            box = links.nth(index).bounding_box()
            if box and box["height"] > 8 and 0 <= box["y"] < height - box["height"]:
                shown.append(index)
        if not shown:
            return False
        before = page.url
        human.click(links.nth(random.choice(shown)))
        human.wait_for_address(page, lambda address: "/comments/" in address and address != before)
        if time.monotonic() < deadline:
            human.read_page(page, random.randint(*FEED_POST_CHARACTERS), visit["_sizes"])
        # Back as the browser's back button goes back. A key press sent by
        # Playwright reaches the page but never the browser's own back
        # shortcut (measured 12 Oct 2026), and Reddit opened the post without
        # a page load, so the address is watched rather than a load awaited.
        try:
            page.go_back(wait_until="commit", timeout=10_000)
        except Exception:  # noqa: BLE001 - the address below says whether it went
            pass
        human.wait_for_address(page, lambda address: "/comments/" not in address)
        return True
    except Exception as error:  # noqa: BLE001 - the feed carries on without it
        visit["problems"].append("opening a post from the feed: %s" % _short(error))
        if "/comments/" in (page.url or ""):
            _goto_listing(page, "https://www.reddit.com/")
        return False


def _past_the_check(page):
    """Waits for Reddit's "prove you are a person" page to solve itself and move on.

    A browser without Reddit's cookie gets it first, and it reloads the page
    once solved. A read taken during that reload measured on 12 Oct 2026 as
    "Execution context was destroyed". Up to 20 seconds; a check that does not
    clear is left for the read to report.
    """
    try:
        page.wait_for_selector('form input[name="solution"]', state="detached", timeout=20_000)
        page.wait_for_load_state("domcontentloaded", timeout=NAV_TIMEOUT_MS)
    except Exception:  # noqa: BLE001 - the read says what it found
        pass


def _goto_listing(page, url):
    """Goes to a page of posts and waits for the posts to be drawn.

    A browser without Reddit's cookie first gets a "prove you are a person"
    page that solves itself and moves on after a few seconds. Measured on
    12 Oct 2026: a fresh browser scrolled that page for its whole first stop.
    Waiting for the posts means the visit scrolls the feed, not the check.
    A listing that never draws posts is left as it is; the visit carries on.
    """
    _goto(page, url)
    try:
        page.locator("shreddit-post").first.wait_for(state="attached", timeout=20_000)
    except Exception:  # noqa: BLE001 - scrolling an empty page is harmless
        pass


def _feed(page, seconds, posts, visit, deadline):
    """Time in the home feed, opening `posts` of them along the way."""
    _goto_listing(page, "https://www.reddit.com/")
    stops = posts + 1
    for stop in range(stops):
        if time.monotonic() >= deadline:
            break
        share = seconds / stops * random.uniform(0.7, 1.3)
        visit["_sizes"].extend(human.browse(page, share, deadline))
        if stop < posts and time.monotonic() < deadline and _open_feed_post(page, visit, deadline):
            visit["postsOpened"] += 1


def _reach_post(page, permalink, subreddit, visit):
    """Gets to the post through its subreddit's newest posts where it can.

    Falls back to the post's address when the listing does not show it within
    a few scrolls, which an older post usually is not.
    """
    found = re.search(r"/comments/([a-z0-9]+)/", permalink)
    if subreddit and found and re.fullmatch(r"[A-Za-z0-9_]{1,60}", subreddit):
        post_id = found.group(1)
        try:
            _goto_listing(page, "https://www.reddit.com/r/%s/new/" % subreddit)
            link = page.locator("shreddit-post[permalink*='/comments/%s/'] a[slot='title']" % post_id).first
            for _ in range(FIND_IN_SUBREDDIT_SCROLLS):
                if link.count() and link.is_visible():
                    human.click(link)
                    human.wait_for_address(page, lambda address: "/comments/%s/" % post_id in address)
                    visit["reachedBy"] = "subreddit"
                    return
                visit["_sizes"].append(abs(human.scroll_once(page)))
                page.wait_for_timeout(random.randint(600, 1600))
        except Exception as error:  # noqa: BLE001 - the address still works
            visit["problems"].append("finding the post in r/%s: %s" % (subreddit, _short(error)))
    _goto(page, "https://www.reddit.com" + permalink)
    visit["reachedBy"] = "address"


def _new_visit():
    return {
        "beforeSeconds": 0,
        "afterSeconds": 0,
        "postsOpened": 0,
        "reachedBy": "address",
        "scrolls": 0,
        "problems": [],
        "_sizes": [],
    }


def _finish_visit(visit):
    """The visit as the app stores it, with the scroll sizes logged and dropped."""
    sizes = visit.pop("_sizes")
    visit["scrolls"] = len(sizes)
    return visit, human.describe_scrolls(sizes)


def reddit_comment(page, args):
    """Writes one comment under a post, inside an ordinary visit.

    Before: a few minutes in the home feed, opening a post or two. Then the
    post, reached through its subreddit where it can be. Then the comment.
    After: a little more feed. Every length is drawn fresh, so no two visits
    match. A failure in the feed before never stops the comment, and nothing
    after the comment can fail it: the comment is on Reddit by then, and it is
    never sent twice.

    The comment itself is deliberately strict. Every step that can fail says
    which step it was, so a failure on screen names the thing that went wrong
    rather than "could not post". Nothing here decides whether to comment: the
    app only calls this after a person has pressed Post.
    """
    permalink = (args.get("permalink") or "").strip()
    text = (args.get("text") or "").strip()
    subreddit = (args.get("subreddit") or "").strip()
    if not permalink.startswith("/"):
        raise CommandError("comment: permalink must start with /")
    if not text:
        raise CommandError("comment: no words to post")

    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = COMMENT_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()

    try:
        _feed(
            page,
            random.uniform(*FEED_BEFORE_SECONDS),
            random.randint(*POSTS_BEFORE),
            visit,
            deadline - reserve,
        )
    except Exception as error:  # noqa: BLE001 - the comment still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)

    _reach_post(page, permalink, subreddit, visit)

    state = reddit_state_quick(page)
    if not state.get("handle"):
        raise CommandError("comment: the browser is not signed in to Reddit")

    # Reddit has moved this composer more than once, so each known shape is
    # tried in turn and the failure names all of them.
    editors = [
        "shreddit-composer div[contenteditable='true']",
        "div[slot='comment-composer'] div[contenteditable='true']",
        "div[contenteditable='true'][role='textbox']",
    ]
    editor = None
    for selector in editors:
        found = page.locator(selector).first
        try:
            found.wait_for(state="visible", timeout=8_000)
            editor = found
            break
        except Exception:  # noqa: BLE001 - try the next shape
            continue
    if editor is None:
        raise CommandError(
            "comment: no comment box on the page (tried %s)" % "; ".join(editors)
        )

    before = _own_comment_urls(page, state["handle"])

    # Read the post first, for longer the longer it is, then type at a
    # person's pace. Typed rather than pasted, because Reddit's editor listens
    # for real key events and a pasted value can leave the Comment button off.
    body_length = page.evaluate(
        "() => (document.querySelector('shreddit-post') || document.body).innerText.length"
    )
    human.read_page(page, body_length, visit["_sizes"])
    typing_started = time.monotonic()
    human.click(editor)
    gaps = human.type_text(editor, text)
    human.pause_before_submit(page)
    # To the container log, so a test run can show the gaps vary.
    print(
        "comment typed: %d characters in %d seconds; %s"
        % (len(text), time.monotonic() - typing_started, human.describe_gaps(gaps)),
        flush=True,
    )

    buttons = [
        "shreddit-composer button[slot='submit-button']",
        "button[type='submit']:has-text('Comment')",
        "button:has-text('Comment')",
    ]
    pressed = False
    for selector in buttons:
        button = page.locator(selector).first
        try:
            button.wait_for(state="visible", timeout=5_000)
        except Exception:  # noqa: BLE001 - try the next shape
            continue
        # Pressed once, never tried again with another shape: a press that
        # raised may still have sent the comment.
        human.click(button)
        pressed = True
        break
    if not pressed:
        raise CommandError(
            "comment: the words were typed but no Comment button could be pressed"
        )

    # Reddit adds the comment without a navigation, so the proof is the new
    # address appearing under this account rather than the page changing.
    landed = None
    waiting_until = time.time() + 20
    while time.time() < waiting_until:
        page.wait_for_timeout(1_000)
        after = _own_comment_urls(page, state["handle"])
        fresh = [item for item in after if item not in before]
        if fresh:
            landed = fresh[0]
            break
    if not landed:
        raise CommandError(
            "comment: pressed Comment but no new comment appeared within 20 seconds"
        )

    # After: a little more feed. Nothing here may fail the comment, which is
    # already on Reddit.
    after_started = time.monotonic()
    try:
        seconds = min(random.uniform(*FEED_AFTER_SECONDS), deadline - after_started)
        if seconds > 5:
            _feed(page, seconds, 0, visit, deadline)
    except Exception as error:  # noqa: BLE001 - the comment is already sent
        visit["problems"].append("the feed after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after_started)

    record, scrolls = _finish_visit(visit)
    print(
        "comment visit: %d seconds in the feed before, %d after, %d posts opened, reached by %s; %s; %s"
        % (
            record["beforeSeconds"],
            record["afterSeconds"],
            record["postsOpened"],
            record["reachedBy"],
            scrolls,
            "; ".join(record["problems"]) or "no problems",
        ),
        flush=True,
    )
    return {"commentUrl": landed, "visit": record}


def _join(page, name, result, deadline):
    """Visits a subreddit, looks around a little, and joins it if it is not joined.

    Reddit draws the button as `shreddit-join-button`, which carries a
    `subscribed` attribute once joined. Pressing it again would leave, so it
    is pressed only when that is absent.
    """
    try:
        _goto_listing(page, "https://www.reddit.com/r/%s/" % name)
        looked = human.browse(page, random.uniform(8, 25), deadline)
        # Back up to the subreddit's header, where Join is, the way it came.
        human.scroll_back(page, page.evaluate("() => window.scrollY") or sum(looked))
        page.wait_for_timeout(random.randint(500, 1200))
        button = page.locator("shreddit-join-button").first
        button.wait_for(state="attached", timeout=8_000)
        if button.get_attribute("subscribed") is not None:
            result["alreadyJoined"].append(name)
            return
        human.click(page.locator("shreddit-join-button button").first)
        page.wait_for_timeout(random.randint(1500, 3000))
        if button.get_attribute("subscribed") is not None:
            result["joined"].append(name)
        else:
            result["problems"].append("r/%s: pressed Join but Reddit does not show it joined" % name)
    except Exception as error:  # noqa: BLE001 - the rest of the day goes on
        result["problems"].append("joining r/%s: %s" % (name, _short(error)))


def reddit_warm_up(page, args):
    """A warming account's day on Reddit: the feed, a few posts, a subreddit or two joined.

    Nothing is written and nothing is voted on. Every length is drawn fresh.
    Refuses when the browser is not signed in, because a warm-up is the
    account building its own history.
    """
    names = [
        name.lower()
        for name in (args.get("subreddits") or [])
        if isinstance(name, str) and re.fullmatch(r"[A-Za-z0-9_]{1,60}", name)
    ][:3]
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS

    _goto(page, "https://www.reddit.com/")
    # Asked while the "prove you are a person" page reloads, "who am I" fails
    # and the account would read as signed out.
    _past_the_check(page)
    if not _me(page)["handle"]:
        raise CommandError("warm_up: the browser is not signed in to Reddit")

    visit = _new_visit()
    result = {"joined": [], "alreadyJoined": [], "problems": visit["problems"]}
    seconds = random.uniform(*WARM_UP_FEED_SECONDS)
    posts = random.randint(*WARM_UP_POSTS)
    # Some of the feed, the subreddits, then the rest of the feed, so joining
    # sits in the middle of the visit rather than opening it.
    first = random.uniform(0.3, 0.7)
    _feed(page, seconds * first, posts // 2, visit, deadline)
    for name in names:
        if time.monotonic() >= deadline:
            break
        _join(page, name, result, deadline)
    _feed(page, seconds * (1 - first), posts - posts // 2, visit, deadline)

    record, scrolls = _finish_visit(visit)
    feed_seconds = int(time.monotonic() - started)
    print(
        "warm-up visit: %d seconds, %d posts opened, joined %s, already in %s; %s; %s"
        % (
            feed_seconds,
            record["postsOpened"],
            ", ".join(result["joined"]) or "none",
            ", ".join(result["alreadyJoined"]) or "none",
            scrolls,
            "; ".join(result["problems"]) or "no problems",
        ),
        flush=True,
    )
    return {
        "feedSeconds": feed_seconds,
        "postsOpened": record["postsOpened"],
        "scrolls": record["scrolls"],
        "joined": result["joined"],
        "alreadyJoined": result["alreadyJoined"],
        "problems": result["problems"],
    }


def reddit_state_quick(page, args=None):
    """Who is signed in, and whether a challenge is on screen, without navigating.

    The app asks this after every Reddit job, so it must never move the page:
    a person may be halfway through typing into a sign-in form in the same
    window. It reads Reddit's own "who am I" with the page's cookies and looks
    at whatever is already on screen.

    `checked` is False when the page is not on Reddit. A cookie read from
    another site's page fails, and that failure would otherwise be written down
    as "signed out" about an account that is signed in.
    """
    signs = _page_signs(page)
    host = signs["host"]
    if host != "reddit.com" and not host.endswith(".reddit.com"):
        return {"checked": False, "handle": None, "blocked": False, "reason": ""}

    return {
        "checked": True,
        **_me(page),
        "blocked": signs["blocked"],
        "reason": signs["reason"],
    }


def _own_comment_urls(page, handle):
    """Addresses of comments on this page written by `handle`."""
    script = """
    (author) => {
      const out = []
      for (const el of document.querySelectorAll("shreddit-comment")) {
        if ((el.getAttribute("author") || "") !== author) continue
        const permalink = el.getAttribute("permalink")
        if (permalink) out.push("https://www.reddit.com" + permalink)
      }
      return out
    }
    """
    return page.evaluate(script, handle) or []


def reddit_rules(page, args):
    """The rules a subreddit has posted, as its moderators wrote them.

    Reddit's own `about/rules.json` first, asked from the subreddit's rules
    page so the request carries the cookie that got past Reddit's challenge.
    If that is refused, the rules drawn on the page itself. Says what was seen
    and never judges a rule: `answered` False means Reddit would not say, which
    is a different answer from a subreddit that has posted no rules.
    """
    name = _subreddit_name(args, "rules")
    page_url = "https://www.reddit.com/r/%s/about/rules/" % name
    _goto(page, page_url)

    answer = _fetch(page, "https://www.reddit.com/r/%s/about/rules.json" % name)
    data = _parse(answer)
    if isinstance(data, dict) and isinstance(data.get("rules"), list):
        rules = []
        for rule in data["rules"]:
            if not isinstance(rule, dict):
                continue
            title = _text(rule.get("short_name")).strip()
            description = _text(rule.get("description")).strip()
            if title or description:
                rules.append({"title": title[:300], "description": description[:2000]})
        return {"answered": True, "status": answer.get("status") or 200, "source": "json", "rules": rules}

    shown = _rules_from_page(page)
    if shown:
        return {"answered": True, "status": answer.get("status") or 0, "source": "page", "rules": shown}
    return {"answered": False, "status": answer.get("status") or 0, "source": "json", "rules": []}


def _rules_from_page(page):
    """The fallback: the rules drawn on the subreddit's rules page.

    Each rule on Reddit's rules page is an expandable section whose summary is
    the rule's name and whose body is its description.
    """
    script = """
    () => {
      const out = []
      for (const el of document.querySelectorAll("faceplate-expandable-section-helper, details")) {
        const summary = el.querySelector("summary")
        if (!summary) continue
        const title = (summary.textContent || "").replace(/^\\s*\\d+\\s*/, "").trim()
        const whole = (el.textContent || "").trim()
        const description = whole.startsWith((summary.textContent || "").trim())
          ? whole.slice((summary.textContent || "").trim().length).trim()
          : ""
        if (title) out.push({ title: title.slice(0, 300), description: description.slice(0, 2000) })
      }
      return out
    }
    """
    return page.evaluate(script) or []


def _comment_address(address, routine="comment_check"):
    """The post id and comment id out of a comment's address, or raises."""
    parsed = urllib.parse.urlparse(address or "")
    if parsed.scheme != "https" or parsed.hostname not in ("www.reddit.com", "reddit.com"):
        raise CommandError("%s: that is not a Reddit address" % routine)
    parts = [part for part in parsed.path.split("/") if part]
    if "comments" not in parts:
        raise CommandError("%s: that address is not a comment" % routine)
    after = parts[parts.index("comments") + 1:]
    # /comments/<post>/<slug>/<comment>/, the newer /comments/<post>/comment/<comment>/
    # and /comments/<post>/<slug>/comment/<comment>/
    if len(after) < 3:
        raise CommandError("%s: that address names a post, not a comment" % routine)
    post_id, comment_id = after[0], after[-1]
    if not re.fullmatch(r"[a-z0-9]{1,16}", post_id) or not re.fullmatch(r"[a-z0-9]{1,16}", comment_id):
        raise CommandError("%s: that address is not a comment" % routine)
    return post_id, comment_id


def _reply_count(node):
    """Every reply under a comment, however deep, counting the ones Reddit folded away."""
    replies = (node.get("data") or {}).get("replies")
    if not isinstance(replies, dict):
        return 0
    total = 0
    for child in ((replies.get("data") or {}).get("children")) or []:
        if child.get("kind") == "t1":
            total += 1 + _reply_count(child)
        elif child.get("kind") == "more":
            total += int((child.get("data") or {}).get("count") or 0)
    return total


# At most this many replies directly under a comment are handed back by a
# check, in Reddit's own order. More than this under one comment is a thread,
# and the app answers people one at a time.
INCOMING_REPLY_LIMIT = 20


def _incoming_replies(node):
    """The replies directly under a comment, with their words and addresses.

    One level down only: a reply to a reply is somebody else's conversation.
    Deleted and removed replies are left out, because there is nobody to
    answer. Replies Reddit folded behind "more" are counted elsewhere but not
    read here, since reading them is another request each.
    """
    replies = (node.get("data") or {}).get("replies")
    if not isinstance(replies, dict):
        return []
    out = []
    for child in ((replies.get("data") or {}).get("children")) or []:
        if child.get("kind") != "t1":
            continue
        data = child.get("data") or {}
        text = _text(data.get("body")).strip()
        author = data.get("author")
        permalink = data.get("permalink") if isinstance(data.get("permalink"), str) else ""
        reply_id = data.get("id") if isinstance(data.get("id"), str) else ""
        if not text or text in ("[removed]", "[deleted]") or author in (None, "[deleted]"):
            continue
        if not permalink.startswith("/r/") or not re.fullmatch(r"[a-z0-9]{1,16}", reply_id):
            continue
        created = data.get("created_utc")
        out.append(
            {
                "id": reply_id,
                "author": str(author)[:40],
                "text": text[:4000],
                "score": int(data.get("score") or 0),
                "url": "https://www.reddit.com" + permalink,
                "postedAtSeconds": int(created) if isinstance(created, (int, float)) else None,
            }
        )
        if len(out) >= INCOMING_REPLY_LIMIT:
            break
    return out


def _comment_reading(data, comment_id):
    """What one answer says about the comment, or None when it is not in it."""
    if not isinstance(data, list) or len(data) < 2:
        return None
    for child in ((data[1].get("data") or {}).get("children")) or []:
        found = child.get("data") or {}
        if child.get("kind") != "t1" or found.get("id") != comment_id:
            continue
        body = found.get("body") if isinstance(found.get("body"), str) else ""
        gone = body.strip() in ("[removed]", "[deleted]") or found.get("author") in (None, "[deleted]")
        score = found.get("score")
        return {
            "visible": not gone,
            "removedText": body.strip() if gone else "",
            # Reddit hides a new comment's score in some subreddits, and that is
            # not the same as no upvotes.
            "upvotes": None if found.get("score_hidden") or not isinstance(score, (int, float)) else int(score),
            "replies": _reply_count(child),
            "incoming": _incoming_replies(child),
        }
    return {"missing": True}


def reddit_comment_check(page, args):
    """Reads one sent comment again: its upvotes, its replies, and whether it is still there.

    Asked twice from inside a Reddit page: once with no cookies, as a stranger
    would see it, and once as the account. A moderator's removal shows to a
    stranger as "[removed]" while the author still sees their words, so the
    stranger's answer decides whether it is there when Reddit gives one. When
    Reddit refuses the stranger, the browser's own view is used: a stranger's
    too when nobody is signed in, and the account's, which says so, when
    somebody is. Never navigates when the page is already on Reddit.
    """
    post_id, comment_id = _comment_address(args.get("commentUrl"))
    if not _on_reddit(page):
        _goto(page, "https://www.reddit.com/")
    url = "https://www.reddit.com/comments/%s/_/%s.json?limit=500" % (post_id, comment_id)

    stranger = _comment_reading(_parse(_fetch(page, url, "omit")), comment_id)
    you = _comment_reading(_parse(_fetch(page, url, "include")), comment_id)
    if stranger is None and you is None:
        raise CommandError("comment_check: Reddit would not answer for that comment")

    seen = stranger if stranger is not None else you
    # A browser signed in to nobody already sees what a stranger sees, so its
    # own answer counts as a stranger's. Only a signed-in view can hide a
    # moderator's removal.
    signed_in = stranger is None and bool(_me(page)["handle"])
    reading = {"seenAs": "you" if signed_in else "stranger"}
    if seen.get("missing"):
        # Not in the thread at all: deleted with nothing under it.
        reading.update({"visible": False, "removedText": "", "upvotes": None, "replies": 0, "incoming": []})
    else:
        reading.update(seen)
    # The account sees its own score even where a stranger's is hidden.
    if reading.get("upvotes") is None and you and not you.get("missing"):
        reading["upvotes"] = you.get("upvotes")
    return reading


def _reply_landed(page, handle):
    """Addresses of comments by `handle` on this page, each with the comment it sits under."""
    script = """
    (author) => {
      const out = []
      for (const el of document.querySelectorAll("shreddit-comment")) {
        if ((el.getAttribute("author") || "") !== author) continue
        const permalink = el.getAttribute("permalink")
        if (permalink) out.push([permalink, el.getAttribute("parentid") || ""])
      }
      return out
    }
    """
    return [
        ("https://www.reddit.com" + permalink, parent)
        for permalink, parent in (page.evaluate(script, handle) or [])
    ]


def reddit_reply(page, args):
    """Answers one reply under a comment the account sent, inside an ordinary visit.

    The same visit as a comment: some feed before, the reply opened by its own
    address the way a person opens it from their inbox, the answer typed at a
    person's pace, a little feed after. The answer goes in that reply's own
    box, never the post's, and the proof it landed is a new comment by this
    account whose parent is that reply. Every step that can fail names
    itself. Nothing here decides to answer: the app only calls this after a
    person pressed Reply, and it is never tried twice.
    """
    reply_url = (args.get("replyUrl") or "").strip()
    text = (args.get("text") or "").strip()
    _post_id, reply_id = _comment_address(reply_url, "reply")
    if not text:
        raise CommandError("reply: no words to post")
    thing = "t1_" + reply_id

    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = COMMENT_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()

    try:
        _feed(
            page,
            random.uniform(*FEED_BEFORE_SECONDS),
            random.randint(*POSTS_BEFORE),
            visit,
            deadline - reserve,
        )
    except Exception as error:  # noqa: BLE001 - the reply still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)

    _goto(page, reply_url)
    visit["reachedBy"] = "address"

    state = reddit_state_quick(page)
    if not state.get("handle"):
        raise CommandError("reply: the browser is not signed in to Reddit")

    # The reply being answered, found by Reddit's own id for it. Everything
    # below is looked for inside it, so the post's own box at the bottom of
    # the page can never be the one typed into.
    target = page.locator("shreddit-comment[thingid='%s']" % thing).first
    try:
        target.wait_for(state="attached", timeout=15_000)
    except Exception:  # noqa: BLE001 - say which step
        raise CommandError("reply: the reply is not on its page any more; it may have been deleted")

    # Measured on 12 Oct 2026: the Reply button sits in the comment's own
    # action row, which carries the comment's id, inside a tracker named
    # reply_comment.
    reply_button = target.locator(
        "shreddit-comment-action-row[comment-id='%s'] faceplate-tracker[noun='reply_comment'] button" % thing
    ).first
    try:
        reply_button.wait_for(state="visible", timeout=8_000)
    except Exception:  # noqa: BLE001 - say which step
        raise CommandError("reply: no Reply button under that reply")

    before = _reply_landed(page, state["handle"])

    body_length = page.evaluate(
        "(id) => { const el = document.querySelector(`shreddit-comment[thingid='${id}']`); return el ? el.innerText.length : 0 }",
        thing,
    )
    human.read_page(page, min(body_length, 2_000), visit["_sizes"])
    human.click(reply_button)

    editor = target.locator("div[contenteditable='true']").first
    try:
        editor.wait_for(state="visible", timeout=8_000)
    except Exception:  # noqa: BLE001 - say which step
        raise CommandError("reply: pressed Reply but no box opened under that reply")

    typing_started = time.monotonic()
    human.click(editor)
    gaps = human.type_text(editor, text)
    human.pause_before_submit(page)
    print(
        "reply typed: %d characters in %d seconds; %s"
        % (len(text), time.monotonic() - typing_started, human.describe_gaps(gaps)),
        flush=True,
    )

    # The box's own submit button, inside the reply. Never a button matched by
    # the word "Reply", which is also the button that opened the box.
    buttons = [
        "shreddit-composer button[slot='submit-button']",
        "shreddit-composer button[type='submit']",
        "comment-composer-host button[type='submit']",
    ]
    pressed = False
    for selector in buttons:
        button = target.locator(selector).first
        try:
            button.wait_for(state="visible", timeout=5_000)
        except Exception:  # noqa: BLE001 - try the next shape
            continue
        # Pressed once, never again with another shape: a press that raised
        # may still have sent it.
        human.click(button)
        pressed = True
        break
    if not pressed:
        raise CommandError("reply: the words were typed but no button to send them could be pressed")

    landed = None
    elsewhere = None
    waiting_until = time.time() + 20
    while time.time() < waiting_until:
        page.wait_for_timeout(1_000)
        fresh = [item for item in _reply_landed(page, state["handle"]) if item not in before]
        under = [url for url, parent in fresh if parent == thing]
        if under:
            landed = under[0]
            break
        if fresh:
            elsewhere = fresh[0][0]
    if not landed:
        if elsewhere:
            raise CommandError(
                "reply: it was sent but landed somewhere other than under that reply, at %s" % elsewhere
            )
        raise CommandError("reply: pressed send but no new reply appeared within 20 seconds")

    after_started = time.monotonic()
    try:
        seconds = min(random.uniform(*FEED_AFTER_SECONDS), deadline - after_started)
        if seconds > 5:
            _feed(page, seconds, 0, visit, deadline)
    except Exception as error:  # noqa: BLE001 - the reply is already sent
        visit["problems"].append("the feed after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after_started)

    record, scrolls = _finish_visit(visit)
    print(
        "reply visit: %d seconds in the feed before, %d after, %d posts opened; %s; %s"
        % (
            record["beforeSeconds"],
            record["afterSeconds"],
            record["postsOpened"],
            scrolls,
            "; ".join(record["problems"]) or "no problems",
        ),
        flush=True,
    )
    return {"replyUrl": landed, "visit": record}


def _first_visible(scope, selectors, timeout_ms):
    """The first of these shapes that is on screen, or None. Each is tried in turn."""
    for selector in selectors:
        found = scope.locator(selector).first
        try:
            found.wait_for(state="visible", timeout=timeout_ms)
            return found
        except Exception:  # noqa: BLE001 - try the next shape
            continue
    return None


def _own_comment(page, comment_url, routine):
    """Opens a comment the signed-in account wrote and returns it, or raises naming the step."""
    _post_id, comment_id = _comment_address(comment_url, routine)
    thing = "t1_" + comment_id
    _goto(page, comment_url)
    _past_the_check(page)
    state = reddit_state_quick(page)
    if not state.get("handle"):
        raise CommandError("%s: the browser is not signed in to Reddit" % routine)
    comment = page.locator("shreddit-comment[thingid='%s']" % thing).first
    try:
        comment.wait_for(state="attached", timeout=15_000)
    except Exception:  # noqa: BLE001 - say which step
        raise CommandError("%s: the comment is not on its page any more" % routine)
    author = comment.get_attribute("author") or ""
    if author.lower() != state["handle"].lower():
        raise CommandError("%s: that comment is by u/%s, not the signed-in u/%s" % (routine, author, state["handle"]))
    return comment, thing


def _comment_menu_item(page, comment, routine, words):
    """Opens the comment's own "..." menu and presses the item named `words`."""
    opener = _first_visible(
        comment,
        [
            "shreddit-overflow-menu button",
            "button[aria-label*='more options' i]",
            "button[aria-label*='comment actions' i]",
        ],
        8_000,
    )
    if opener is None:
        raise CommandError("%s: no menu button on the comment" % routine)
    human.click(opener)
    page.wait_for_timeout(random.randint(400, 900))
    item = _first_visible(
        page,
        [
            "[role='menuitem']:has-text('%s')" % words,
            "li:has-text('%s')" % words,
            "button:has-text('%s')" % words,
        ],
        5_000,
    )
    if item is None:
        raise CommandError("%s: the comment's menu has no %s" % (routine, words))
    human.click(item)


def _comment_body_now(page, thing):
    """The comment's words as Reddit holds them now, read with the page's cookies, or None."""
    data = _fetch_json(page, "https://www.reddit.com/api/info.json?id=%s" % thing)
    try:
        return data["data"]["children"][0]["data"].get("body")
    except Exception:  # noqa: BLE001 - no answer means unknown
        return None


def reddit_delete_comment(page, args):
    """Deletes one comment the signed-in account wrote, through the comment's own menu.

    Opened by its own address, the way a person opens it from their profile.
    The proof is Reddit's own record of the comment reading "[deleted]"
    afterwards. Nothing here decides to delete: the app only calls this after a
    person pressed Delete and confirmed it.
    """
    comment_url = (args.get("commentUrl") or "").strip()
    comment, thing = _own_comment(page, comment_url, "delete_comment")
    human.read_page(page, 400)
    _comment_menu_item(page, comment, "delete_comment", "Delete")

    confirm = _first_visible(
        page,
        [
            "button:has-text('Yes, delete')",
            "button:has-text('Delete'):not([aria-haspopup])",
        ],
        8_000,
    )
    if confirm is None:
        raise CommandError("delete_comment: pressed Delete but no confirm button appeared")
    human.pause_before_submit(page)
    human.click(confirm)

    waiting_until = time.time() + 15
    while time.time() < waiting_until:
        page.wait_for_timeout(1_500)
        if _comment_body_now(page, thing) == "[deleted]":
            return {"done": True}
    return {"done": False}


def reddit_edit_comment(page, args):
    """Changes the words of one comment the signed-in account wrote.

    The comment's own menu, Edit, the old words cleared and the new ones typed
    at a person's pace, then Save. The proof is Reddit's own record of the
    comment holding the new words afterwards. Nothing here decides to edit:
    the app only calls this after a person pressed Save changes.
    """
    comment_url = (args.get("commentUrl") or "").strip()
    text = (args.get("text") or "").strip()
    if not text:
        raise CommandError("edit_comment: no words to change it to")
    comment, thing = _own_comment(page, comment_url, "edit_comment")
    human.read_page(page, 600)
    _comment_menu_item(page, comment, "edit_comment", "Edit")

    editor = _first_visible(
        page,
        [
            "shreddit-composer div[contenteditable='true']",
            "div[contenteditable='true'][role='textbox']",
        ],
        8_000,
    )
    if editor is None:
        raise CommandError("edit_comment: pressed Edit but no box opened with the words in it")
    human.click(editor)
    editor.press("Control+a")
    page.wait_for_timeout(random.randint(200, 500))
    editor.press("Backspace")
    gaps = human.type_text(editor, text)
    human.pause_before_submit(page)
    print("edit typed: %d characters; %s" % (len(text), human.describe_gaps(gaps)), flush=True)

    save = _first_visible(
        page,
        [
            "shreddit-composer button[slot='submit-button']",
            "button:has-text('Save edits')",
            "button:has-text('Save')",
        ],
        5_000,
    )
    if save is None:
        raise CommandError("edit_comment: the new words were typed but no Save button could be pressed")
    human.click(save)

    wanted = " ".join(text.split())
    waiting_until = time.time() + 15
    while time.time() < waiting_until:
        page.wait_for_timeout(1_500)
        body = _comment_body_now(page, thing)
        if body is not None and " ".join(body.split()) == wanted:
            return {"done": True}
    return {"done": False}


def reddit_submit(page, args):
    """Sends a post of your own to a subreddit, inside an ordinary visit.

    Some feed before, the subreddit's own page and then its submit page, the
    title and words typed at a person's pace, Post, a little feed after. The
    proof is the page moving to the new post's own address. Nothing here
    decides to post: the app only calls this after a person pressed Post, and
    it is never tried twice.
    """
    subreddit = (args.get("subreddit") or "").strip()
    title = (args.get("title") or "").strip()
    body = (args.get("body") or "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_]{1,60}", subreddit):
        raise CommandError("submit: that is not a subreddit name")
    if not title:
        raise CommandError("submit: a post needs a title")

    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = COMMENT_RESERVE_SECONDS + (len(title) + len(body)) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()

    try:
        _feed(page, random.uniform(*FEED_BEFORE_SECONDS), random.randint(*POSTS_BEFORE), visit, deadline - reserve)
    except Exception as error:  # noqa: BLE001 - the post still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)

    # The subreddit first, the way a person arrives at its Create post button.
    try:
        _goto_listing(page, "https://www.reddit.com/r/%s/" % subreddit)
        visit["_sizes"].extend(human.browse(page, random.uniform(6, 15), deadline))
    except Exception as error:  # noqa: BLE001 - the submit page still works
        visit["problems"].append("the subreddit before: %s" % _short(error))
    _goto(page, "https://www.reddit.com/r/%s/submit/?type=TEXT" % subreddit)
    visit["reachedBy"] = "subreddit"

    state = reddit_state_quick(page)
    if not state.get("handle"):
        raise CommandError("submit: the browser is not signed in to Reddit")

    title_box = _first_visible(
        page,
        [
            "faceplate-textarea-input[name='title'] textarea",
            "textarea[name='title']",
            "input[name='title']",
        ],
        15_000,
    )
    if title_box is None:
        raise CommandError("submit: no title box on the subreddit's submit page; it may not take text posts")
    human.click(title_box)
    human.type_text(title_box, title)

    if body:
        body_box = _first_visible(
            page,
            [
                "shreddit-composer div[contenteditable='true']",
                "div[contenteditable='true'][role='textbox']",
                "div[name='body'] div[contenteditable='true']",
            ],
            8_000,
        )
        if body_box is None:
            raise CommandError("submit: the title was typed but there is no box for the words")
        human.click(body_box)
        gaps = human.type_text(body_box, body)
        print("post typed: %d characters; %s" % (len(title) + len(body), human.describe_gaps(gaps)), flush=True)
    human.pause_before_submit(page)

    button = _first_visible(
        page,
        [
            "#inner-post-submit-button",
            "button[type='submit']:has-text('Post')",
            "r-post-form-submit-button button",
        ],
        8_000,
    )
    if button is None:
        raise CommandError("submit: the post was typed but no Post button could be pressed")
    # Pressed once, never again: a press that raised may still have posted.
    human.click(button)

    landed = None
    waiting_until = time.time() + 30
    while time.time() < waiting_until:
        page.wait_for_timeout(1_000)
        address = page.url or ""
        if "/comments/" in address and "/r/%s/" % subreddit.lower() in address.lower():
            landed = address.split("?")[0]
            break
    if not landed:
        signs = _page_signs(page)
        if signs["blocked"]:
            raise CommandError("submit: pressed Post and %s" % signs["reason"])
        raise CommandError("submit: pressed Post but the new post's page did not open within 30 seconds")

    after_started = time.monotonic()
    try:
        seconds = min(random.uniform(*FEED_AFTER_SECONDS), deadline - after_started)
        if seconds > 5:
            _feed(page, seconds, 0, visit, deadline)
    except Exception as error:  # noqa: BLE001 - the post is already up
        visit["problems"].append("the feed after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after_started)

    record, scrolls = _finish_visit(visit)
    print(
        "post visit: %d seconds in the feed before, %d after, %d posts opened; %s; %s"
        % (
            record["beforeSeconds"],
            record["afterSeconds"],
            record["postsOpened"],
            scrolls,
            "; ".join(record["problems"]) or "no problems",
        ),
        flush=True,
    )
    return {"postUrl": landed, "visit": record}


# What this network can be asked to do. The package's __init__ prefixes each
# name with "reddit.", so two networks can both have a "search" without
# colliding, and a name nobody registered is refused — the port cannot be used
# to drive the browser anywhere else.
ROUTINES = {
    "state": reddit_state,
    "quick_state": reddit_state_quick,
    "search": reddit_search,
    "thread": reddit_thread,
    "comment": reddit_comment,
    "reply": reddit_reply,
    "health": reddit_health,
    "stranger_profile": reddit_stranger_profile,
    "rules": reddit_rules,
    "comment_check": reddit_comment_check,
    "warm_up": reddit_warm_up,
    "delete_comment": reddit_delete_comment,
    "edit_comment": reddit_edit_comment,
    "submit": reddit_submit,
}
