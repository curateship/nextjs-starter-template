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
"""

import html
import json
import time
import urllib.parse

import human

# How long to wait for a navigation before giving up. Reddit behind a
# residential proxy is slow, and a real captcha never resolves at all, so this
# is generous but finite.
NAV_TIMEOUT_MS = 45_000

# Reddit's search answers at most this many posts a page. Asking for more than
# one page of them is a later job; one page is already more than a person can
# write comments on in a sitting.
SEARCH_LIMIT = 25


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


def _fetch_json(page, url):
    """Asks for a Reddit address as JSON, using the page's own cookies.

    Returns the parsed object, or None when Reddit refuses. Never raises for a
    refusal: a refusal is an expected answer that sends the caller to the
    rendered page instead.
    """
    script = """
    async (target) => {
      try {
        const response = await fetch(target, {
          headers: { accept: "application/json" },
          credentials: "include",
        })
        if (!response.ok) return { ok: false, status: response.status }
        return { ok: true, body: await response.text() }
      } catch (error) {
        return { ok: false, status: 0, error: String(error) }
      }
    }
    """
    answer = page.evaluate(script, url)
    if not answer or not answer.get("ok"):
        return None
    try:
        return json.loads(answer["body"])
    except (ValueError, TypeError):
        return None


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

    Navigating first is not optional even when the JSON path works: the
    navigation is what solves Reddit's challenge and sets the cookie the JSON
    request then needs.
    """
    query = (args.get("query") or "").strip()
    if not query:
        raise CommandError("search: no query given")
    subreddit = (args.get("subreddit") or "").strip()
    sort = args.get("sort") or "new"
    window = args.get("window") or "week"

    url = _search_url(query, subreddit, sort, window)
    _goto(page, url)

    listing = _fetch_json(page, url.replace("/search/?", "/search.json?"))
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

    A handle of None means signed out. `blocked` means Reddit is showing a
    challenge or a captcha that only a person can clear, and the app shows the
    stream link rather than retrying.
    """
    try:
        _goto(page, "https://www.reddit.com/")
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        return {"handle": None, "blocked": True, "reason": str(error)}

    me = _fetch_json(page, "https://www.reddit.com/api/me.json")
    handle = None
    if isinstance(me, dict):
        data = me.get("data") or {}
        handle = data.get("name") or None

    signs = _page_signs(page)

    return {
        "handle": handle,
        "blocked": signs["blocked"],
        "reason": signs["reason"],
        "url": signs["url"],
    }


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


def reddit_comment(page, args):
    """Writes one comment under a post and returns where it landed.

    Deliberately strict. Every step that can fail says which step it was, so a
    failure on screen names the thing that went wrong rather than "could not
    post". Nothing here decides whether to comment: the app only calls this
    after a person has pressed Post.
    """
    permalink = (args.get("permalink") or "").strip()
    text = (args.get("text") or "").strip()
    if not permalink.startswith("/"):
        raise CommandError("comment: permalink must start with /")
    if not text:
        raise CommandError("comment: no words to post")

    url = "https://www.reddit.com" + permalink
    _goto(page, url)

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
    human.read_page(page, body_length)
    started = time.monotonic()
    editor.click()
    gaps = human.type_text(editor, text)
    human.pause_before_submit(page)
    # To the container log, so a test run can show the gaps vary.
    print(
        "comment typed: %d characters in %d seconds; %s"
        % (len(text), time.monotonic() - started, human.describe_gaps(gaps)),
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
            button.click()
            pressed = True
            break
        except Exception:  # noqa: BLE001 - try the next shape
            continue
    if not pressed:
        raise CommandError(
            "comment: the words were typed but no Comment button could be pressed"
        )

    # Reddit adds the comment without a navigation, so the proof is the new
    # address appearing under this account rather than the page changing.
    deadline = time.time() + 20
    while time.time() < deadline:
        page.wait_for_timeout(1_000)
        after = _own_comment_urls(page, state["handle"])
        fresh = [item for item in after if item not in before]
        if fresh:
            return {"commentUrl": fresh[0]}

    raise CommandError(
        "comment: pressed Comment but no new comment appeared within 20 seconds"
    )


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

    me = _fetch_json(page, "https://www.reddit.com/api/me.json")
    handle = None
    if isinstance(me, dict):
        handle = (me.get("data") or {}).get("name") or None
    return {
        "checked": True,
        "handle": handle,
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
}
