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
import re
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


def _fetch(page, url, credentials="include"):
    """Asks for a Reddit address from inside the page and keeps the status.

    `credentials` is "include" to send the page's cookies, which is how this
    browser gets past Reddit's challenge, or "omit" to ask as a stranger with
    none. Returns {"ok", "status", "body"}; status 0 means no answer at all.
    """
    script = """
    async ([target, credentials]) => {
      try {
        const response = await fetch(target, {
          headers: { accept: "application/json" },
          credentials,
          cache: "no-store",
        })
        return { ok: response.ok, status: response.status, body: await response.text() }
      } catch (error) {
        return { ok: false, status: 0, body: "" }
      }
    }
    """
    return page.evaluate(script, [url, credentials]) or {"ok": False, "status": 0, "body": ""}


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


def _profile_reads(page, handle):
    """Reddit's own data about a profile, asked for once signed in and once not.

    The signed-out read leaves the cookies off the request, which is the only
    way to be a stranger inside this browser. Its cookies live in one saved
    session that a second, empty one cannot be opened beside, and loading the
    profile page signed out in a tab would write a signed-out visitor's cookies
    over the signed-in ones. A request with its cookies left off sends none and
    keeps none. It still comes from this browser and this proxy, so a refusal
    is Reddit refusing the browser, not proof about the profile.
    """
    script = """
    async (handle) => {
      const target = `https://www.reddit.com/user/${encodeURIComponent(handle)}/about.json`
      const read = async (credentials) => {
        try {
          const response = await fetch(target, {
            headers: { accept: "application/json" },
            credentials,
            cache: "no-store",
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
      return { signedIn: await read("include"), signedOut: await read("omit") }
    }
    """
    return page.evaluate(script, handle)


def reddit_health(page, args=None):
    """Karma, account age, and whether a stranger can see the profile.

    Run in a tab of its own, so the page a person may be using is never moved:
    the tab goes to Reddit's front page to read who is signed in, then asks for
    the profile both ways, then closes. Says what loaded and what did not. It
    never decides what that means; the app words it, carefully.
    """
    tab = page.context.new_page()
    try:
        _goto(tab, "https://www.reddit.com/")
        me = _me(tab)
        signs = _page_signs(tab)
        profile = _profile_reads(tab, me["handle"]) if me["handle"] else None
        return {
            **me,
            "blocked": signs["blocked"],
            "reason": signs["reason"],
            "profile": profile,
        }
    finally:
        try:
            tab.close()
        except Exception:  # noqa: BLE001 - the reading is what matters
            pass


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


def _comment_address(address):
    """The post id and comment id out of a comment's address, or raises."""
    parsed = urllib.parse.urlparse(address or "")
    if parsed.scheme != "https" or parsed.hostname not in ("www.reddit.com", "reddit.com"):
        raise CommandError("comment_check: that is not a Reddit address")
    parts = [part for part in parsed.path.split("/") if part]
    if "comments" not in parts:
        raise CommandError("comment_check: that address is not a comment")
    after = parts[parts.index("comments") + 1:]
    # /comments/<post>/<slug>/<comment>/ or the newer /comments/<post>/<slug>/comment/<comment>/
    if len(after) < 3:
        raise CommandError("comment_check: that address names a post, not a comment")
    post_id, comment_id = after[0], after[-1]
    if not re.fullmatch(r"[a-z0-9]{1,16}", post_id) or not re.fullmatch(r"[a-z0-9]{1,16}", comment_id):
        raise CommandError("comment_check: that address is not a comment")
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
        reading.update({"visible": False, "removedText": "", "upvotes": None, "replies": 0})
    else:
        reading.update(seen)
    # The account sees its own score even where a stranger's is hidden.
    if reading.get("upvotes") is None and you and not you.get("missing"):
        reading["upvotes"] = you.get("upvotes")
    return reading


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
    "health": reddit_health,
    "rules": reddit_rules,
    "comment_check": reddit_comment_check,
}
