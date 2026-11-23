"""What the browser actually does on X (x.com, once Twitter).

The only file in the app that knows how an X page is put together, the way
`medium.py` is for Medium and `reddit.py` for Reddit. When X redesigns, the
fix is here. The shape of every answer is in `src/server/social/x/calls.ts`;
on a phone the same names reach the X app's steps in `rack/promo_rack.py`.

Every routine takes the live Playwright page and returns plain data the
TypeScript side stores. None of them touch the database or decide what to
write: the app does that, and only after a person pressed a button.

X shows no search and no replies to a visitor who is not signed in, so every
read here runs in a search account's browser: a throwaway X account that
never writes (part 3). X caps how many posts an account may see in a day, so
every read answers `viewed`, the posts it put in front of the account, and
`limited`, true when X said "Rate limit exceeded" anyway (part 5). `viewed`
counts every post X sent the page, pinned posts and adverts included, because
that is what X counts; a search asked for 20 posts may count a few more, since
X sends its timeline in pages of about twenty and a page cannot be half
loaded. Scrolling stops as soon as enough have arrived.

Two ways to read X, in this order:

1. **X's own data, as the page loads it.** X's web app draws nothing from the
   page's HTML: every timeline, post, account and message arrives as JSON
   from `x.com/i/api/graphql/<id>/<Operation>` (or `api.x.com/graphql/...`),
   and direct messages from `x.com/i/api/1.1/dm/...`. Asking those addresses
   ourselves needs a signature X's own scripts make for every request, so
   nothing here asks them. Instead each routine listens to the answers the
   page receives (`page.on("response")`) while it does what a person does,
   and reads exact ids, counts, followers, views, who may reply and when a
   post went up from them:
   - `SearchTimeline`: `search` (words and hashtags), `mentions`, `reach`;
   - `UserTweets`: `search` for a watched account, and the account's own
     page when a write looks for what it already sent;
   - `TweetDetail`: `post`, `check`, `reach`, and the post a `reply`, `quote`,
     `edit` or `delete` works on;
   - `UserByScreenName`: `lookup`, and the followers and joining day on the
     full `state`;
   - the community's own answers: `community`, and `publish` into one;
   - any answer holding trend items (`ExplorePage`, `GenericTimelineById`,
     `guide.json`): `trends`;
   - `CreateTweet` (or `CreateNoteTweet` for a long post) and `DeleteTweet`:
     the id of what was just written, or X's own words for a refusal;
   - `dm/inbox_initial_state`, `dm/user_updates`, `dm/conversation` and
     `dm/new2`: `inbox` and `message`.
2. **The rendered page**, when the data did not arrive: posts drawn as
   `article[data-testid="tweet"]`, with `[data-testid="User-Name"]`,
   `[data-testid="tweetText"]`, the time link, and the counts in the action
   row's `aria-label`. It has no account ids or follower numbers and cannot
   say who may reply, so it is only the fallback.

`state` and `quick_state` read the page itself: the left menu's profile link
for the handle (`AppTabBar_Profile_Link`), `window.__INITIAL_STATE__` for the
account's id, followers and joining day, and the page's own words for a lock,
suspension, "confirm it's you", sign-in code or rate-limit screen.

What has been proved: nothing yet against the live site. Every routine here
was written on 22 Oct 2026 from how X's pages and data are put together, with
no X account to sign in with, and the first run with a real search account
and a real posting account is their test. The parsing around them is proved
by `test_x.py`. Each routine says which step failed when it fails, and every
write is checked afterwards (the id in X's answer, or the post found again on
X) rather than trusted.
"""

import html
import http.client
import ipaddress
import json
import os
import random
import re
import socket
import ssl
import tempfile
import time
import urllib.parse
from datetime import datetime, timezone

import human

NAV_TIMEOUT_MS = 45_000

# How long a page gets to draw its first posts or say it has none.
SETTLE_MS = 15_000

# A read answers inside the launcher's 90 seconds, the page load included.
READ_BUDGET_SECONDS = 70

# Scrolls in a row that bring nothing new before a read stops.
STALE_SCROLLS = 3

# The most posts one search may ask for, whatever the app sends.
SEARCH_LIMIT = 200

# A post's words are kept to this many characters. A paid account's long post
# can run to 25,000; this is enough for the AI to answer and short enough to store.
POST_TEXT_CHARS = 6_000

# How many top replies under a post are kept for the AI (X_TOP_REPLIES).
TOP_REPLIES = 5

# How many replies to one of ours, and how many messages, one read keeps.
INCOMING_LIMIT = 40
INBOX_LIMIT = 50

# Every account looked up opens its page, and X sends that page's newest posts
# with it, about twenty views each. Eight fit the launcher's time comfortably.
LOOKUP_LIMIT = 8

TRENDS_LIMIT = 30
COMMUNITY_TEXT_CHARS = 4_000

# Scrolls down a post's replies when looking for one of ours under it.
UNDER_SCROLLS = 8

# A picture for a post: X takes pictures up to 5 MB. Its download must finish
# inside a minute, read in pieces of this size.
PICTURE_MAX_BYTES = 5 * 1024 * 1024
PICTURE_SECONDS = 60
PICTURE_CHUNK_BYTES = 64 * 1024
PICTURE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp", "image/gif": ".gif"}

# X's poll: two to four choices of up to 25 characters, open 5 minutes to 7 days.
POLL_CHOICES = (2, 4)
POLL_CHOICE_CHARS = 25
POLL_MINUTES = (5, 7 * 24 * 60)

# A visit around a reply or a quote. X's feed is quick to read, so the time
# before is the home feed with a post or two opened.
FEED_BEFORE_SECONDS = (60, 180)
POSTS_BEFORE = (1, 2)
FEED_AFTER_SECONDS = (20, 60)
FEED_POST_CHARACTERS = (200, 1200)
VISIT_BUDGET_SECONDS = 800
TYPING_SECONDS_PER_CHARACTER = 0.25
REPLY_RESERVE_SECONDS = 150

# A post of the account's own: a shorter look at the feed, and none between
# a thread's pieces, which a person sends one straight after another.
PUBLISH_FEED_BEFORE_SECONDS = (30, 90)
PUBLISH_FEED_AFTER_SECONDS = (10, 30)

# A warming account's day on X.
WARM_UP_FEED_SECONDS = (90, 240)
WARM_UP_POSTS = (1, 3)
WARM_UP_SEARCHES = (1, 2)
WARM_UP_SEARCH_SECONDS = (20, 60)

# How long the app waits for X to answer a just-sent post with its id.
LANDED_WAIT_SECONDS = 25

# A post of the account's own, or a message, counts as an earlier try only
# when it went up in this last stretch, unless the app says when the first
# try began (`since` on a publish). The same words posted last week are
# another post. A reply under a post and a quote of a post have no such
# limit: the same words from the account under the same post (or quoting it)
# are always an earlier try, however long ago.
LOOK_BACK_SECONDS = 60 * 60

# The app's `since` is read from this much earlier, because the app's clock
# and X's may disagree by a little.
CLOCK_SLACK_SECONDS = 5 * 60

# The words of every write that is refused because X's data never came, so
# nothing could be looked for.
NO_EARLIER_LOOK = "X's data for the post did not load, so Promo could not look for an earlier try. Nothing was typed."
NO_EARLIER_LOOK_OWN = "X's data for the account's own page did not load, so Promo could not look for an earlier try. Nothing was typed."

# Added to whatever fails once Post, Reply or Update was pressed. The app
# matches "may already be on X" (replies.ts, posts.ts) to stop a blind retry.
MAY_BE_ON_X = "It may already be on X; look before sending again."

HOME = "https://x.com/home"

DETAIL_OPS = ("TweetDetail", "TweetResultByRestId")
WRITE_OPS = ("CreateTweet", "CreateNoteTweet")
HOME_OPS = ("HomeTimeline", "HomeLatestTimeline")

COMPOSER = "[data-testid='tweetTextarea_0']"
MODAL_BOX = "[role='dialog'] " + COMPOSER
INLINE_BUTTONS = ["main [data-testid='tweetButtonInline']", "[data-testid='tweetButtonInline']"]
MODAL_BUTTONS = ["[role='dialog'] [data-testid='tweetButton']", "[data-testid='tweetButton']"]

# The buttons X folds some replies behind, for everyone but their writer.
SHOW_MORE_BUTTONS = [
    "[role='button']:has-text('Show probable spam')",
    "button:has-text('Show probable spam')",
    "[role='button']:has-text('Show more replies')",
    "button:has-text('Show more replies')",
    "[role='button']:has-text('Show additional replies')",
    "button:has-text('Show additional replies')",
]

FEED_POST_LINKS = "article[data-testid='tweet'] a[href*='/status/']:has(time)"


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


class _Refused(CommandError):
    """X's own refusal of a post after the press: nothing went up, so it never says it may be on X."""


def _short(error):
    return (str(error) or error.__class__.__name__).splitlines()[0][:200]


# X's own words use curly apostrophes ("We\u2019ve temporarily limited"), so
# words are compared with them put back to plain.
PLAIN_MARKS = str.maketrans({"\u2018": "'", "\u2019": "'", "\u201c": '"', "\u201d": '"', "\u2013": "-", "\u2014": "-", "\u2026": "...", "\u00a0": " "})


def _plain(text):
    """Words as they compare: plain quotes and dashes, one space, lower case."""
    return re.sub(r"\s+", " ", (text or "").translate(PLAIN_MARKS)).strip().lower()


def _words_only(text):
    """A post's words as two copies of it compare.

    Links are dropped, whole or as X draws them ("example.com/a\u2026", with
    no https://), since X shows them shortened; `_same_words` compares the
    links apart. So are the @names X puts in front of a reply's words, which
    the account never typed.
    """
    text = re.sub(r"https?://\S+", " ", text or "")
    text = re.sub(r"(?<!\S)(?:www\.)?[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}(?:/\S*)?(?=[.,;:!?)]*(?:\s|$))", " ", text)
    text = re.sub(r"^\s*(?:@\w{1,15}\s+)+", "", text)
    return _plain(text).rstrip(". ")


def _links(text):
    """The whole links in some words, as they compare: X's t.co ones and cut-off ones left out."""
    out = set()
    for link in re.findall(r"https?://\S+", text or ""):
        link = link.rstrip(".,;:!?)'\"")
        if link.endswith("\u2026") or (urllib.parse.urlparse(link).hostname or "").lower() == "t.co":
            continue
        out.add(link.split("://", 1)[1].rstrip("/").lower())
    return out


# X cuts a long post short with "\u2026" in some places. What it shows then
# must be at least this long to count as ours, so a cut "Yes\u2026" never matches.
CUT_OFF_CHARS = 40


def _same_words(sent, found):
    """True when `found` is the words we sent, all of them.

    The one difference allowed is X's own cut-off of a long post: when it
    ends what it shows with "\u2026", what it shows must be how ours starts.
    When both carry whole links, the links must be the same too, so two posts
    from one template that differ only in their link are two posts.
    """
    wanted = _words_only(sent)
    shown = _words_only(found)
    if not wanted or not shown:
        return False
    cut = (found or "").rstrip().endswith("\u2026")
    if shown != wanted and not (cut and len(shown) >= CUT_OFF_CHARS and wanted.startswith(shown)):
        return False
    ours, theirs = _links(sent), _links(found)
    return cut or not ours or not theirs or ours == theirs


def _same_words_in(sent, block):
    """True when some run of a drawn block's lines is the words we sent.

    A drawn message carries its time and "Sent" on lines of their own, so
    the whole block is never just our words.
    """
    lines = [line for line in (block or "").splitlines() if line.strip()]
    return any(_same_words(sent, "\n".join(lines[start:end])) for start in range(len(lines)) for end in range(start + 1, len(lines) + 1))


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


X_HOSTS = {"x.com", "www.x.com", "mobile.x.com", "twitter.com", "www.twitter.com", "mobile.twitter.com"}


def _on_x(page):
    return (urllib.parse.urlparse(page.url or "").hostname or "") in X_HOSTS


# --- Small readers, each tested on its own -------------------------------


def _number(text):
    """"1.2K" is 1200, "3.4M" is 3400000, "3,410" is 3410, anything else None."""
    found = re.fullmatch(r"\s*(\d[\d.,]*)\s*([KkMmBb]?)\s*", text or "")
    if not found:
        return None
    digits = found.group(1).replace(",", "")
    try:
        value = float(digits)
    except ValueError:
        return None
    scale = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get(found.group(2).lower(), 1)
    return int(round(value * scale))


def _count(value):
    """A count from X's data, which sends some as numbers and some as text ("1234")."""
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return int(value)
    if isinstance(value, str):
        return _number(value)
    return None


def _handle(value):
    """An account's handle as X writes it, out of an @name, an address or a link's path, or ""."""
    text = (value or "").strip()
    found = re.match(r"^(?:https?://)?(?:www\.|mobile\.)?(?:x|twitter)\.com/(.+)$", text, re.I)
    if found:
        text = found.group(1)
    text = re.split(r"[/?#]", text.lstrip("/"))[0].lstrip("@")
    return text if re.fullmatch(r"[A-Za-z0-9_]{1,15}", text) else ""


def _handle_arg(value, step):
    handle = _handle(value if isinstance(value, str) else "")
    if not handle:
        raise CommandError("%s: that is not an X handle" % step)
    return handle


# A post's or a community's id: digits only, as X writes them.
X_ID = re.compile(r"\d{5,25}")


def _post_id(value, step):
    """A post id the app asked about, checked so it can only ever be one."""
    text = (value if isinstance(value, str) else "").strip()
    if not X_ID.fullmatch(text):
        raise CommandError("%s: that is not a post id X uses" % step)
    return text


def _community_id(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if not X_ID.fullmatch(text):
        raise CommandError("%s: that is not a community id X uses" % step)
    return text


def _conversation_id(value, step):
    """A direct-message conversation: one number for a group, two joined by "-" for two people."""
    text = (value if isinstance(value, str) else "").strip()
    if not re.fullmatch(r"\d{1,25}(?:[-:]\d{1,25})?", text):
        raise CommandError("%s: that is not a conversation id X uses" % step)
    return text


STATUS_PATH = re.compile(r"(?:^|/)([A-Za-z0-9_]{1,15})/status(?:es)?/(\d{5,25})")


def _post_from_path(value):
    """(handle, post id) out of a post's address or path, or None."""
    found = STATUS_PATH.search(value or "")
    return (found.group(1), found.group(2)) if found else None


def _status_url(post_id, handle="i"):
    return "https://x.com/%s/status/%s" % (handle or "i", post_id)


MONTHS = {name: index + 1 for index, name in enumerate(["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}


def _x_time(value):
    """X's own date ("Wed Oct 10 20:19:24 +0000 2018") as seconds since 1970, or None."""
    found = re.fullmatch(r"\w{3} (\w{3}) (\d{1,2}) (\d{2}):(\d{2}):(\d{2}) ([+-])(\d{2})(\d{2}) (\d{4})", (value or "").strip() if isinstance(value, str) else "")
    if not found:
        return None
    month = MONTHS.get(found.group(1).lower())
    if not month:
        return None
    moment = datetime(int(found.group(9)), month, int(found.group(2)), int(found.group(3)), int(found.group(4)), int(found.group(5)), tzinfo=timezone.utc)
    offset = (int(found.group(7)) * 3600 + int(found.group(8)) * 60) * (1 if found.group(6) == "+" else -1)
    return moment.timestamp() - offset


def _iso_time(value):
    """A drawn post's `time[datetime]` ("2026-10-21T14:03:00.000Z") as seconds, or None."""
    found = re.fullmatch(r"(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?Z", (value or "").strip())
    if not found:
        return None
    parts = [int(part) for part in found.groups()]
    return datetime(*parts, tzinfo=timezone.utc).timestamp()


FULL_MONTHS = {name: index + 1 for index, name in enumerate(["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"])}


def _joined_words(text):
    """A profile's "Joined March 2015" as the first of that month, in seconds, or None."""
    found = re.search(r"joined\s+([a-z]+)\s+(\d{4})", (text or "").lower())
    if not found or found.group(1) not in FULL_MONTHS:
        return None
    return datetime(int(found.group(2)), FULL_MONTHS[found.group(1)], 1, tzinfo=timezone.utc).timestamp()


# The action row under a drawn post says its numbers in words:
# "12 replies, 4 reposts, 1,203 likes, 3 bookmarks, 5321 views".
COUNT_WORDS = {
    "reply": "replies", "replies": "replies",
    "repost": "reposts", "reposts": "reposts", "retweet": "reposts", "retweets": "reposts",
    "like": "likes", "likes": "likes",
    "bookmark": "bookmarks", "bookmarks": "bookmarks",
    "view": "views", "views": "views",
}


def _counts_from_label(label):
    out = {}
    for number, word in re.findall(r"(\d[\d,.]*\s*[KkMmBb]?)\s+([A-Za-z]+)", label or ""):
        key = COUNT_WORDS.get(word.lower())
        if key and key not in out:
            out[key] = _number(number)
    return out


def _posts_words(text):
    """A trend's "12.3K posts" (or the older "5,021 Tweets") as a number, or None."""
    found = re.fullmatch(r"\s*(\d[\d.,]*\s*[KkMmBb]?)\s+(?:posts|tweets)\s*", text or "", re.I)
    return _number(found.group(1)) if found else None


def _rate_limited(status, data):
    """True when an answer from X is its rate limit: status 429, or error code 88."""
    if status == 429:
        return True
    if isinstance(data, dict):
        for error in data.get("errors") or []:
            if not isinstance(error, dict):
                continue
            if error.get("code") == 88 or "rate limit" in str(error.get("message") or "").lower():
                return True
    return False


GRAPHQL_PATH = re.compile(r"/(?:i/api/)?graphql/[^/]+/([A-Za-z_]+)$")
DM_PATH = re.compile(r"/(?:i/api/)?1\.1/dm/([a-z0-9_]+)")
GUIDE_PATH = re.compile(r"/(?:i/api/)?2/guide\.json$")


def _operation(url):
    """Which of X's data answers an address is: "SearchTimeline", "dm/conversation", "guide", or ""."""
    parsed = urllib.parse.urlparse(url or "")
    host = parsed.hostname or ""
    if not (host == "x.com" or host.endswith(".x.com") or host == "twitter.com" or host.endswith(".twitter.com")):
        return ""
    path = parsed.path or ""
    found = GRAPHQL_PATH.search(path)
    if found:
        return found.group(1)
    found = DM_PATH.search(path)
    if found:
        return "dm/" + found.group(1)
    if GUIDE_PATH.search(path):
        return "guide"
    return ""


def _poll_length(minutes):
    """A poll's minutes as X's three boxes: days, hours, minutes."""
    total = max(POLL_MINUTES[0], min(POLL_MINUTES[1], int(minutes)))
    return total // 1440, (total % 1440) // 60, total % 60


def _phrase(text):
    """A run of the reply's own words distinctive enough to search X for.

    Links, @names, hashtags and quote marks are left out, since X searches
    them differently. The run is up to seven words, picked where the long
    words are, because a phrase of short common words finds everybody.
    """
    cleaned = re.sub(r"https?://\S+|[@#]\w+", " ", (text or "").translate(PLAIN_MARKS))
    words = re.findall(r"[A-Za-z0-9][A-Za-z0-9'\-]*", cleaned)
    if len(words) <= 7:
        return " ".join(words)
    best, best_score = 0, -1
    for start in range(len(words) - 6):
        score = sum(len(word) for word in words[start:start + 7] if len(word) > 3)
        if score > best_score:
            best, best_score = start, score
    return " ".join(words[best:best + 7])


BAN_PHRASES = (
    "your account is suspended",
    "your account has been suspended",
    "your account is locked",
    "your account has been locked",
    "your account is temporarily locked",
    "we've temporarily limited some of your account features",
    "confirm it's you",
)

CODE_PHRASES = ("verification code", "confirmation code", "code generator", "authentication app", "login code", "enter code")
CHECK_PHRASES = ("unusual login activity",)
LIMIT_PHRASES = ("rate limit exceeded", "cannot retrieve posts at this time")
# A post's page that says the post is not there to read.
GONE_PHRASES = ("this page doesn't exist", "this post is unavailable", "this post was deleted", "these posts are protected", "account that no longer exists")
CODE_REASON = "X is asking for the six-digit sign-in code"


# A line that starts with one of X's ban phrases counts only up to this long.
# X's own lines are short; a longer one is somebody talking about a ban.
BAN_LINE_CHARS = 90


def _ban_line(line):
    """True when a line is one of X's ban phrases, the way the phone matches it.

    The phrase alone, with or without its full stop, or a short line that
    starts with it. "Someone said your account is suspended" is not one.
    """
    plain = _plain(line).rstrip(".")
    return any(plain == phrase or (plain.startswith(phrase) and len(plain) <= BAN_LINE_CHARS) for phrase in BAN_PHRASES)


def _ban_words(text, path=""):
    """X's own words on a lock or suspension screen, or None.

    The line holding the phrase, with the sentence after it when there is one,
    so the account's row shows what X said. `/account/access` is X's lock
    page, whatever it says.
    """
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if _ban_line(line):
            words = line
            if index + 1 < len(lines) and len(lines[index + 1]) > 20:
                words = "%s %s" % (line, lines[index + 1])
            return words[:300]
    if (path or "").startswith("/account/access"):
        about = next((line for line in lines if "account" in line.lower()), "")
        return (about or "X has locked this account until it is unlocked at x.com/account/access")[:300]
    return None


def _judge(raw):
    """What the page's signs mean: who is signed in, and what is in the way. Pure, so it is tested."""
    host = raw.get("host") or ""
    path = raw.get("path") or ""
    text = raw.get("text") or ""
    plain = _plain(text)
    initial = raw.get("initial") or {}
    out = {
        "onX": host in X_HOSTS,
        "checked": False,
        "handle": None,
        "blocked": False,
        "reason": "",
        "banScreen": None,
        "limited": False,
        "signedOut": False,
        "followers": _count(initial.get("followers")),
        "joinedSeconds": _x_time(initial.get("created")),
    }
    if not out["onX"]:
        return out
    handle = _handle(raw.get("profileHref") or "") or _handle(initial.get("handle") or "")
    out["handle"] = handle or None
    ban = _ban_words(text, path)
    asking_code = bool(raw.get("codeField")) and any(phrase in plain for phrase in CODE_PHRASES)
    asking_who = any(phrase in plain for phrase in CHECK_PHRASES)
    out["limited"] = any(phrase in plain for phrase in LIMIT_PHRASES)
    in_login = path.startswith("/i/flow/login") or path.startswith("/login") or path.startswith("/i/flow/signup")
    out["signedOut"] = not handle and (bool(raw.get("login")) or in_login)
    if ban:
        out["banScreen"] = ban
        out["blocked"], out["reason"] = True, ban
    elif asking_code:
        out["blocked"], out["reason"] = True, CODE_REASON
    elif asking_who:
        out["blocked"], out["reason"] = True, "X is asking which account this is, after unusual login activity"
    elif raw.get("arkose"):
        out["blocked"], out["reason"] = True, "X is asking the browser to prove it is a person"
    elif out["limited"]:
        out["blocked"], out["reason"] = True, "X says this account has hit its rate limit"
    out["checked"] = bool(handle or out["signedOut"] or out["blocked"])
    out["gonePage"] = any(phrase in plain for phrase in GONE_PHRASES)
    return out


# --- Reading X's own data -------------------------------------------------


def _walk(node, depth=0):
    """Every object inside an answer, in the order it was written."""
    if depth > 40:
        return
    if isinstance(node, dict):
        yield node
        for value in node.values():
            if isinstance(value, (dict, list)):
                yield from _walk(value, depth + 1)
    elif isinstance(node, list):
        for value in node:
            if isinstance(value, (dict, list)):
                yield from _walk(value, depth + 1)


def _instructions(data):
    """Every timeline instruction in an answer, wherever X put the timeline.

    Search keeps it under `search_by_raw_query.search_timeline.timeline`, an
    account's page under `user.result.timeline(_v2).timeline`, a post under
    `threaded_conversation_with_injections_v2`. The list is found by its key
    rather than its path, so a renamed wrapper does not lose it.
    """
    out = []
    for node in _walk(data):
        items = node.get("instructions")
        if isinstance(items, list) and items and all(isinstance(item, dict) for item in items):
            out.extend(items)
    return out


def _unwrap(result):
    """A post's own record out of X's wrappers, or None for a deleted, withheld or unavailable one."""
    if not isinstance(result, dict):
        return None
    kind = result.get("__typename")
    if kind == "TweetWithVisibilityResults":
        result = result.get("tweet") or {}
        kind = "Tweet"
    if kind not in (None, "Tweet"):
        return None
    if result.get("rest_id") and isinstance(result.get("legacy"), dict):
        return result
    return None


def _timeline_item(entry_id, item, pinned):
    kind = item.get("itemType") or item.get("__typename") or ""
    if kind == "TimelineTimelineCursor" or item.get("cursorType"):
        return {"cursor": item.get("cursorType") or "", "entryId": entry_id}
    if kind != "TimelineTweet":
        return None
    tweet = _unwrap((item.get("tweet_results") or {}).get("result"))
    social = item.get("socialContext") or {}
    return {
        "entryId": entry_id,
        "tweet": tweet,
        "pinned": pinned or social.get("contextType") == "Pin",
        "promoted": bool(item.get("promotedMetadata")) or entry_id.startswith("promoted"),
    }


def _timeline(data):
    """Every item in one timeline answer, in page order: posts (or gone ones) and the cursors between them."""
    out = []
    for instruction in _instructions(data):
        kind = instruction.get("type") or instruction.get("__typename") or ""
        if kind in ("TimelinePinEntry", "TimelineReplaceEntry"):
            entries = [instruction.get("entry") or {}]
        elif kind == "TimelineAddEntries":
            entries = instruction.get("entries") or []
        elif kind == "TimelineAddToModule":
            entries = [{"entryId": instruction.get("moduleEntryId") or "", "content": {"items": instruction.get("moduleItems") or []}}]
        else:
            continue
        pinned = kind == "TimelinePinEntry"
        for entry in entries:
            if not isinstance(entry, dict):
                continue
            entry_id = entry.get("entryId") or ""
            content = entry.get("content") or {}
            contents = []
            if isinstance(content.get("itemContent"), dict):
                contents.append((entry_id, content["itemContent"]))
            elif content.get("cursorType"):
                contents.append((entry_id, content))
            # A module is a conversation or a thread: several posts in one entry.
            for item in content.get("items") or []:
                if isinstance(item, dict):
                    contents.append((item.get("entryId") or entry_id, (item.get("item") or {}).get("itemContent") or {}))
            for item_id, item in contents:
                read = _timeline_item(item_id, item, pinned)
                if read:
                    out.append(read)
    return out


def _posts_in(answers):
    """Every post in these answers once, in the order the page drew them, with how it was drawn."""
    seen = set()
    out = []
    for answer in answers:
        for item in _timeline(answer.get("data")):
            tweet = item.get("tweet")
            if not tweet:
                continue
            post_id = str(tweet.get("rest_id"))
            if post_id in seen:
                continue
            seen.add(post_id)
            out.append(item)
    return out


def _find_tweet(answers, post_id):
    """A post anywhere in these answers, for an answer that is not a timeline (`TweetResultByRestId`)."""
    for answer in answers:
        for node in _walk(answer.get("data")):
            if str(node.get("rest_id") or "") == post_id:
                tweet = _unwrap(node)
                if tweet:
                    return tweet
    return None


def _gone_in(answers, post_id):
    """True when X's answer says the post is deleted, withheld, protected or never was."""
    for answer in answers:
        data = answer.get("data") or {}
        # A post's page lists it as the entry "tweet-<id>", with a tombstone
        # in place of the post when it is gone.
        for item in _timeline(data):
            if "cursor" not in item and item.get("tweet") is None and item.get("entryId", "").endswith(post_id):
                return True
        for error in data.get("errors") or []:
            if not isinstance(error, dict):
                continue
            message = str(error.get("message") or "").lower()
            if error.get("code") == 144 or "no status found" in message or "_missing" in message:
                return True
        # `TweetResultByRestId` answers about one post only, so a tombstone in it is that post.
        if answer.get("name") == "TweetResultByRestId":
            result = ((data.get("data") or {}).get("tweetResult") or {}).get("result")
            if isinstance(result, dict) and result.get("__typename") in ("TweetTombstone", "TweetUnavailable"):
                return True
    return False


def _user_fields(result):
    """An account's handle, name, followers and joining day, from X's user record."""
    user = result if isinstance(result, dict) else {}
    legacy = user.get("legacy") or {}
    core = user.get("core") or {}
    created = core.get("created_at") or legacy.get("created_at")
    return {
        "id": str(user.get("rest_id") or ""),
        "handle": core.get("screen_name") or legacy.get("screen_name") or "",
        "name": core.get("name") or legacy.get("name") or "",
        "followers": _count(legacy.get("followers_count")),
        "joinedSeconds": _x_time(created),
        "kind": user.get("__typename") or "",
    }


def _user_of(tweet):
    return _user_fields(((tweet.get("core") or {}).get("user_results") or {}).get("result"))


def _tweet_text(tweet):
    """A post's words as a person reads them: links whole, picture links and reply @names left out."""
    legacy = tweet.get("legacy") or {}
    note = (((tweet.get("note_tweet") or {}).get("note_tweet_results") or {}).get("result")) or {}
    text = note.get("text") or legacy.get("full_text") or ""
    entities = (note.get("entity_set") if note.get("text") else None) or legacy.get("entities") or {}
    for link in entities.get("urls") or []:
        if link.get("url") and link.get("expanded_url"):
            text = text.replace(link["url"], link["expanded_url"])
    for media in (legacy.get("entities") or {}).get("media") or []:
        if media.get("url"):
            text = text.replace(media["url"], "")
    text = html.unescape(text)
    if legacy.get("in_reply_to_status_id_str"):
        text = re.sub(r"^\s*(?:@\w{1,15}\s+)+", "", text)
    return text.strip()[:POST_TEXT_CHARS]


def _first_link(tweet):
    note = (((tweet.get("note_tweet") or {}).get("note_tweet_results") or {}).get("result")) or {}
    entities = (note.get("entity_set") if note.get("text") else None) or (tweet.get("legacy") or {}).get("entities") or {}
    for link in entities.get("urls") or []:
        if link.get("expanded_url"):
            return link["expanded_url"]
    return ""


def _replies_open(tweet):
    """False when the poster limited who may reply.

    X marks it three ways: a "Reply" in `limitedActionResults` for the account
    looking, `limited_actions: "limited_replies"`, or a `conversation_control`
    with a policy (followers only, people mentioned only).
    """
    limited = (tweet.get("limitedActionResults") or {}).get("limited_actions") or []
    if any(isinstance(item, dict) and item.get("action") == "Reply" for item in limited):
        return False
    legacy = tweet.get("legacy") or {}
    if legacy.get("limited_actions") == "limited_replies":
        return False
    control = legacy.get("conversation_control") or tweet.get("conversation_control")
    if isinstance(control, dict) and control.get("policy"):
        return False
    return True


def _facts(item):
    """What a timeline says about how a post was drawn, beside the post itself."""
    tweet = item.get("tweet") or {}
    legacy = tweet.get("legacy") or {}
    return {
        "pinned": bool(item.get("pinned")),
        "promoted": bool(item.get("promoted")),
        "repost": bool(legacy.get("retweeted_status_result") or tweet.get("retweeted_status_result")),
        "replyTo": str(legacy.get("in_reply_to_status_id_str") or ""),
        "quoted": str(legacy.get("quoted_status_id_str") or ""),
    }


def _post_from_tweet(tweet):
    """One post in the shape the app stores (`postShape` in calls.ts)."""
    legacy = tweet.get("legacy") or {}
    user = _user_of(tweet)
    author_id = user["id"] or str(legacy.get("user_id_str") or "")
    post_id = str(tweet.get("rest_id") or legacy.get("id_str") or "")
    reply_to_user = str(legacy.get("in_reply_to_user_id_str") or "")
    return {
        "postId": post_id,
        "url": _status_url(post_id, user["handle"]),
        "text": _tweet_text(tweet),
        "authorId": author_id,
        "authorHandle": user["handle"],
        "authorName": user["name"],
        "authorFollowers": user["followers"],
        "postedSeconds": _x_time(legacy.get("created_at")),
        "views": _count((tweet.get("views") or {}).get("count")),
        "likes": _count(legacy.get("favorite_count")) or 0,
        "replies": _count(legacy.get("reply_count")) or 0,
        "reposts": _count(legacy.get("retweet_count")) or 0,
        "repliesOpen": _replies_open(tweet),
        # A thread's next piece answers the poster's own post; that is not a reply.
        "isReply": bool(legacy.get("in_reply_to_status_id_str")) and reply_to_user != author_id,
        "link": _first_link(tweet),
    }


def _incoming(post):
    """A post that answers or names one of ours, in `incomingShape`."""
    return {
        "id": post["postId"],
        "handle": post["authorHandle"],
        "name": post["authorName"],
        "text": post["text"],
        "likes": post["likes"],
        "postedSeconds": post["postedSeconds"],
    }


def _poll_votes(tweet):
    """A poll's votes per choice, off the card X draws it with, or None for anything but a poll."""
    card = (tweet.get("card") or {}).get("legacy") or {}
    if not str(card.get("name") or "").startswith("poll"):
        return None
    values = {}
    for item in card.get("binding_values") or []:
        if isinstance(item, dict):
            values[item.get("key")] = (item.get("value") or {}).get("string_value")
    votes = []
    for choice in range(1, 5):
        count = values.get("choice%d_count" % choice)
        if count is None and values.get("choice%d_label" % choice) is None:
            break
        votes.append(_count(count) or 0)
    return votes or None


def _conversation(answers, post_id):
    """A post's page in X's data: the post, the replies straight under it, and whether it is gone."""
    items = _posts_in(answers)
    focal = next((item["tweet"] for item in items if str(item["tweet"].get("rest_id")) == post_id), None)
    if focal is None:
        focal = _find_tweet(answers, post_id)
    direct = [item for item in items if _facts(item)["replyTo"] == post_id]
    return focal, direct, focal is None and _gone_in(answers, post_id)


def _recent(seconds, since):
    """True when a post's time is known and no earlier than `since`. Any time counts when `since` is None."""
    return since is None or (seconds is not None and seconds >= since)


def _mine_in(items, handle, text, parent_id="", quoted_id="", since=None):
    """The id of a post by `handle` with these words, under `parent_id` or quoting `quoted_id`.

    How a second try finds out the first one went out, and how a write is
    found when X's answer to it was missed. With `since`, only a post that
    went up then or later counts. None when it is not there.
    """
    wanted = (handle or "").lower()
    for item in items:
        tweet = item.get("tweet") or {}
        facts = _facts(item)
        if _user_of(tweet)["handle"].lower() != wanted or facts["repost"]:
            continue
        if not _recent(_x_time((tweet.get("legacy") or {}).get("created_at")), since):
            continue
        if parent_id and facts["replyTo"] != parent_id:
            continue
        if facts["quoted"] != quoted_id:
            # A quote is never a plain post with the same words, nor the other way round.
            continue
        if not parent_id and not quoted_id and facts["replyTo"]:
            continue
        if _same_words(text, _tweet_text(tweet)):
            return str(tweet.get("rest_id"))
    return None


def _created_id(data):
    """(new post id, X's refusal) out of a CreateTweet answer. Both empty when it says neither."""
    if not isinstance(data, dict):
        return "", ""
    for node in _walk(data.get("data")):
        result = (node.get("tweet_results") or {}).get("result") if isinstance(node.get("tweet_results"), dict) else None
        if isinstance(result, dict) and result.get("rest_id"):
            return str(result["rest_id"]), ""
    for error in data.get("errors") or []:
        if isinstance(error, dict) and error.get("message"):
            return "", str(error["message"])[:300]
    return "", ""


def _user_answer(answers, handle):
    """An account as `UserByScreenName` answered about it, or None when no answer said.

    A failed answer (a status of 400 or more, or X's errors with no account
    in it, as a rate limit sends) says nothing about the account, so it is
    passed over rather than taken for an account that does not exist.
    """
    for answer in answers:
        if answer.get("name") != "UserByScreenName":
            continue
        body = answer.get("data") or {}
        data = body.get("data") or {}
        if answer.get("status", 200) >= 400 or (body.get("errors") and not data.get("user")):
            continue
        result = (data.get("user") or {}).get("result")
        if not isinstance(result, dict) or result.get("__typename") == "UserUnavailable":
            # No such account, or one X suspended: either way nobody to reply to.
            return {"handle": handle, "exists": False, "name": "", "followers": None, "joinedSeconds": None}
        user = _user_fields(result)
        if user["handle"] and user["handle"].lower() != handle.lower():
            continue
        return {"handle": user["handle"] or handle, "exists": True, "name": user["name"], "followers": user["followers"], "joinedSeconds": user["joinedSeconds"]}
    return None


def _community_from(answers, community_id):
    """A community's name, about words, rules, members and the account's place in it, from X's data."""
    for answer in answers:
        for node in _walk(answer.get("data")):
            if node.get("__typename") != "Community" or str(node.get("rest_id") or node.get("id_str") or "") != community_id:
                continue
            rules = []
            for index, rule in enumerate(node.get("rules") or []):
                if not isinstance(rule, dict):
                    continue
                line = "%d. %s" % (index + 1, (rule.get("name") or "").strip())
                if rule.get("description"):
                    line += ": " + rule["description"].strip()
                rules.append(line)
            return {
                "name": node.get("name") or "",
                "description": node.get("description") or "",
                "rules": "\n".join(rules)[:COMMUNITY_TEXT_CHARS],
                "members": _count(node.get("member_count")),
                "role": node.get("role") or "",
            }
    return None


def _trends_in(answers):
    """Every trend in these answers, once each, with the words X put above it ("Trending in ...")."""
    out = []
    names = set()
    for answer in answers:
        for node in _walk(answer.get("data")):
            if node.get("itemType") == "TimelineTrend" or node.get("__typename") == "TimelineTrend":
                meta = node.get("trend_metadata") or {}
                name, posts, context = node.get("name"), meta.get("meta_description"), meta.get("domain_context")
            elif isinstance(node.get("trend"), dict) and node["trend"].get("name"):
                meta = node["trend"].get("trendMetadata") or {}
                name, posts, context = node["trend"]["name"], meta.get("metaDescription"), meta.get("domainContext")
            else:
                continue
            if not isinstance(name, str) or not name.strip() or name.strip().lower() in names:
                continue
            names.add(name.strip().lower())
            out.append({"name": name.strip(), "posts": _posts_words(posts or ""), "context": (context or "").strip()})
    return out


def _trend_from_lines(lines):
    """One drawn trend's lines ("1", "\u00b7", "Trending in United Kingdom", "#Topic", "12.3K posts") as a trend."""
    name, posts, context = "", None, ""
    for line in [line.strip() for line in lines if line and line.strip()]:
        lowered = line.lower()
        if re.fullmatch(r"\d+|\u00b7", line):
            continue
        if posts is None and _posts_words(line) is not None:
            posts = _posts_words(line)
        elif not context and "trending" in lowered and not lowered.startswith("trending with"):
            context = line
        elif not context and " \u00b7 " in line:
            context = line
        elif not name and not lowered.startswith("trending with"):
            name = line
    return {"name": name, "posts": posts, "context": context} if name else None


def _place(trends):
    """Where X says the trends are for, as it words it, or ""."""
    places = {}
    for trend in trends:
        context = trend.get("context") or ""
        found = re.search(r"Trending in [^\u00b7]+", context)
        if found:
            place = found.group(0).strip()
            places[place] = places.get(place, 0) + 1
    return max(places, key=places.get) if places else ""


def _twid_user(value):
    """The signed-in account's id out of X's `twid` cookie ("u%3D1234"), or ""."""
    found = re.search(r"u=(\d+)", urllib.parse.unquote(value or ""))
    return found.group(1) if found else ""


def _messages_from_data(answers, own_id):
    """Direct messages from other people, newest first, out of X's message answers.

    Group conversations are left out: Promo answers one person at a time.
    """
    users = {}
    groups = set()
    found = {}
    for answer in answers:
        for node in _walk(answer.get("data")):
            if isinstance(node.get("users"), dict):
                for user_id, user in node["users"].items():
                    if isinstance(user, dict) and user.get("screen_name"):
                        users[str(user_id)] = user
            if isinstance(node.get("conversations"), dict):
                for conversation_id, conversation in node["conversations"].items():
                    if isinstance(conversation, dict) and conversation.get("type") == "GROUP_DM":
                        groups.add(conversation_id)
            message = node.get("message")
            if isinstance(message, dict) and isinstance(message.get("message_data"), dict):
                found[str(message.get("id") or message["message_data"].get("id") or "")] = message
    out = []
    for message_id, message in found.items():
        data = message["message_data"]
        conversation_id = str(message.get("conversation_id") or "")
        sender = str(data.get("sender_id") or "")
        if not message_id or not conversation_id or conversation_id in groups or not sender or sender == own_id:
            continue
        text = data.get("text") or ""
        for link in (data.get("entities") or {}).get("urls") or []:
            if link.get("url") and link.get("expanded_url"):
                text = text.replace(link["url"], link["expanded_url"])
        moment = _count(data.get("time") or message.get("time"))
        user = users.get(sender) or {}
        out.append({
            "id": message_id,
            "conversationId": conversation_id,
            "handle": user.get("screen_name") or "",
            "name": user.get("name") or "",
            "text": html.unescape(text).strip()[:POST_TEXT_CHARS],
            "sentSeconds": moment / 1000 if moment else None,
        })
    out.sort(key=lambda item: item["sentSeconds"] or 0, reverse=True)
    return out[:INBOX_LIMIT]


def _messages_of(answers, conversation_id):
    """Every message X's answers hold in this one conversation, as X sends them. Nothing without an id."""
    out = []
    if not conversation_id:
        return out
    for answer in answers:
        for node in _walk(answer.get("data")):
            message = node.get("message")
            if isinstance(message, dict) and isinstance(message.get("message_data"), dict) and str(message.get("conversation_id") or "") == conversation_id:
                out.append(message)
    return out


def _own_messages(answers, own_id, conversation_id):
    """The account's own messages in this conversation only, newest first: (id, text, milliseconds).

    The inbox's data carries the newest messages of every conversation, so a
    message is kept only when X files it under `conversation_id`.
    """
    out = []
    seen = set()
    for message in _messages_of(answers, conversation_id):
        data = message["message_data"]
        message_id = str(message.get("id") or data.get("id") or "")
        if message_id in seen or str(data.get("sender_id") or "") != own_id:
            continue
        seen.add(message_id)
        out.append((message_id, data.get("text") or "", _count(data.get("time") or message.get("time")) or 0))
    out.sort(key=lambda item: item[2], reverse=True)
    return out


CONVERSATION_PATH = re.compile(r"/(?:messages|dm/conversation)/(\d{1,25}(?:-\d{1,25})?)(?:\.json)?(?:[/?#]|$)")


def _conversation_in(address):
    """The conversation id in a page's address (`/messages/<id>`) or in X's data address for it, or ""."""
    found = CONVERSATION_PATH.search(urllib.parse.urlparse(address or "").path + "/")
    return found.group(1) if found else ""


def _open_conversation(address, answers):
    """Which conversation is open: from the page's address, else from the one X loaded with `dm/conversation`, or ""."""
    found = _conversation_in(address)
    if found:
        return found
    loaded = {_conversation_in(answer.get("url")) for answer in answers if answer.get("name") == "dm/conversation"}
    loaded.discard("")
    return loaded.pop() if len(loaded) == 1 else ""


def _said_lately(mine, text):
    """True when the newest of the account's own messages in the conversation (from `_own_messages`) is these words, sent in the last hour."""
    if not mine:
        return False
    _message_id, words, millis = mine[0]
    return millis >= (time.time() - LOOK_BACK_SECONDS) * 1000 and _same_words(text, words)


class _Graph(object):
    """X's own data, as the page receives it.

    Listens to every answer the page gets while it is in a `with`, keeps the
    ones named, and reads their bodies on `drain()`. The bodies are read on
    this thread after each wait, not inside the listener, and promptly,
    because a browser may let go of a body once the page moves on.
    """

    def __init__(self, page, names=None):
        self.page = page
        self.names = set(names) if names else None
        self.answers = []
        self.limited = False
        self._waiting = []

    def __enter__(self):
        self.page.on("response", self._heard)
        return self

    def __exit__(self, *_exc):
        try:
            self.page.remove_listener("response", self._heard)
        except Exception:  # noqa: BLE001 - the page may be gone already
            pass
        return False

    def _heard(self, response):
        try:
            name = _operation(response.url)
        except Exception:  # noqa: BLE001 - an answer we cannot read is not ours
            return
        if name and (self.names is None or name in self.names):
            self._waiting.append((name, response))

    def drain(self):
        waiting, self._waiting = self._waiting, []
        fresh = []
        for name, response in waiting:
            try:
                status = response.status
            except Exception:  # noqa: BLE001
                status = 0
            try:
                data = response.json()
            except Exception:  # noqa: BLE001 - an empty or cut-off body
                data = None
            if _rate_limited(status, data):
                self.limited = True
            if isinstance(data, dict):
                fresh.append({"name": name, "data": data, "status": status, "url": getattr(response, "url", "") or ""})
        self.answers.extend(fresh)
        return fresh

    def named(self, *names):
        return [answer for answer in self.answers if answer["name"] in names]

    def post_ids(self):
        return {str(item["tweet"].get("rest_id")) for item in _posts_in(self.answers)}


# --- Reading the page itself ------------------------------------------------

SIGNS_SCRIPT = """
() => {
  /* x:signs */
  const body = document.body
  let text = (body && body.innerText) || ""
  // Posts, trends, bios, names, profile headers, empty-page notes and
  // messages are other people's words, never the account's own screen: a
  // post saying "your account is suspended" is not one.
  const others = ['article', '[data-testid="trend"]', '[data-testid="tweetText"]', '[data-testid="UserCell"]', '[data-testid="UserDescription"]',
    '[data-testid="UserName"]', '[data-testid="UserProfileHeader_Items"]', '[data-testid="emptyState"]', '[data-testid="messageEntry"]', '[data-testid="conversation"]']
  // A community's About column is its owners' words: the side column on its
  // page, and the whole main column on its About page.
  if (location.pathname.startsWith("/i/communities/")) {
    others.push('[data-testid="sidebarColumn"]')
    if (location.pathname.endsWith("/about")) others.push('[data-testid="primaryColumn"]')
  }
  for (const node of document.querySelectorAll(others.join(", "))) {
    const words = node.innerText || ""
    if (words.length > 2) text = text.split(words).join(" ")
  }
  const profile = document.querySelector('a[data-testid="AppTabBar_Profile_Link"]')
  let initial = {}
  try {
    const state = window.__INITIAL_STATE__ || {}
    const id = state.session && state.session.user_id
    const users = (state.entities && state.entities.users && state.entities.users.entities) || {}
    const me = id ? users[id] || {} : {}
    initial = { id: id || "", handle: me.screen_name || "", followers: me.followers_count, created: me.created_at || "" }
  } catch (error) {}
  return {
    url: location.href,
    host: location.hostname,
    path: location.pathname,
    text: text.slice(0, 5000),
    profileHref: profile ? profile.getAttribute("href") || "" : "",
    login: Boolean(document.querySelector('[data-testid="loginButton"], [data-testid="login"], a[href="/login"], a[href="/i/flow/login"], input[autocomplete="username"]')),
    codeField: Boolean(document.querySelector('input[data-testid="ocfEnterTextTextInput"], input[autocomplete="one-time-code"], input[inputmode="numeric"]')),
    arkose: Boolean(document.querySelector('iframe[src*="arkoselabs"], #arkose_iframe')),
    initial,
  }
}
"""

READY_SCRIPT = """
() => {
  /* x:ready */
  const text = ((document.body && document.body.innerText) || "").toLowerCase()
  return {
    articles: document.querySelectorAll('article[data-testid="tweet"]').length,
    cells: document.querySelectorAll('[data-testid="trend"], [data-testid="UserName"], [data-testid="conversation"]').length,
    empty: Boolean(document.querySelector('[data-testid="emptyState"]')),
    error: text.includes("something went wrong") || text.includes("rate limit exceeded") || text.includes("this page doesn") || text.includes("post is unavailable") || text.includes("account doesn"),
    login: Boolean(document.querySelector('[data-testid="loginButton"], input[autocomplete="username"], a[href="/login"]')),
  }
}
"""

CARDS_SCRIPT = """
() => {
  /* x:cards */
  const out = []
  for (const article of document.querySelectorAll('article[data-testid="tweet"]')) {
    const time = article.querySelector('a[href*="/status/"] time')
    const link = time ? time.closest("a") : null
    const names = article.querySelector('[data-testid="User-Name"]')
    const words = article.querySelector('[data-testid="tweetText"]')
    const group = article.querySelector('[role="group"][aria-label]')
    const social = article.querySelector('[data-testid="socialContext"]')
    const first = words ? words.querySelector('a[href^="http"]') : null
    out.push({
      href: link ? link.getAttribute("href") || "" : "",
      time: time ? time.getAttribute("datetime") || "" : "",
      names: names ? names.innerText : "",
      text: words ? words.innerText : "",
      counts: group ? group.getAttribute("aria-label") || "" : "",
      social: social ? social.innerText : "",
      link: first ? first.textContent || "" : "",
      replying: (article.innerText || "").includes("Replying to"),
    })
  }
  return out
}
"""

PROFILE_SCRIPT = """
() => {
  /* x:profile */
  const name = document.querySelector('[data-testid="UserName"]')
  const followers = document.querySelector('a[href$="/verified_followers"], a[href$="/followers"]')
  const joined = document.querySelector('[data-testid="UserJoinDate"]')
  const column = document.querySelector('[data-testid="primaryColumn"]') || document.body
  return {
    name: name ? name.innerText : "",
    followers: followers ? followers.innerText : "",
    joined: joined ? joined.innerText : "",
    text: ((column && column.innerText) || "").slice(0, 2000),
  }
}
"""

TRENDS_SCRIPT = """
() => {
  /* x:trends */
  return Array.from(document.querySelectorAll('[data-testid="trend"]')).map((cell) => (cell.innerText || "").split("\\n"))
}
"""

COMMUNITY_SCRIPT = """
() => {
  /* x:community */
  const column = document.querySelector('[data-testid="primaryColumn"]') || document.body
  const heading = column ? column.querySelector("h2") : null
  return { title: document.title || "", heading: heading ? heading.innerText : "", text: ((column && column.innerText) || "").slice(0, 6000) }
}
"""

FOLLOW_SCRIPT = """
() => {
  /* x:follow */
  const column = document.querySelector('[data-testid="primaryColumn"]') || document
  // The profile's own button sits in its header, before any "Who to follow".
  const header = column.querySelector('[data-testid="placementTracking"]') || column
  const button = header.querySelector('[data-testid$="-unfollow"], [data-testid$="-cancel"], [data-testid$="-follow"]')
  return button ? button.getAttribute("data-testid") || "" : ""
}
"""


def _signs(page):
    """What the page on screen says about the account. Never moves the page."""
    try:
        raw = page.evaluate(SIGNS_SCRIPT) or {}
    except Exception:  # noqa: BLE001 - a page moving under us reads as "not looked at"
        raw = {}
    return _judge(raw)


def _settle(page, graph, names=None, timeout_ms=SETTLE_MS):
    """Waits for the page's data (one of `names`, or any) or for the page to say it has none."""
    deadline = time.monotonic() + timeout_ms / 1000
    while True:
        graph.drain()
        heard = [answer for answer in graph.answers if not names or answer["name"] in names]
        if heard or graph.limited:
            break
        try:
            ready = page.evaluate(READY_SCRIPT) or {}
        except Exception:  # noqa: BLE001 - the page is still moving
            ready = {}
        if any(ready.get(key) for key in ("articles", "cells", "empty", "error", "login")):
            break
        if time.monotonic() >= deadline:
            break
        page.wait_for_timeout(500)
    # The page draws a moment after its data arrives.
    page.wait_for_timeout(random.randint(600, 1200))
    graph.drain()


def _usable(page, step):
    """The page's signs, after checking the account is signed in and nothing but a rate limit is in the way."""
    signs = _signs(page)
    if not signs["onX"]:
        raise CommandError("%s: the page is not on X" % step)
    if signs["banScreen"]:
        raise CommandError("%s: X shows this on the account: %s" % (step, signs["banScreen"]))
    if signs["blocked"] and not signs["limited"]:
        raise CommandError("%s: %s" % (step, signs["reason"]))
    if not signs["handle"] and not signs["limited"]:
        raise CommandError("%s: this browser is not signed in to X, or X's page did not finish drawing" % step)
    return signs


def _cards(page):
    try:
        return page.evaluate(CARDS_SCRIPT) or []
    except Exception:  # noqa: BLE001 - a page moving under us
        return []


def _card_link(text):
    text = (text or "").replace("\u2026", "").strip()
    if not text:
        return ""
    return text if text.startswith("http") else "https://" + text


def _post_from_card(card):
    """One drawn post in the shape the app stores, with what the drawing says about it. None without an address."""
    found = _post_from_path(card.get("href") or "")
    if not found:
        return None, None
    handle, post_id = found
    lines = [line.strip() for line in (card.get("names") or "").splitlines() if line.strip()]
    name = next((line for line in lines if not line.startswith("@") and line != "\u00b7"), "")
    counts = _counts_from_label(card.get("counts") or "")
    social = _plain(card.get("social"))
    post = {
        "postId": post_id,
        "url": _status_url(post_id, handle),
        "text": (card.get("text") or "").strip()[:POST_TEXT_CHARS],
        "authorId": "",
        "authorHandle": handle,
        "authorName": name,
        "authorFollowers": None,
        "postedSeconds": _iso_time(card.get("time") or ""),
        "views": counts.get("views"),
        "likes": counts.get("likes") or 0,
        "replies": counts.get("replies") or 0,
        "reposts": counts.get("reposts") or 0,
        # The drawing does not say who may reply; X's data does.
        "repliesOpen": True,
        "isReply": bool(card.get("replying")),
        "link": _card_link(card.get("link")),
    }
    facts = {"pinned": "pinned" in social, "promoted": False, "repost": "reposted" in social, "replyTo": "", "quoted": ""}
    return post, facts


def _gather(page, graph, keep):
    """The posts on the page so far that `keep` wants, in page order, and every post id seen.

    X's data when it came; the drawn posts when it did not.
    """
    items = _posts_in(graph.answers)
    kept = []
    seen = set()
    if items:
        for item in items:
            post = _post_from_tweet(item["tweet"])
            seen.add(post["postId"])
            if keep(post, _facts(item)):
                kept.append(post)
        return kept, seen
    ids = set()
    for card in _cards(page):
        post, facts = _post_from_card(card)
        if post is None or post["postId"] in ids:
            continue
        ids.add(post["postId"])
        seen.add(post["postId"])
        if keep(post, facts):
            kept.append(post)
    return kept, seen


def _scroll(page, sizes=None):
    """A few ordinary scrolls down, as a person reading a timeline makes them."""
    for _ in range(random.randint(2, 4)):
        moved = human.scroll_once(page)
        if sizes is not None:
            sizes.append(abs(moved))
        page.wait_for_timeout(random.randint(500, 1400))


def _collect(page, graph, want, keep, deadline):
    """Scrolls a timeline until `want` posts are kept, nothing new comes, X limits it, or time is up.

    Returns the kept posts (never more than `want`) and every post id the
    account was shown on the way.
    """
    stale = 0
    while True:
        graph.drain()
        kept, seen = _gather(page, graph, keep)
        if len(kept) >= want or graph.limited or stale >= STALE_SCROLLS or time.monotonic() >= deadline:
            return kept[:want], seen
        before = len(seen)
        _scroll(page)
        graph.drain()
        _, after = _gather(page, graph, keep)
        stale = stale + 1 if len(after) <= before else 0


def _read_start(page, graph, url, names, step):
    """Opens a page for a read, waits for its data, and checks the search account can read it."""
    try:
        _goto(page, url)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: X's page would not open: %s" % (step, _short(error)))
    _settle(page, graph, names)
    return _usable(page, step)


# --- Who is signed in -----------------------------------------------------


def _state_from(signs):
    return {
        "checked": bool(signs.get("checked")),
        "handle": signs.get("handle"),
        "blocked": bool(signs.get("blocked")),
        "reason": signs.get("reason") or "",
        "banScreen": signs.get("banScreen"),
        "joinedSeconds": signs.get("joinedSeconds"),
        "followers": signs.get("followers"),
    }


NOT_LOOKED = {"checked": False, "handle": None, "blocked": False, "reason": "", "banScreen": None, "joinedSeconds": None, "followers": None}


def x_state_quick(page, args=None):
    """Who is signed in, and whether a lock, check or limit is on screen, without moving the page.

    Asked after every X job, so it never navigates: a person may be halfway
    through signing in in the same window. It waits a few seconds for a page
    still drawing. `checked` is False when the page is not on X, or said
    nothing either way, so a look at another site is never written down as
    "signed out".
    """
    if not _on_x(page):
        return dict(NOT_LOOKED)
    deadline = time.monotonic() + 4
    while True:
        signs = _signs(page)
        if signs["checked"] or time.monotonic() >= deadline:
            return _state_from(signs)
        page.wait_for_timeout(500)


def _read_profile(page, handle, seen=None):
    """An account's page read for whether it exists, its name, followers and joining day.

    From `UserByScreenName`, or the drawn header when that never came. None
    when neither could say. The posts X sends with the page are added to `seen`.
    """
    with _Graph(page, ("UserByScreenName", "UserTweets")) as graph:
        _goto(page, "https://x.com/%s" % handle)
        _settle(page, graph, ("UserByScreenName",))
        user = _user_answer(graph.answers, handle)
        if user is None:
            try:
                raw = page.evaluate(PROFILE_SCRIPT) or {}
            except Exception:  # noqa: BLE001
                raw = {}
            user = _profile_from_dom(raw, handle)
        if seen is not None:
            seen.update(graph.post_ids())
        return user, graph.limited


def _profile_from_dom(raw, handle):
    text = _plain(raw.get("text"))
    if "this account doesn't exist" in text or "account suspended" in text:
        return {"handle": handle, "exists": False, "name": "", "followers": None, "joinedSeconds": None}
    names = [line.strip() for line in (raw.get("name") or "").splitlines() if line.strip()]
    if not names:
        return None
    found = re.match(r"\s*(\d[\d.,]*\s*[KkMmBb]?)", raw.get("followers") or "")
    return {
        "handle": handle,
        "exists": True,
        "name": names[0],
        "followers": _number(found.group(1)) if found else None,
        "joinedSeconds": _joined_words(raw.get("joined") or ""),
    }


def x_state(page, args=None):
    """The full look: goes to X's home first, so it runs only for a check a person asked for.

    When the page itself does not carry the account's followers and joining
    day, the account's own page is opened for them.
    """
    try:
        _goto(page, HOME)
        page.wait_for_timeout(random.randint(2000, 3500))
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        # Not looked at, so never written down as signed out.
        return dict(NOT_LOOKED, reason=_short(error))
    state = x_state_quick(page)
    if state["handle"] and not state["blocked"] and (state["followers"] is None or state["joinedSeconds"] is None):
        try:
            user, _limited = _read_profile(page, state["handle"])
            if user and user.get("exists"):
                if state["followers"] is None:
                    state["followers"] = user["followers"]
                if state["joinedSeconds"] is None:
                    state["joinedSeconds"] = user["joinedSeconds"]
        except Exception as error:  # noqa: BLE001 - the numbers are extra
            print("x state: the account's page would not read: %s" % _short(error), flush=True)
    return state


def x_enter_code(page, args):
    """Types X's six-digit sign-in code into the page asking for it, presses Next, and says who is signed in.

    Nothing else is typed. The code never appears in an error, because it is
    good for a few seconds more.
    """
    code = (args.get("code") or "").strip() if isinstance(args.get("code"), str) else ""
    if not re.fullmatch(r"\d{6}", code):
        raise CommandError("enter code: the code must be six digits")
    if not _on_x(page):
        raise CommandError("enter code: the page is not on X")
    field = _first_visible(page, ["input[data-testid='ocfEnterTextTextInput']", "input[autocomplete='one-time-code']", "input[inputmode='numeric']", "input[name='text']"], 8_000)
    # The same box asks for a username after unusual activity, so the page's
    # words must be asking for a code too.
    if field is None or _signs(page)["reason"] != CODE_REASON:
        raise CommandError("enter code: X is not asking for a code on this page")
    human.click(field)
    human.type_text(field, code)
    human.pause_before_submit(page)
    button = _first_visible(page, ["[data-testid='ocfEnterTextNextButton']", "button:has-text('Next')", "button:has-text('Verify')", "button:has-text('Log in')"], 4_000)
    if button is None:
        page.keyboard.press("Enter")
    else:
        human.click(button)
    page.wait_for_timeout(random.randint(4000, 6000))
    return x_state_quick(page)


# --- Reads, through a search account --------------------------------------


def _read_cost(seen, graph_limited, signs):
    return {"viewed": len(seen), "limited": bool(graph_limited or (signs or {}).get("limited"))}


def x_search(page, args):
    """The newest posts for one keyword, on X's Latest tab or an account's own page.

    "search" words and a "hashtag" go to X's search on the Latest tab; an
    "account" is that account's own page, its newest posts of its own (a
    pinned post, a repost and its replies to others left out). Posts come back
    in page order, read from `SearchTimeline` or `UserTweets`. Scrolling stops
    once `max` posts are kept; adverts are never kept.
    """
    kind = (args.get("kind") or "").strip()
    value = (args.get("value") or "").strip() if isinstance(args.get("value"), str) else ""
    try:
        want = max(1, min(SEARCH_LIMIT, int(args.get("max") or 0)))
    except (TypeError, ValueError):
        raise CommandError("search: max must be a number") from None
    if not value:
        raise CommandError("search: nothing to search for")

    if kind == "search":
        url = "https://x.com/search?q=%s&src=typed_query&f=live" % urllib.parse.quote(value[:200])
        names = ("SearchTimeline",)
        keep = lambda post, facts: not facts["promoted"]  # noqa: E731
    elif kind == "hashtag":
        tag = value.lstrip("#")
        if not re.fullmatch(r"\w{1,100}", tag):
            raise CommandError("search: that is not a hashtag X uses")
        url = "https://x.com/search?q=%s&src=hashtag_click&f=live" % urllib.parse.quote("#" + tag)
        names = ("SearchTimeline",)
        keep = lambda post, facts: not facts["promoted"]  # noqa: E731
    elif kind == "account":
        handle = _handle_arg(value, "search")
        url = "https://x.com/%s" % handle
        names = ("UserTweets",)

        def keep(post, facts):
            own = post["authorHandle"].lower() == handle.lower()
            return own and not (facts["pinned"] or facts["promoted"] or facts["repost"] or post["isReply"])
    else:
        raise CommandError("search: X has no keyword kind called %s" % kind)

    deadline = time.monotonic() + READ_BUDGET_SECONDS
    with _Graph(page, names) as graph:
        signs = _read_start(page, graph, url, names, "search")
        posts, seen = _collect(page, graph, want, keep, deadline)
        limited = graph.limited
    for position, post in enumerate(posts):
        post["position"] = position
    return dict({"posts": posts}, **_read_cost(seen, limited, signs))


def _read_detail(page, post_id, step, seen, deadline, more_replies=0):
    """One post's page in X's data, with up to `more_replies` scrolls for replies below the first screen."""
    with _Graph(page, DETAIL_OPS) as graph:
        signs = _read_start(page, graph, _status_url(post_id), DETAIL_OPS, step)
        focal, direct, gone = _conversation(graph.answers, post_id)
        for _ in range(more_replies):
            if focal is None or time.monotonic() >= deadline or graph.limited:
                break
            if len(direct) >= (_count((focal.get("legacy") or {}).get("reply_count")) or 0):
                break
            before = len(graph.post_ids())
            _scroll(page)
            graph.drain()
            focal, direct, gone = _conversation(graph.answers, post_id)
            if len(graph.post_ids()) <= before:
                break
        items = _posts_in(graph.answers)
        cards = [] if graph.answers else _cards(page)
        seen.update(graph.post_ids())
        limited = graph.limited
    if focal is None and not gone and cards:
        # X's data never came: the drawn page stands in. The posts drawn
        # above ours are the ones it answers, so only those below it are
        # replies. The numbers are the ones its action row says, each None
        # when the row leaves it out, never a guessed 0.
        drawn = [(card, _post_from_card(card)[0]) for card in cards]
        drawn = [(card, post) for card, post in drawn if post]
        seen.update(post["postId"] for _card_, post in drawn)
        at = next((index for index, (_card_, post) in enumerate(drawn) if post["postId"] == post_id), None)
        mine = drawn[at][1] if at is not None else None
        below = [post for _card_, post in drawn[at + 1:]] if at is not None else []
        counts = _counts_from_label(drawn[at][0].get("counts") or "") if at is not None else {}
        return {"post": mine, "tweet": None, "direct": below, "gone": False, "items": [], "signs": signs, "limited": limited, "counts": counts}
    if focal is None and not gone:
        gone = bool(signs.get("gonePage"))
    return {
        "post": _post_from_tweet(focal) if focal else None,
        "tweet": focal,
        "direct": [_post_from_tweet(item["tweet"]) for item in direct],
        "gone": gone,
        "items": items,
        "signs": signs,
        "limited": limited,
    }


def x_post(page, args):
    """One post read again, with its top replies (part 22), from `TweetDetail`.

    The top replies are those straight under the post, most liked first,
    leaving out the poster's own (a thread's next piece is not a reply).
    `missing` is true when X says the post is gone or its account protected.
    When `limited` is true the rest of the answer is not a reading.
    """
    post_id = _post_id(args.get("postId"), "post")
    seen = set()
    read = _read_detail(page, post_id, "post", seen, time.monotonic() + READ_BUDGET_SECONDS, more_replies=1)
    post = read["post"]
    replies = []
    if post:
        others = [item for item in read["direct"] if item["authorHandle"].lower() != post["authorHandle"].lower() and item["text"]]
        others.sort(key=lambda item: item["likes"], reverse=True)
        replies = [{"id": item["postId"], "handle": item["authorHandle"], "name": item["authorName"], "text": item["text"], "likes": item["likes"]} for item in others[:TOP_REPLIES]]
    if post is None and not read["gone"] and not read["limited"]:
        raise CommandError("post: X's page for that post did not load")
    return dict({"post": post, "missing": bool(read["gone"]) and post is None, "replies": replies}, **_read_cost(seen, read["limited"], read["signs"]))


def _ids_here(page, graph):
    ids = graph.post_ids()
    if ids or graph.answers:
        return ids
    return {post["postId"] for post, _facts_ in (_post_from_card(card) for card in _cards(page)) if post}


def _where_under(page, parent_id, reply_id, deadline, seen, step):
    """Where a reply sits under its post for a stranger: "shown", "folded", "missing" or "unknown".

    Shown when it is among the replies X lists, scrolling down a few times.
    Folded when it only appears after pressing "Show probable spam" or "Show
    more replies", which X puts some replies behind for everyone but their
    writer. Missing when the replies stopped coming and neither showed it.
    Unknown when the time, the scrolls or X's rate limit ended the look while
    replies were still coming, or the post's page drew nothing to look
    through: that is no reading. Promo's best guess, because X never says.
    """
    where = ""
    with _Graph(page, DETAIL_OPS) as graph:
        try:
            _read_start(page, graph, _status_url(parent_id), DETAIL_OPS, step)
            stale = 0
            ids = set()
            ended = False
            for _ in range(UNDER_SCROLLS):
                graph.drain()
                ids = _ids_here(page, graph)
                if reply_id in ids:
                    where = "shown"
                    break
                if stale >= 2:
                    ended = True
                    break
                if graph.limited or time.monotonic() >= deadline:
                    break
                _scroll(page)
                graph.drain()
                stale = stale + 1 if len(_ids_here(page, graph)) <= len(ids) else 0
            else:
                # The scrolls ran out. Only replies that had stopped coming
                # by then end the look; otherwise more were on their way.
                ids = _ids_here(page, graph)
                where = "shown" if reply_id in ids else ""
                ended = stale >= 2
            if not where and ended and ids and not graph.limited and time.monotonic() < deadline:
                where = "missing"
                button = _first_visible(page, SHOW_MORE_BUTTONS, 3_000)
                if button is not None:
                    human.click(button)
                    until = time.monotonic() + 8
                    while time.monotonic() < until:
                        page.wait_for_timeout(800)
                        graph.drain()
                        if reply_id in _ids_here(page, graph):
                            where = "folded"
                            break
        finally:
            graph.drain()
            seen.update(_ids_here(page, graph))
        return where or "unknown", graph.limited


def x_check(page, args):
    """A sent reply or post of ours read again, as a stranger sees it (part 37).

    Its numbers and poll votes from `TweetDetail`, the replies straight under
    it from anyone but the account itself, and, for a reply, whether it is
    shown under its post (`visible`), None when the look could not tell.
    `found` is false when X says it is gone. When `limited` is true the rest
    of the answer is not a reading.
    """
    post_id = _post_id(args.get("postId"), "check")
    handle = _handle(args.get("handle") if isinstance(args.get("handle"), str) else "").lower()
    started = time.monotonic()
    deadline = started + READ_BUDGET_SECONDS
    seen = set()
    read = _read_detail(page, post_id, "check", seen, started + 40, more_replies=2)
    empty = {"found": False, "visible": False, "views": None, "likes": None, "replies": None, "reposts": None, "pollVotes": None, "incoming": []}
    post = read["post"]
    if post is None:
        if not read["gone"] and not read["limited"]:
            raise CommandError("check: X's page for that post did not load")
        return dict(empty, **_read_cost(seen, read["limited"], read["signs"]))
    incoming = [_incoming(item) for item in read["direct"] if item["authorHandle"].lower() != handle][:INCOMING_LIMIT]
    if read["tweet"] is None:
        # Only the drawn page came. It cannot say what the post answers, so
        # nothing is said about where it sits, and only drawn numbers count.
        counts = read.get("counts") or {}
        return dict(
            {"found": True, "visible": None, "views": counts.get("views"), "likes": counts.get("likes"), "replies": counts.get("replies"),
             "reposts": counts.get("reposts"), "pollVotes": None, "incoming": incoming},
            **_read_cost(seen, read["limited"], read["signs"])
        )
    limited = read["limited"]
    visible = True
    parent = str((read["tweet"].get("legacy") or {}).get("in_reply_to_status_id_str") or "")
    if parent and post["isReply"]:
        # None when the look under the post could not tell: never written down as folded.
        visible = None
        if not limited:
            where, limited = _where_under(page, parent, post_id, deadline, seen, "check")
            visible = {"shown": True, "folded": False, "missing": False}.get(where)
    return dict(
        {
            "found": True,
            "visible": visible,
            "views": post["views"],
            "likes": post["likes"],
            "replies": post["replies"],
            "reposts": post["reposts"],
            "pollVotes": _poll_votes(read["tweet"]),
            "incoming": incoming,
        },
        **_read_cost(seen, limited or read["limited"], read["signs"])
    )


def x_mentions(page, args):
    """The newest posts naming the account as @handle, replies to it included, from X's Latest search (part 39)."""
    handle = _handle_arg(args.get("handle"), "mentions")
    try:
        want = max(1, min(SEARCH_LIMIT, int(args.get("max") or 0)))
    except (TypeError, ValueError):
        raise CommandError("mentions: max must be a number") from None
    query = "@%s -from:%s" % (handle, handle)
    url = "https://x.com/search?q=%s&src=typed_query&f=live" % urllib.parse.quote(query)
    keep = lambda post, facts: not facts["promoted"] and post["authorHandle"].lower() != handle.lower()  # noqa: E731
    with _Graph(page, ("SearchTimeline",)) as graph:
        signs = _read_start(page, graph, url, ("SearchTimeline",), "mentions")
        posts, seen = _collect(page, graph, want, keep, time.monotonic() + READ_BUDGET_SECONDS)
        limited = graph.limited
    return dict({"incoming": [_incoming(post) for post in posts]}, **_read_cost(seen, limited, signs))


def x_trends(page, args=None):
    """What X says is trending for the search account's place (part 15).

    X tunes trends to where the account is, so the search account's proxy
    decides what it sees, and `place` says where X says they are for. Read
    from whichever answer carries trend items, or the drawn trend cells.
    """
    with _Graph(page) as graph:
        try:
            _goto(page, "https://x.com/explore/tabs/trending")
        except Exception as error:  # noqa: BLE001
            raise CommandError("trends: X's trends page would not open: %s" % _short(error))
        deadline = time.monotonic() + SETTLE_MS / 1000
        drawn = []
        while True:
            graph.drain()
            trends = _trends_in(graph.answers)
            if trends or graph.limited:
                break
            try:
                drawn = page.evaluate(TRENDS_SCRIPT) or []
            except Exception:  # noqa: BLE001
                drawn = []
            if drawn or time.monotonic() >= deadline:
                break
            page.wait_for_timeout(700)
        page.wait_for_timeout(random.randint(600, 1200))
        graph.drain()
        signs = _usable(page, "trends")
        trends = _trends_in(graph.answers)
        if not trends:
            try:
                drawn = page.evaluate(TRENDS_SCRIPT) or drawn
            except Exception:  # noqa: BLE001
                pass
            trends = [trend for trend in (_trend_from_lines(lines) for lines in drawn) if trend]
        seen = graph.post_ids()
        limited = graph.limited
    if not trends and not limited:
        raise CommandError("trends: X showed no trends")
    return dict(
        {"trends": [{"name": trend["name"], "posts": trend["posts"]} for trend in trends[:TRENDS_LIMIT]], "place": _place(trends)},
        **_read_cost(seen, limited, signs)
    )


def x_lookup(page, args):
    """Whether accounts exist, with their names, followers and joining day (parts 14 and 43).

    Each account's own page is opened and read from `UserByScreenName`. An
    account X suspended counts as not existing: there is nobody to reply to.
    A handle that is not one X could have is answered as not existing without
    a visit. An account the time ran out before, or one X's answer failed
    for (its rate limit included, which sets `limited`), is left out of the
    answer, never written down as missing.
    """
    handles = args.get("handles")
    if not isinstance(handles, list) or not handles:
        raise CommandError("lookup: no accounts to look up")
    if len(handles) > LOOKUP_LIMIT:
        raise CommandError("lookup: at most %d accounts can be looked up at a time" % LOOKUP_LIMIT)
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    accounts = []
    seen = set()
    limited = False
    signs = None
    for value in handles:
        handle = _handle(value if isinstance(value, str) else "")
        if not handle:
            accounts.append({"handle": str(value)[:40], "exists": False, "name": "", "followers": None, "joinedSeconds": None})
            continue
        if limited or time.monotonic() >= deadline:
            break
        try:
            user, was_limited = _read_profile(page, handle, seen)
        except Exception as error:  # noqa: BLE001
            raise CommandError("lookup: @%s's page would not open: %s" % (handle, _short(error)))
        if signs is None:
            signs = _usable(page, "lookup")
        limited = limited or was_limited
        if user is not None:
            accounts.append(user)
        page.wait_for_timeout(random.randint(800, 2000))
    return dict({"accounts": accounts}, **_read_cost(seen, limited, signs))


def _community_from_dom(raw):
    heading = (raw.get("heading") or "").strip()
    title = re.sub(r"\s*/\s*X\s*$", "", raw.get("title") or "").strip()
    name = heading or title
    if not name:
        return None
    text = raw.get("text") or ""
    members = re.search(r"(\d[\d.,]*\s*[KkMm]?)\s+Members?", text)
    rules = ""
    found = re.search(r"\bRules\b(.*)", text, re.S)
    if found:
        rules = found.group(1).strip()[:COMMUNITY_TEXT_CHARS]
    return {"name": name, "description": "", "rules": rules, "members": _number(members.group(1)) if members else None, "role": ""}


def _read_community(page, community_id, step, about=True):
    """A community as X's data (or its drawn page) shows it, the account's place in it included."""
    with _Graph(page) as graph:
        url = "https://x.com/i/communities/%s%s" % (community_id, "/about" if about else "")
        try:
            _goto(page, url)
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: the community's page would not open: %s" % (step, _short(error)))
        deadline = time.monotonic() + SETTLE_MS / 1000
        community = None
        while time.monotonic() < deadline:
            graph.drain()
            community = _community_from(graph.answers, community_id)
            if community or graph.limited:
                break
            page.wait_for_timeout(700)
        signs = _usable(page, step)
        if community is None:
            try:
                community = _community_from_dom(page.evaluate(COMMUNITY_SCRIPT) or {})
            except Exception:  # noqa: BLE001
                community = None
        return community, graph.post_ids(), graph.limited, signs


def x_community(page, args):
    """A community's name, about words, rules and members (part 35), from its About page."""
    community_id = _community_id(args.get("communityId"), "community")
    community, seen, limited, signs = _read_community(page, community_id, "community")
    if community is None:
        if limited:
            return dict({"name": "", "description": "", "rules": "", "members": None}, **_read_cost(seen, limited, signs))
        raise CommandError("community: X did not show a community with that id")
    return dict(
        {"name": community["name"], "description": community["description"], "rules": community["rules"], "members": community["members"]},
        **_read_cost(seen, limited, signs)
    )


def x_reach(page, args):
    """Whether a stranger finds the account's latest reply, in search and under its post (part 42).

    Search: X's Latest search for a distinctive run of the reply's own words
    in quotes, from the account. Under its post: the parent post opened, its
    replies scrolled, and "Show probable spam" pressed when the reply is not
    among them. A reading only, nothing is written.
    """
    handle = _handle_arg(args.get("handle"), "reach")
    post_id = _post_id(args.get("postId"), "reach")
    parent_id = _post_id(args.get("parentId"), "reach")
    phrase = _phrase(args.get("text") if isinstance(args.get("text"), str) else "")
    if len(phrase.split()) < 3:
        raise CommandError("reach: the reply has too few words of its own to search X for")
    started = time.monotonic()
    query = '"%s" from:%s' % (phrase, handle)
    url = "https://x.com/search?q=%s&src=typed_query&f=live" % urllib.parse.quote(query)
    with _Graph(page, ("SearchTimeline",)) as graph:
        signs = _read_start(page, graph, url, ("SearchTimeline",), "reach")
        posts, seen = _collect(page, graph, 20, lambda post, facts: True, started + 30)
        limited = graph.limited
    in_search = any(post["postId"] == post_id for post in posts)
    under = "unknown"
    if not limited:
        under, limited = _where_under(page, parent_id, post_id, started + READ_BUDGET_SECONDS, seen, "reach")
    # The app's answer has no word for a look that could not tell, and
    # "missing" would be written down as folded.
    if under == "unknown":
        raise CommandError(
            "reach: the look under the post could not tell where the reply sits (the time, the scrolls or X's rate limit ran out first), so no reading was taken"
        )
    return dict({"inSearch": in_search, "underPost": under}, **_read_cost(seen, limited, signs))


# --- Writes, in the account's own browser ---------------------------------


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


def _article_of(post_id):
    """The drawn post with this id: the one whose time link ends in its own address."""
    return "article[data-testid='tweet']:has(a[href$='/status/%s'])" % post_id


def _new_visit():
    return {"beforeSeconds": 0, "afterSeconds": 0, "postsOpened": 0, "problems": [], "_sizes": []}


def _finish_visit(visit):
    sizes = visit.pop("_sizes")
    visit["scrolls"] = len(sizes)
    return visit, human.describe_scrolls(sizes)


def _wait_for_feed(page):
    try:
        page.locator("article[data-testid='tweet']").first.wait_for(state="attached", timeout=20_000)
    except Exception:  # noqa: BLE001 - scrolling an empty page is harmless
        pass


def _open_feed_post(page, visit, deadline):
    """Opens one post from those on screen, reads it a little, and comes back. Never likes or reposts."""
    try:
        links = page.locator(FEED_POST_LINKS)
        # The window's own height: a persistent Camoufox window has no set
        # viewport for Playwright to report.
        height = page.evaluate("() => window.innerHeight") or 900
        shown = []
        for index in range(min(links.count(), 20)):
            box = links.nth(index).bounding_box()
            if box and box["height"] > 8 and 80 <= box["y"] < height - box["height"]:
                shown.append(index)
        if not shown:
            return False
        before = page.url
        human.click(links.nth(random.choice(shown)))
        human.wait_for_address(page, lambda address: "/status/" in address and address != before)
        if time.monotonic() < deadline:
            human.read_page(page, random.randint(*FEED_POST_CHARACTERS), visit["_sizes"])
        try:
            page.go_back(wait_until="commit", timeout=10_000)
        except Exception:  # noqa: BLE001 - the address below says whether it went
            pass
        human.wait_for_address(page, lambda address: "/status/" not in address)
        visit["postsOpened"] += 1
        return True
    except Exception as error:  # noqa: BLE001 - the feed carries on without it
        visit["problems"].append("opening a post from the feed: %s" % _short(error))
        if "/status/" in (page.url or ""):
            _goto(page, HOME)
        return False


def _feed(page, seconds, posts, visit, deadline):
    """Time in the home feed, opening `posts` of them along the way."""
    if urllib.parse.urlparse(page.url or "").path != "/home":
        _goto(page, HOME)
    _wait_for_feed(page)
    stops = posts + 1
    for stop in range(stops):
        if time.monotonic() >= deadline:
            break
        share = seconds / stops * random.uniform(0.7, 1.3)
        visit["_sizes"].extend(human.browse(page, share, deadline))
        if stop < posts and time.monotonic() < deadline:
            _open_feed_post(page, visit, deadline)


def _signed_in_home(page, step):
    """Goes to X's home and returns the signed-in account's handle, or raises naming what is in the way."""
    try:
        _goto(page, HOME)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: X's home would not open: %s" % (step, _short(error)))
    deadline = time.monotonic() + 12
    while True:
        signs = _signs(page)
        if signs["checked"] or time.monotonic() >= deadline:
            break
        page.wait_for_timeout(600)
    signs = _usable(page, step)
    if signs["limited"]:
        raise CommandError("%s: %s" % (step, signs["reason"] or "X says this account has hit its rate limit"))
    return signs["handle"]


# X's suggestion list, open under an @name or #tag being typed.
SUGGESTIONS = "[role='listbox']"


def _suggestions_showing(page):
    try:
        found = page.locator(SUGGESTIONS)
        return any(found.nth(index).is_visible() for index in range(min(found.count(), 3)))
    except Exception:  # noqa: BLE001 - a page moving under us
        return False


def _type_into(page, box, text, step):
    """Types the words a line at a time.

    A line break is the Enter key, and Enter while X's suggestion list is open
    under an @name or #tag picks the suggestion instead. So before each line
    break the list, when it is showing, is closed with Escape. Escape is never
    pressed otherwise: in a pop-up composer it would close the composer.
    """
    try:
        human.click(box)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the box could not be pressed: %s" % (step, _short(error)))
    lines = text.split("\n")
    gaps = []
    for index, line in enumerate(lines):
        gaps.extend(human.type_text(box, line) or [])
        if index == len(lines) - 1:
            break
        # X looks its suggestions up a moment after the last key.
        page.wait_for_timeout(random.randint(400, 800))
        if _suggestions_showing(page):
            page.keyboard.press("Escape")
            page.wait_for_timeout(random.randint(200, 400))
        human.type_text(box, "\n")
    human.pause_before_submit(page)
    return gaps


# Marks that may sit in X's composer without being typed.
ZERO_WIDTH = dict.fromkeys(map(ord, "\u200b\u200c\u200d\u2060\ufeff"))


def _box_matches(sent, shown):
    """True when the composer holds exactly the words typed, as `_plain` compares them.

    Stricter than `_same_words` on purpose, which leaves out the @names at the
    start of a post: an @name X's suggestion list swapped there must not pass.
    """
    wanted = _plain((sent or "").translate(ZERO_WIDTH))
    return bool(wanted) and wanted == _plain((shown or "").translate(ZERO_WIDTH))


def _box_text(box):
    """What the box holds now: a text box's value, or a composer's drawn words."""
    try:
        return box.input_value(timeout=2_000)
    except Exception:  # noqa: BLE001 - X's composer is not a text box
        pass
    try:
        return box.inner_text(timeout=2_000)
    except Exception:  # noqa: BLE001
        return ""


def _check_box(box, text, step, nothing="Nothing was posted."):
    """Reads the box back before the press, and refuses unless it holds the words written."""
    if not _box_matches(text, _box_text(box)):
        raise CommandError("%s: the words in the box did not match what was written. %s" % (step, nothing))


def _after_press(step, look):
    """Runs a step after Post, Reply or Update was pressed.

    Whatever fails in it says the words may already be on X, the words the
    app matches before it lets anyone send again. X's own refusal of the post
    passes through as it is, because nothing went up.
    """
    try:
        return look()
    except _Refused:
        raise
    except Exception as error:  # noqa: BLE001 - reported with the warning
        words = str(error) or error.__class__.__name__
        if "may already be on X" in words:
            raise
        if words.startswith(step + ": "):
            words = words[len(step) + 2:]
        raise CommandError("%s: %s. %s" % (step, _short(Exception(words)).rstrip("."), MAY_BE_ON_X)) from error


def _press_send(page, selectors, step, words):
    """Presses X's send button once, after waiting for X to switch it on. Never pressed twice."""
    button = _first_visible(page, selectors, 8_000)
    if button is None:
        raise CommandError("%s: there is no %s button under the words. Nothing was sent." % (step, words))
    # X keeps the button off while a picture uploads, and while the words are
    # past what the account may send.
    until = time.monotonic() + 45
    while button.get_attribute("aria-disabled") == "true" or button.get_attribute("disabled") is not None:
        if time.monotonic() >= until:
            raise CommandError("%s: X kept the %s button switched off, so it would not take these words (too long for this account, or the picture never finished uploading). Nothing was sent." % (step, words))
        page.wait_for_timeout(500)
    human.click(button)


def _created(page, graph, step, wait_seconds=LANDED_WAIT_SECONDS):
    """The id X gave what was just sent, off its CreateTweet answer. None when that answer never came."""
    deadline = time.monotonic() + wait_seconds
    while True:
        graph.drain()
        for answer in graph.named(*WRITE_OPS):
            post_id, refusal = _created_id(answer["data"])
            if post_id:
                return post_id
            if refusal:
                raise _Refused("%s: X refused it: %s" % (step, refusal))
        if time.monotonic() >= deadline:
            return None
        page.wait_for_timeout(700)


class _PinnedHTTPS(http.client.HTTPSConnection):
    """An https connection to one address already checked, its certificate still checked against the host's name.

    Connecting by the address checked, rather than by name again, means the
    name cannot point somewhere else between the check and the download.
    """

    def __init__(self, host, address, port, timeout):
        self._checked_tls = ssl.create_default_context()
        http.client.HTTPSConnection.__init__(self, host, port, timeout=timeout, context=self._checked_tls)
        self._address = address
        # Kept apart from `sock`, which the connection lets go of once the
        # answer holds the socket, so each read can still be given its time.
        self.pinned = None

    def connect(self):
        sock = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self.pinned = self._checked_tls.wrap_socket(sock, server_hostname=self.host)


def _public_address(host, port, step):
    """The first address a picture's host names, after checking every one is out on the internet.

    A private, loopback, link-local or otherwise reserved address is refused:
    a picture's address must never reach the machine Promo runs on or its
    neighbours.
    """
    try:
        found = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the picture's address would not resolve: %s" % (step, _short(error)))
    addresses = [item[4][0] for item in found]
    if not addresses:
        raise CommandError("%s: the picture's address would not resolve" % step)
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise CommandError("%s: the picture's address is not out on the internet, so it was not downloaded" % step)
    return addresses[0]


def _picture_file(url, step):
    """Downloads a post's picture to a file of its own for X's file box, and returns its path.

    Only https, only to a public address, with no redirect followed, only a
    picture X takes, no bigger than X takes, and within a minute. Fetched
    here rather than by the page, because a file box takes a file.
    """
    parsed = urllib.parse.urlparse(url or "")
    if parsed.scheme != "https" or not parsed.hostname:
        raise CommandError("%s: the picture's address must start with https://" % step)
    try:
        port = parsed.port or 443
    except ValueError:
        raise CommandError("%s: the picture's address has a port that is not a number" % step) from None
    deadline = time.monotonic() + PICTURE_SECONDS
    address = _public_address(parsed.hostname, port, step)
    path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
    connection = _PinnedHTTPS(parsed.hostname, address, port, timeout=20)
    chunks = []
    try:
        connection.request("GET", path, headers={"user-agent": "Promo/1"})
        answer = connection.getresponse()
        if 300 <= answer.status < 400:
            raise CommandError("%s: the picture's address sends the download somewhere else, which Promo does not follow" % step)
        if answer.status != 200:
            raise CommandError("%s: the picture would not download: the address answered %d" % (step, answer.status))
        kind = answer.headers.get_content_type()
        if kind not in PICTURE_TYPES:
            raise CommandError("%s: the picture is %s, which X does not take" % (step, kind))
        size = 0
        while True:
            left = deadline - time.monotonic()
            if left <= 0:
                raise CommandError("%s: the picture took longer than %d seconds to download" % (step, PICTURE_SECONDS))
            if connection.pinned is not None:
                connection.pinned.settimeout(left)
            chunk = answer.read(PICTURE_CHUNK_BYTES)
            if not chunk:
                break
            size += len(chunk)
            if size > PICTURE_MAX_BYTES:
                raise CommandError("%s: the picture is bigger than the 5 MB X takes" % step)
            chunks.append(chunk)
    except CommandError:
        raise
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the picture would not download: %s" % (step, _short(error)))
    finally:
        connection.close()
    handle, file_path = tempfile.mkstemp(prefix="promo-x-", suffix=PICTURE_TYPES[kind])
    with os.fdopen(handle, "wb") as out:
        out.write(b"".join(chunks))
    return file_path


def _poll_arg(poll, step):
    """A poll the app asked for, checked against X's own limits: (choices, minutes)."""
    if not isinstance(poll, dict):
        raise CommandError("%s: the poll is not one X can take" % step)
    choices = [choice.strip() for choice in poll.get("choices") or [] if isinstance(choice, str) and choice.strip()]
    if not POLL_CHOICES[0] <= len(choices) <= POLL_CHOICES[1]:
        raise CommandError("%s: a poll needs two to four choices" % step)
    if any(len(choice) > POLL_CHOICE_CHARS for choice in choices):
        raise CommandError("%s: a poll choice is longer than X's 25 characters" % step)
    try:
        minutes = int(poll.get("minutes"))
    except (TypeError, ValueError):
        raise CommandError("%s: the poll has no length" % step) from None
    if not POLL_MINUTES[0] <= minutes <= POLL_MINUTES[1]:
        raise CommandError("%s: a poll runs from 5 minutes to 7 days" % step)
    return choices, minutes


def _attach(page, scope, picture_path, poll, step):
    """Adds the picture or the poll in X's composer, after the words are typed."""
    if picture_path:
        field = page.locator("%s input[data-testid='fileInput']" % scope).first
        try:
            field.set_input_files(picture_path)
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: the picture could not be added in X's composer: %s. Nothing was sent." % (step, _short(error)))
        if _first_visible(page, ["%s [data-testid='attachments'] img" % scope, "%s [data-testid='attachments']" % scope], 30_000) is None:
            raise CommandError("%s: the picture did not show in X's composer. Nothing was sent." % step)
    if poll:
        choices, minutes = poll
        opener = _first_visible(page, ["%s [data-testid='createPollButton']" % scope, "%s [aria-label='Add poll']" % scope], 5_000)
        if opener is None:
            raise CommandError("%s: there is no poll button in X's composer. Nothing was sent." % step)
        human.click(opener)
        page.wait_for_timeout(random.randint(700, 1300))
        for index, choice in enumerate(choices):
            selector = "%s input[name='Choice%d']" % (scope, index + 1)
            field = _first_visible(page, [selector], 3_000)
            if field is None and index >= 2:
                more = _first_visible(page, ["%s [data-testid='addPollChoice']" % scope, "%s [aria-label='Add a choice']" % scope], 3_000)
                if more is not None:
                    human.click(more)
                    field = _first_visible(page, [selector], 3_000)
            if field is None:
                raise CommandError("%s: X's poll has no box for choice %d. Nothing was sent." % (step, index + 1))
            human.click(field)
            human.type_text(field, choice)
        for position, (testid, value) in enumerate(zip(("selectPollDays", "selectPollHours", "selectPollMinutes"), _poll_length(minutes))):
            select = page.locator("%s select[data-testid='%s']" % (scope, testid))
            if not select.count():
                select = page.locator("%s select" % scope).nth(position)
            try:
                select.first.select_option(str(value))
            except Exception as error:  # noqa: BLE001
                raise CommandError("%s: the poll's length could not be set: %s. Nothing was sent." % (step, _short(error)))


def _mine_in_cards(cards, handle, text, under=False, since=None):
    """The id of a drawn post by `handle` with these words, for when X's data never came.

    The drawing does not say what a post answers or quotes, so on a post's
    page (`under`) any post of ours with these words counts, and on the
    account's own page a reply never does.
    """
    wanted = (handle or "").lower()
    for card in cards:
        post, facts = _post_from_card(card)
        if post is None or post["authorHandle"].lower() != wanted or facts["repost"]:
            continue
        if not under and post["isReply"]:
            continue
        if _recent(post["postedSeconds"], since) and _same_words(text, post["text"]):
            return post["postId"]
    return None


def _heard_timeline(graph, names):
    """X's answers of these names that carry a timeline, an empty one included."""
    return [answer for answer in graph.named(*names) if answer.get("status", 200) < 400 and _instructions(answer["data"])]


def _look_for_mine(page, graph, names, handle, text, parent_id="", quoted_id="", since=None):
    """Our post with these words on the page open now, from `since` on when it is given.

    Returns (its id or None, whether there was anything to look in). X's data
    when it came; when it did not, the drawn posts, by handle and words. With
    neither there is nothing to look in, and a write is refused before typing.
    A reply under `parent_id` and a quote of `quoted_id` are looked for with
    no `since`: the same words there are always an earlier try.
    """
    heard = _heard_timeline(graph, names)
    if heard:
        return _mine_in(_posts_in(heard), handle, text, parent_id=parent_id, quoted_id=quoted_id, since=since), True
    cards = _cards(page)
    if not cards:
        return None, False
    return _mine_in_cards(cards, handle, text, under=bool(parent_id), since=since), True


def _own_page_look(page, handle, text, quoted_id="", since=None):
    """Our post (or quote of `quoted_id`) with these words on the account's own page, from `since` on when given.

    (its id or None, whether there was anything to look in), as `_look_for_mine`.
    """
    with _Graph(page, ("UserTweets",)) as graph:
        _goto(page, "https://x.com/%s" % handle)
        _settle(page, graph, ("UserTweets",))
        return _look_for_mine(page, graph, ("UserTweets",), handle, text, quoted_id=quoted_id, since=since)


def _since_arg(value, step):
    """Where a post's look for an earlier try starts: the app's `since` (seconds since 1970) when sent, else an hour ago."""
    if value is None or value == "":
        return time.time() - LOOK_BACK_SECONDS
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise CommandError("%s: since must be seconds since 1970" % step)
    return float(value) - CLOCK_SLACK_SECONDS


def _reply_under(page, handle, parent_id, text):
    """Our reply under a post, looked for on the post's page. None when it is not there."""
    with _Graph(page, DETAIL_OPS) as graph:
        _goto(page, _status_url(parent_id))
        _settle(page, graph, DETAIL_OPS)
        found, _looked = _look_for_mine(page, graph, DETAIL_OPS, handle, text, parent_id=parent_id)
        return found


def _write_under(page, handle, parent_id, text, step, visit=None, check_open=True, picture_path=None, poll=None):
    """Writes one reply under a post, from the post's own page, and returns its id.

    Looks first: if our reply with these words is under the post already (an
    earlier try that went out without saying so, however long ago), its id is
    returned and nothing is typed. When neither X's data nor a drawn post was
    there to look in, nothing is typed either. Then the post is read, the
    words typed at a person's pace and Reply pressed once. The id comes from
    X's answer to the press, or from the post's page read again.
    """
    with _Graph(page, DETAIL_OPS + WRITE_OPS) as graph:
        try:
            _goto(page, _status_url(parent_id))
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: the post would not open: %s" % (step, _short(error)))
        _settle(page, graph, DETAIL_OPS)
        _usable(page, step)
        focal, _direct, gone = _conversation(graph.answers, parent_id)
        if gone:
            raise CommandError("%s: the post is gone or its account is protected, so nothing was typed" % step)
        already, looked = _look_for_mine(page, graph, DETAIL_OPS, handle, text, parent_id=parent_id)
        if not looked:
            raise CommandError("%s: %s" % (step, NO_EARLIER_LOOK))
        if already:
            if visit is not None:
                visit["alreadyThere"] = True
            return already
        if check_open and focal is not None and not _replies_open(focal):
            raise CommandError("%s: the poster has limited who can reply, so nothing was typed" % step)
        if visit is not None:
            human.read_page(page, len(_tweet_text(focal)) if focal else 400, visit["_sizes"])
        scope = "main"
        box = _first_visible(page, ["main " + COMPOSER], 8_000)
        buttons = INLINE_BUTTONS
        if box is None:
            opener = _first_visible(page, [_article_of(parent_id) + " [data-testid='reply']"], 6_000)
            if opener is None:
                raise CommandError("%s: there is no reply box or Reply button on the post" % step)
            human.click(opener)
            box = _first_visible(page, [MODAL_BOX], 10_000)
            if box is None:
                raise CommandError("%s: X's reply box did not open" % step)
            scope, buttons = "[role='dialog']", MODAL_BUTTONS
        gaps = _type_into(page, box, text, step)
        _attach(page, scope, picture_path, poll, step)
        _check_box(box, text, step)
        _press_send(page, buttons, step, "Reply")
        post_id = _after_press(step, lambda: _created(page, graph, step))
    if not post_id:
        post_id = _after_press(step, lambda: _reply_under(page, handle, parent_id, text))
    if not post_id:
        raise CommandError("%s: Reply was pressed but the reply does not show under the post yet. It may already be on X; look before sending again." % step)
    print("x %s typed: %s" % (step, human.describe_gaps(gaps)), flush=True)
    return post_id


def _after_feed(page, visit, seconds_range, deadline):
    after = time.monotonic()
    try:
        seconds = min(random.uniform(*seconds_range), deadline - after)
        if seconds > 5:
            _feed(page, seconds, 0, visit, deadline)
    except Exception as error:  # noqa: BLE001 - it is on X already
        visit["problems"].append("the feed after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after)


def _log_visit(step, visit):
    record, scrolls = _finish_visit(visit)
    print(
        "x %s visit: %d seconds in the feed before, %d after, %d posts opened; %s; %s"
        % (step, record["beforeSeconds"], record["afterSeconds"], record["postsOpened"], scrolls, "; ".join(record["problems"]) or "no problems"),
        flush=True,
    )


def x_reply(page, args):
    """Writes one reply (or an answer to somebody's reply) under a post, inside an ordinary visit.

    Before: a few minutes in the home feed, a post or two opened. Then the
    post, read, and the reply typed at a person's pace and sent. After: a
    little more feed. Never likes, reposts or follows. Only called after a
    person pressed Post, and never sent twice: once Reply is pressed, a
    failure to find it afterwards says it may already be up.
    """
    reply_to = _post_id(args.get("replyToId"), "reply")
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    if not text:
        raise CommandError("reply: no words to send")
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = REPLY_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()
    handle = _signed_in_home(page, "reply")
    try:
        _feed(page, random.uniform(*FEED_BEFORE_SECONDS), random.randint(*POSTS_BEFORE), visit, deadline - reserve)
    except Exception as error:  # noqa: BLE001 - the reply still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)
    post_id = _write_under(page, handle, reply_to, text, "reply", visit, check_open=True)
    if not visit.get("alreadyThere"):
        _after_feed(page, visit, FEED_AFTER_SECONDS, deadline)
    _log_visit("reply", visit)
    return {"postId": post_id, "url": _status_url(post_id, handle)}


def x_quote(page, args):
    """One quote post of somebody's post (part 34), inside the same visit as a reply.

    The quote goes through the post's repost menu and its Quote item; the
    Repost item beside it is never pressed. Looks first on the account's own
    page for a quote of this post with these words, however long ago, so a
    second try never quotes twice, and types nothing when that page showed
    nothing to look in.
    """
    post_id = _post_id(args.get("postId"), "quote")
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    if not text:
        raise CommandError("quote: no words to send")
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = REPLY_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()
    handle = _signed_in_home(page, "quote")
    already, looked = _own_page_look(page, handle, text, quoted_id=post_id)
    if not looked:
        raise CommandError("quote: %s" % NO_EARLIER_LOOK_OWN)
    if already:
        return {"postId": already, "url": _status_url(already, handle)}
    try:
        _feed(page, random.uniform(*FEED_BEFORE_SECONDS), random.randint(*POSTS_BEFORE), visit, deadline - reserve)
    except Exception as error:  # noqa: BLE001 - the quote still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)

    with _Graph(page, DETAIL_OPS + WRITE_OPS) as graph:
        try:
            _goto(page, _status_url(post_id))
        except Exception as error:  # noqa: BLE001
            raise CommandError("quote: the post would not open: %s" % _short(error))
        _settle(page, graph, DETAIL_OPS)
        _usable(page, "quote")
        focal, _direct, gone = _conversation(graph.answers, post_id)
        if gone:
            raise CommandError("quote: the post is gone or its account is protected, so nothing was typed")
        human.read_page(page, len(_tweet_text(focal)) if focal else 400, visit["_sizes"])
        article = _article_of(post_id)
        menu = _first_visible(page, [article + " [data-testid='retweet']", article + " [data-testid='unretweet']"], 8_000)
        if menu is None:
            raise CommandError("quote: there is no repost button on the post")
        human.click(menu)
        page.wait_for_timeout(random.randint(600, 1200))
        item = _first_visible(page, ["[role='menu'] a[role='menuitem'][href*='/compose/post']", "[role='menu'] [role='menuitem']:has-text('Quote')"], 5_000)
        if item is None:
            page.keyboard.press("Escape")
            raise CommandError("quote: X's repost menu offered no Quote. Nothing was reposted.")
        human.click(item)
        box = _first_visible(page, [MODAL_BOX], 10_000)
        if box is None:
            raise CommandError("quote: X's quote box did not open")
        gaps = _type_into(page, box, text, "quote")
        _check_box(box, text, "quote")
        _press_send(page, MODAL_BUTTONS, "quote", "Post")
        new_id = _after_press("quote", lambda: _created(page, graph, "quote"))
    if not new_id:
        new_id, _looked = _after_press("quote", lambda: _own_page_look(page, handle, text, quoted_id=post_id))
    if not new_id:
        raise CommandError("quote: Post was pressed but the quote does not show on the account's page yet. It may already be on X; look before sending again.")
    print("x quote typed: %s" % human.describe_gaps(gaps), flush=True)
    _after_feed(page, visit, FEED_AFTER_SECONDS, deadline)
    _log_visit("quote", visit)
    return {"postId": new_id, "url": _status_url(new_id, handle)}


def _pick_audience(page, name, step):
    """Sets X's composer to post into the community named, through its audience chooser."""
    chip = _first_visible(page, ["[role='dialog'] [aria-label='Choose audience']", "[role='dialog'] button:has-text('Everyone')", "[role='dialog'] [role='button']:has-text('Everyone')"], 6_000)
    if chip is not None and name.lower() in (chip.inner_text() or "").lower():
        return
    if chip is None:
        raise CommandError("%s: X's composer offered no audience to choose, so the post cannot go into the community. Nothing was sent." % step)
    human.click(chip)
    page.wait_for_timeout(random.randint(700, 1300))
    quoted = json.dumps(name)
    option = _first_visible(page, ["[role='menu'] [role='menuitem']:has-text(%s)" % quoted, "[role='listbox'] [role='option']:has-text(%s)" % quoted, "[role='dialog'] [role='menuitem']:has-text(%s)" % quoted], 5_000)
    if option is None:
        page.keyboard.press("Escape")
        raise CommandError("%s: X did not offer the community %s as an audience, so this account is not a member there. Nothing was sent." % (step, name))
    human.click(option)
    page.wait_for_timeout(random.randint(700, 1300))


def _write_new(page, handle, text, community_id, picture_path, poll, since):
    """Writes one post of the account's own from X's composer, and returns its id."""
    name = ""
    if community_id:
        community, _seen, _limited, _signs_ = _read_community(page, community_id, "publish", about=False)
        if community is None:
            raise CommandError("publish: X did not show that community, so nothing was typed")
        if community["role"] == "NonMember":
            raise CommandError("publish: this account is not a member of %s, so X will not let it post there. Nothing was typed." % community["name"])
        name = community["name"]
    with _Graph(page, WRITE_OPS) as graph:
        opener = _first_visible(page, ["[data-testid='SideNav_NewTweet_Button']", "a[href='/compose/post']"], 8_000)
        if opener is None:
            raise CommandError("publish: there is no Post button in X's left menu")
        human.click(opener)
        box = _first_visible(page, [MODAL_BOX], 10_000)
        if box is None:
            raise CommandError("publish: X's composer did not open")
        if name:
            _pick_audience(page, name, "publish")
        gaps = _type_into(page, box, text, "publish")
        _attach(page, "[role='dialog']", picture_path, poll, "publish")
        _check_box(box, text, "publish")
        _press_send(page, MODAL_BUTTONS, "publish", "Post")
        post_id = _after_press("publish", lambda: _created(page, graph, "publish"))
    if not post_id:
        post_id, _looked = _after_press("publish", lambda: _own_page_look(page, handle, text, since=since))
    if not post_id:
        raise CommandError("publish: Post was pressed but the post does not show on the account's page yet. It may already be on X; look before posting again.")
    print("x publish typed: %s" % human.describe_gaps(gaps), flush=True)
    return post_id


def x_publish(page, args):
    """One post of the account's own: the first of a thread, or the next piece under `replyToId`.

    The first goes from X's composer, into a community when `communityId` is
    set (through the composer's audience chooser, refused when the account is
    not a member), with a poll or a picture when asked. A thread's next piece
    is a reply under the piece before. Looks first for the same words: for a
    first piece, posted since `since` (seconds since 1970, when the app's
    first try began) or in the last hour when the app sends none; for a later
    piece, under the piece before at any time. So a second try never posts
    them twice, and nothing is typed when there was nothing to look in. The first piece gets a short look at the feed
    before and after; later pieces follow straight on, as a person sends a
    thread. Only called after a person pressed Post.
    """
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    picture = (args.get("pictureUrl") or "").strip() if isinstance(args.get("pictureUrl"), str) else ""
    reply_to = (args.get("replyToId") or "").strip() if isinstance(args.get("replyToId"), str) else ""
    community_id = (args.get("communityId") or "").strip() if isinstance(args.get("communityId"), str) else ""
    if not text:
        raise CommandError("publish: no words to post")
    if reply_to:
        reply_to = _post_id(reply_to, "publish")
    if community_id:
        community_id = _community_id(community_id, "publish")
    poll = _poll_arg(args["poll"], "publish") if args.get("poll") else None
    since = _since_arg(args.get("since"), "publish")
    if poll and picture:
        raise CommandError("publish: X does not take a picture and a poll on one post")

    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    picture_path = _picture_file(picture, "publish") if picture else None
    try:
        handle = _signed_in_home(page, "publish")
        if reply_to:
            # A thread's next piece stays wherever the first went, a community included.
            post_id = _write_under(page, handle, reply_to, text, "publish", None, check_open=False, picture_path=picture_path, poll=poll)
        else:
            already, looked = _own_page_look(page, handle, text, since=since)
            if not looked:
                raise CommandError("publish: %s" % NO_EARLIER_LOOK_OWN)
            if already:
                return {"postId": already, "url": _status_url(already, handle)}
            visit = _new_visit()
            try:
                _feed(page, random.uniform(*PUBLISH_FEED_BEFORE_SECONDS), 0, visit, deadline - REPLY_RESERVE_SECONDS - len(text) * TYPING_SECONDS_PER_CHARACTER)
            except Exception as error:  # noqa: BLE001 - the post still goes
                visit["problems"].append("the feed before: %s" % _short(error))
            visit["beforeSeconds"] = int(time.monotonic() - started)
            post_id = _write_new(page, handle, text, community_id, picture_path, poll, since)
            _after_feed(page, visit, PUBLISH_FEED_AFTER_SECONDS, deadline)
            _log_visit("publish", visit)
    finally:
        if picture_path:
            try:
                os.remove(picture_path)
            except OSError:
                pass
    return {"postId": post_id, "url": _status_url(post_id, handle)}


def _post_menu(page, post_id, step, word):
    """Opens a post's own "More" menu and presses the item called exactly `word`."""
    caret = _first_visible(page, [_article_of(post_id) + " [data-testid='caret']"], 8_000)
    if caret is None:
        raise CommandError("%s: there is no More button on the post" % step)
    human.click(caret)
    page.wait_for_timeout(random.randint(600, 1200))
    # By its whole name, so "Edit" never matches another item holding the word.
    items = page.locator("[role='menuitem']").filter(has_text=re.compile(r"^\s*%s\s*$" % re.escape(word)))
    if not items.count():
        page.keyboard.press("Escape")
        return False
    human.click(items.first)
    page.wait_for_timeout(random.randint(900, 1600))
    return True


def _own_post_page(page, graph, post_id, step):
    """Opens one of the account's own posts and checks it is the account's: (handle, the post or None, gone)."""
    try:
        _goto(page, _status_url(post_id))
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the post would not open: %s" % (step, _short(error)))
    _settle(page, graph, DETAIL_OPS)
    handle = _usable(page, step)["handle"]
    focal, _direct, gone = _conversation(graph.answers, post_id)
    if focal is not None and _user_of(focal)["handle"].lower() != (handle or "").lower():
        raise CommandError("%s: that post is not this account's, so nothing was pressed" % step)
    return handle, focal, gone


def _newest_id(tweet):
    """The id of a post's newest version.

    X gives an edited post a new id and lists every version's id, oldest
    first, in `edit_control.edit_tweet_ids`; a later version keeps that list
    under `edit_control.edit_control_initial`. A post never edited is its own
    newest version.
    """
    control = (tweet or {}).get("edit_control") or {}
    ids = control.get("edit_tweet_ids") or (control.get("edit_control_initial") or {}).get("edit_tweet_ids") or []
    ids = [str(item) for item in ids if X_ID.fullmatch(str(item))]
    return ids[-1] if ids else str((tweet or {}).get("rest_id") or "")


def _newest_version(page, graph, post_id, step):
    """Opens one of the account's own posts and follows X's edits to its newest version.

    (handle, that version or None, its id, gone). The newest version is read
    from the answers already heard, or from its own page when they lack it.
    """
    handle, focal, gone = _own_post_page(page, graph, post_id, step)
    newest = _newest_id(focal) if focal is not None else post_id
    if newest == post_id:
        return handle, focal, post_id, gone
    latest = _find_tweet(graph.answers, newest)
    if latest is None:
        _handle_, latest, _gone_ = _own_post_page(page, graph, newest, step)
    return handle, latest, newest, False


def x_edit(page, args):
    """New words for one of the account's own posts, through X's Edit (part 40).

    X offers Edit only to a paid account, within an hour of posting, and the
    routine says so when the post's menu has none. An edit gives the post a
    new id, so the post is followed to its newest version first: a second try
    after a first that saved finds the words already there. The words are
    replaced and Update pressed; the change is checked in X's answer, or by
    reading the newest version again. `postId` is the id the words now sit
    under, or None when it is not known.
    """
    post_id = _post_id(args.get("postId"), "edit")
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    if not text:
        raise CommandError("edit: no words to save")
    with _Graph(page, DETAIL_OPS + WRITE_OPS) as graph:
        handle, focal, current, gone = _newest_version(page, graph, post_id, "edit")
        if gone or focal is None:
            raise CommandError("edit: the post is not on X any more, or its page did not load")
        # A second try after a first that saved: the words are already these.
        if _words_only(_tweet_text(focal)) == _words_only(text):
            return {"done": True, "postId": current}
        if not _post_menu(page, current, "edit", "Edit"):
            raise CommandError("edit: the post's menu has no Edit, so X will not let this account change it (a free account, or the hour has passed)")
        box = _first_visible(page, [MODAL_BOX], 10_000)
        if box is None:
            raise CommandError("edit: X's edit box did not open")
        human.click(box)
        page.keyboard.press("ControlOrMeta+A")
        page.keyboard.press("Backspace")
        page.wait_for_timeout(random.randint(400, 900))
        _type_into(page, box, text, "edit")
        _check_box(box, text, "edit")
        _press_send(page, MODAL_BUTTONS, "edit", "Update")
        new_id = _after_press("edit", lambda: _created(page, graph, "edit"))
    if new_id:
        return {"done": True, "postId": new_id}

    def look():
        with _Graph(page, DETAIL_OPS) as again:
            _handle_, latest, newest, _gone_ = _newest_version(page, again, current, "edit")
        if latest is None:
            raise CommandError("edit: Update was pressed but the post's page did not load again, so the new words could not be seen")
        if _user_of(latest)["handle"].lower() == handle.lower() and _words_only(_tweet_text(latest)) == _words_only(text):
            return {"done": True, "postId": newest}
        return {"done": False, "postId": None}

    return _after_press("edit", look)


def x_delete(page, args):
    """Deletes one of the account's own posts through its menu, with a look before and after.

    Already gone counts as done and nothing is pressed. Afterwards the post
    is opened again, and only X saying it is not there counts.
    """
    post_id = _post_id(args.get("postId"), "delete")
    deleted = False
    with _Graph(page, DETAIL_OPS + ("DeleteTweet",)) as graph:
        _handle_, focal, gone = _own_post_page(page, graph, post_id, "delete")
        if gone:
            return {"done": True}
        if focal is None:
            raise CommandError("delete: X's page for the post did not load, so nothing was pressed")
        if not _post_menu(page, post_id, "delete", "Delete"):
            raise CommandError("delete: the post's menu has no Delete")
        confirm = _first_visible(page, ["[data-testid='confirmationSheetConfirm']"], 6_000)
        if confirm is None:
            raise CommandError("delete: there is no Delete to confirm")
        human.click(confirm)
        until = time.monotonic() + 15
        while time.monotonic() < until and not deleted:
            page.wait_for_timeout(800)
            graph.drain()
            deleted = any(isinstance((answer["data"].get("data") or {}).get("delete_tweet"), dict) for answer in graph.named("DeleteTweet"))
    page.wait_for_timeout(random.randint(1500, 3000))
    with _Graph(page, DETAIL_OPS) as graph:
        _goto(page, _status_url(post_id))
        _settle(page, graph, DETAIL_OPS)
        focal, _direct, gone = _conversation(graph.answers, post_id)
    if gone:
        return {"done": True}
    if focal is not None:
        return {"done": False}
    raise CommandError("delete: Delete was pressed, but X would not say whether the post went. Look on X before deleting again.")


def _follow_state(page):
    """The profile's own button: "following", "pending" (a protected account asked), "follow", or "" when there is none."""
    try:
        testid = page.evaluate(FOLLOW_SCRIPT) or ""
    except Exception:  # noqa: BLE001
        testid = ""
    if testid.endswith("-unfollow"):
        return "following"
    if testid.endswith("-cancel"):
        return "pending"
    if testid.endswith("-follow"):
        return "follow"
    return ""


def x_follow(page, args):
    """Follows one account from its own page (part 44). Already following, or asked to, is done.

    The button pressed is the profile's own Follow; its Following button,
    which unfollows, is never pressed.
    """
    handle = _handle_arg(args.get("handle"), "follow")
    try:
        _goto(page, "https://x.com/%s" % handle)
    except Exception as error:  # noqa: BLE001
        raise CommandError("follow: @%s's page would not open: %s" % (handle, _short(error)))
    deadline = time.monotonic() + 12
    state = ""
    while time.monotonic() < deadline and not state:
        page.wait_for_timeout(700)
        state = _follow_state(page)
    signs = _usable(page, "follow")
    if (signs["handle"] or "").lower() == handle.lower():
        raise CommandError("follow: that is this account itself")
    if state in ("following", "pending"):
        return {"done": True}
    if state != "follow":
        raise CommandError("follow: there is no Follow button on @%s's page (the account may not exist, or has blocked this one)" % handle)
    human.read_page(page, random.randint(300, 900))
    button = _first_visible(page, ["[data-testid='primaryColumn'] [data-testid='placementTracking'] [data-testid$='-follow']", "[data-testid='primaryColumn'] [data-testid$='-follow']"], 6_000)
    if button is None:
        raise CommandError("follow: the Follow button went before it could be pressed")
    human.click(button)
    until = time.monotonic() + 10
    while time.monotonic() < until:
        page.wait_for_timeout(800)
        if _follow_state(page) in ("following", "pending"):
            return {"done": True}
    return {"done": False}


def _lists_dialog(page, step):
    """Opens "Add/remove from Lists" from the profile's own More menu."""
    more = _first_visible(page, ["[data-testid='userActions']"], 8_000)
    if more is None:
        raise CommandError("%s: there is no More button on the account's page" % step)
    human.click(more)
    page.wait_for_timeout(random.randint(600, 1200))
    item = _first_visible(page, ["[role='menu'] [role='menuitem']:has-text('Lists')"], 5_000)
    if item is None:
        page.keyboard.press("Escape")
        raise CommandError("%s: the account's menu has no Add/remove from Lists" % step)
    human.click(item)
    page.wait_for_timeout(random.randint(1200, 2000))


LISTS_SCRIPT = """
() => {
  /* x:lists */
  const column = document.querySelector('[data-testid="primaryColumn"]') || document.body
  const lists = []
  for (const link of column.querySelectorAll('a[href*="/i/lists/"]')) {
    lists.push((link.innerText || "").split("\\n").map((line) => line.trim()).filter(Boolean))
  }
  return { lists, empty: Boolean(column.querySelector('[data-testid="emptyState"]')) }
}
"""


def _list_named(answers, drawn, name, own):
    """Whether the account's own lists page shows a list called `name`: (found, whether there was anything to look in).

    From X's list data when it came: a list with that name, and, when the
    data names its owner, owned by `own`. Otherwise from the drawn list
    links, by a line holding exactly the name. A list somebody else made
    with the same name may count too; that only stops a list being made,
    never makes a second one.
    """
    wanted = name.strip().lower()
    looked = False
    for answer in answers:
        if "List" not in answer.get("name", "") or answer.get("status", 200) >= 400:
            continue
        looked = looked or bool(_instructions(answer.get("data")))
        for node in _walk(answer.get("data")):
            if not isinstance(node.get("name"), str) or not (node.get("id_str") or node.get("rest_id")) or "mode" not in node:
                continue
            owner = _user_fields(((node.get("user_results") or {}).get("result")) or {})["handle"]
            if node["name"].strip().lower() == wanted and (not owner or owner.lower() == own.lower()):
                return True, True
    lines = (drawn or {}).get("lists") or []
    if any(line.lower() == wanted for item in lines for line in item):
        return True, True
    return False, looked or bool(lines) or bool((drawn or {}).get("empty"))


def _has_list(page, own, name, step):
    """Looks on the account's own lists page for a list called `name`. Raises when the page showed nothing to look in."""
    with _Graph(page) as graph:
        try:
            _goto(page, "https://x.com/%s/lists" % own)
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: the account's lists page would not open: %s. No list was made." % (step, _short(error)))
        deadline = time.monotonic() + SETTLE_MS / 1000
        # The page draws its lists a moment apart, so a list not there yet is
        # looked for a few times more once the first ones show.
        steady = 0
        while True:
            page.wait_for_timeout(700)
            graph.drain()
            try:
                drawn = page.evaluate(LISTS_SCRIPT) or {}
            except Exception:  # noqa: BLE001 - the page is still moving
                drawn = {}
            found, looked = _list_named(graph.answers, drawn, name, own)
            steady = steady + 1 if looked else 0
            if found or steady >= 3 or time.monotonic() >= deadline:
                break
    if not looked:
        raise CommandError("%s: the account's lists page did not load, so Promo could not look for the list %s before making it. No list was made." % (step, name))
    return found


def _list_row(page, name):
    """The row for the list with exactly this name in the lists window, or None."""
    exact = re.compile(r"(^|\n)\s*%s\s*(\n|$)" % re.escape(name))
    rows = page.locator("[role='dialog'] [data-testid='listCell'], [role='dialog'] [role='checkbox'], [role='dialog'] [role='option']").filter(has_text=exact)
    return rows.first if rows.count() else None


def _row_ticked(row):
    for attribute in ("aria-checked", "aria-selected"):
        if (row.get_attribute(attribute) or "") == "true":
            return True
    inner = row.locator("[aria-checked='true'], [data-testid='check']")
    return bool(inner.count())


def _close_dialog(page):
    page.keyboard.press("Escape")
    page.wait_for_timeout(random.randint(500, 900))


def _make_list(page, name, step):
    """Makes a public X list with this name, from X's own New List window."""
    try:
        _goto(page, "https://x.com/i/lists/create")
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: X's New List window would not open: %s" % (step, _short(error)))
    page.wait_for_timeout(random.randint(2000, 3500))
    field = _first_visible(page, ["[role='dialog'] input[name='name']", "input[name='name']"], 10_000)
    if field is None:
        raise CommandError("%s: there is no box for the list's name" % step)
    human.click(field)
    human.type_text(field, name)
    private = page.locator("[role='dialog'] input[type='checkbox']")
    # A list Promo keeps is public, so "Make private" stays off.
    if private.count() and private.first.is_checked():
        human.click(private.first)
    make = _first_visible(page, ["[role='dialog'] [role='button']:has-text('Next')", "[role='dialog'] button:has-text('Next')", "[role='dialog'] button:has-text('Create')"], 6_000)
    if make is None:
        raise CommandError("%s: there is no Next button to make the list" % step)
    human.click(make)
    page.wait_for_timeout(random.randint(2000, 3000))
    done = _first_visible(page, ["[role='dialog'] [role='button']:has-text('Done')", "[role='dialog'] button:has-text('Done')"], 6_000)
    if done is not None:
        human.click(done)
        page.wait_for_timeout(random.randint(1200, 2000))


def x_list_add(page, args):
    """Puts an account on the account's public X list called `list`, making the list the first time (part 36).

    From the account's page: its More menu, Add/remove from Lists, the list
    ticked and Save. An account already on the list is left alone, because
    pressing a ticked list takes it off. Before a list is made, the account's
    own lists page is looked at for one with that name. Checked afterwards by
    opening the lists window again.
    """
    name = (args.get("list") or "").strip()[:25] if isinstance(args.get("list"), str) else ""
    if not name:
        raise CommandError("list: the list has no name")
    handle = _handle_arg(args.get("handle"), "list")
    made = False
    for _attempt in range(2):
        try:
            _goto(page, "https://x.com/%s" % handle)
        except Exception as error:  # noqa: BLE001
            raise CommandError("list: @%s's page would not open: %s" % (handle, _short(error)))
        page.wait_for_timeout(random.randint(2500, 4000))
        own = _usable(page, "list")["handle"]
        _lists_dialog(page, "list")
        row = _list_row(page, name)
        if row is None:
            _close_dialog(page)
            if made:
                raise CommandError("list: the list %s is on this account, but X does not offer it for @%s yet" % (name, handle))
            # An earlier try may have made the list and stopped, and X can be
            # slow to offer a new list here, so the account's own lists are
            # looked at before one is made: a retry never makes a second.
            if not _has_list(page, own, name, "list"):
                _make_list(page, name, "list")
            made = True
            continue
        if _row_ticked(row):
            _close_dialog(page)
            return {"done": True}
        human.click(row)
        page.wait_for_timeout(random.randint(600, 1100))
        save = _first_visible(page, ["[role='dialog'] [role='button']:has-text('Save')", "[role='dialog'] button:has-text('Save')"], 5_000)
        if save is None:
            raise CommandError("list: there is no Save button in the lists window")
        human.click(save)
        page.wait_for_timeout(random.randint(1500, 2500))
        _lists_dialog(page, "list")
        row = _list_row(page, name)
        ticked = row is not None and _row_ticked(row)
        _close_dialog(page)
        return {"done": ticked}
    raise CommandError("list: the list %s could not be made" % name)


def _search_as_person(page, words, visit, deadline):
    """Types words into X's search box, goes to Latest, and reads for a while."""
    box = _first_visible(page, ["input[data-testid='SearchBox_Search_Input']"], 5_000)
    if box is None:
        _goto(page, "https://x.com/explore")
        box = _first_visible(page, ["input[data-testid='SearchBox_Search_Input']"], 10_000)
    if box is None:
        raise RuntimeError("X's search box did not show")
    human.click(box)
    page.keyboard.press("ControlOrMeta+A")
    page.keyboard.press("Backspace")
    human.type_text(box, words)
    page.wait_for_timeout(random.randint(400, 1000))
    page.keyboard.press("Enter")
    human.wait_for_address(page, lambda address: "/search" in address)
    page.wait_for_timeout(random.randint(1500, 3000))
    latest = _first_visible(page, ["a[role='tab'][href*='f=live']"], 6_000)
    if latest is not None:
        human.click(latest)
        page.wait_for_timeout(random.randint(1500, 3000))
    visit["_sizes"].extend(human.browse(page, random.uniform(*WARM_UP_SEARCH_SECONDS), deadline))
    if random.random() < 0.6 and time.monotonic() < deadline:
        _open_feed_post(page, visit, deadline)


def x_warm_up(page, args):
    """A warming account's day on X: the home feed with a post or two opened, then a search or two on its topic.

    Read only: nothing is liked, reposted, followed or written. `postsRead` is
    how many posts X put in front of the account on the way.
    """
    words = [word.strip()[:100] for word in (args.get("words") or []) if isinstance(word, str) and word.strip()]
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    visit = _new_visit()
    seen = set()
    with _Graph(page, HOME_OPS + DETAIL_OPS + ("SearchTimeline",)) as graph:
        _signed_in_home(page, "warm up")
        try:
            _feed(page, random.uniform(*WARM_UP_FEED_SECONDS), random.randint(*WARM_UP_POSTS), visit, deadline)
        except Exception as error:  # noqa: BLE001 - the day carries on
            visit["problems"].append("the home feed: %s" % _short(error))
        graph.drain()
        if words:
            for word in random.sample(words, min(len(words), random.randint(*WARM_UP_SEARCHES))):
                if time.monotonic() >= deadline:
                    break
                try:
                    _search_as_person(page, word, visit, deadline)
                except Exception as error:  # noqa: BLE001
                    visit["problems"].append("searching %s: %s" % (word, _short(error)))
                graph.drain()
        graph.drain()
        seen.update(graph.post_ids())
    record, scrolls = _finish_visit(visit)
    print("x warm-up: %d posts read, %d opened; %s; %s" % (len(seen), record["postsOpened"], scrolls, "; ".join(record["problems"]) or "no problems"), flush=True)
    return {"postsRead": len(seen), "problems": record["problems"]}


def _own_id(page):
    try:
        cookies = page.context.cookies("https://x.com")
    except Exception:  # noqa: BLE001
        cookies = []
    for cookie in cookies:
        if cookie.get("name") == "twid":
            return _twid_user(cookie.get("value"))
    return ""


DM_OPS = ("dm/inbox_initial_state", "dm/user_updates", "dm/inbox_timeline", "dm/conversation", "dm/new2", "dm/new")


def _dm_page(page, url, step):
    """Opens X's messages and waits for their data. Raises when the account's messages moved to X Chat."""
    graph = _Graph(page, DM_OPS)
    graph.__enter__()
    try:
        _goto(page, url)
        _settle(page, graph, DM_OPS)
        if "/i/chat" in (page.url or ""):
            raise CommandError("%s: this account's messages moved to X Chat, which Promo cannot read yet" % step)
        _usable(page, step)
        return graph
    except Exception:
        graph.__exit__()
        raise


def x_inbox(page, args=None):
    """The newest direct messages to the account, from people other than itself (part 41).

    Read from the message data X's inbox loads; group conversations are left out.
    """
    own_id = _own_id(page)
    graph = _dm_page(page, "https://x.com/messages", "inbox")
    try:
        if not graph.answers:
            raise CommandError("inbox: X's message data did not load")
        own_id = own_id or _own_id(page)
        if not own_id:
            raise CommandError("inbox: this browser is not signed in to X")
        return {"messages": _messages_from_data(graph.answers, own_id)}
    finally:
        graph.__exit__()


def _conversation_with(page, handle):
    """Opens the conversation with @handle: from their page's Message button, or else from the inbox.

    Returns the listening graph, with the conversation's data heard. Raises
    when neither way reaches a conversation with them.
    """
    try:
        _goto(page, "https://x.com/%s" % handle)
    except Exception as error:  # noqa: BLE001
        raise CommandError("message: @%s's page would not open: %s" % (handle, _short(error)))
    page.wait_for_timeout(random.randint(2000, 3500))
    signs = _usable(page, "message")
    if (signs["handle"] or "").lower() == handle.lower():
        raise CommandError("message: that is this account itself")
    button = _first_visible(page, ["[data-testid='sendDMFromProfile']", "[aria-label='Message']"], 6_000)
    graph = _Graph(page, DM_OPS)
    graph.__enter__()
    try:
        if button is not None:
            human.click(button)
            human.wait_for_address(page, lambda address: "/messages/" in address or "/i/chat" in address)
            _settle(page, graph, ("dm/conversation",))
        else:
            # Their page offers no Message button (they take messages only
            # from people they follow), but a conversation they started is
            # still in the inbox.
            _goto(page, "https://x.com/messages")
            _settle(page, graph, DM_OPS)
            own_id = _own_id(page)
            found = next((item["conversationId"] for item in _messages_from_data(graph.answers, own_id) if item["handle"].lower() == handle.lower()), "")
            if not found:
                raise CommandError("message: @%s's page has no Message button and there is no conversation with them in the inbox, so X will not let this account write to them" % handle)
            _goto(page, "https://x.com/messages/%s" % _conversation_id(found, "message"))
            _settle(page, graph, ("dm/conversation",))
        if "/i/chat" in (page.url or ""):
            raise CommandError("message: this account's messages moved to X Chat, which Promo cannot write in yet")
        return graph
    except Exception:
        graph.__exit__()
        raise


def x_message(page, args):
    """One answer to @handle in direct messages (part 41). Only ever called after a person pressed Send.

    The Messages dashboard keys an X conversation by the other person's
    handle, so the conversation is opened from their page's Message button,
    or found in the inbox when their page has none. Looks first: if the
    account's newest message in that conversation has these words and went in
    the last hour, it counts as sent and nothing is typed. Only messages X
    files under the open conversation count (its id from the page's address
    `/messages/<id>`, or from X's `dm/conversation` data), and the look needs
    that conversation's own messages, in X's data or drawn on screen: the
    inbox's badge poll (`dm/user_updates`) is not a look. Afterwards the
    answer to the send, or the conversation on screen, must show it.
    """
    handle = _handle_arg(args.get("handle"), "message")
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    if not text:
        raise CommandError("message: no words to send")
    graph = _conversation_with(page, handle)
    try:
        own_id = _own_id(page)
        if not own_id:
            raise CommandError("message: this browser is not signed in to X")
        conversation = _open_conversation(page.url, graph.answers)
        mine = _own_messages(graph.answers, own_id, conversation)
        if _said_lately(mine, text):
            return {"done": True}
        # The data may not have come. The drawn conversation is looked in
        # then, and with nothing drawn either there is nothing to look in: an
        # answer only ever goes to somebody who wrote first, so an empty
        # conversation means it did not load.
        try:
            drawn = page.locator("[data-testid='messageEntry']").all_inner_texts()[-3:]
        except Exception:  # noqa: BLE001
            drawn = []
        if any(_same_words_in(text, entry) for entry in drawn):
            return {"done": True}
        if not _messages_of(graph.answers, conversation) and not drawn:
            raise CommandError(
                "message: X's messages did not load, so Promo could not look for an earlier answer. Nothing was typed."
            )
        box = _first_visible(page, ["[data-testid='dmComposerTextInput']"], 10_000)
        if box is None:
            raise CommandError("message: there is no message box in the conversation (X may not let this account write to them)")
        _type_into(page, box, text, "message")
        _check_box(box, text, "message", "Nothing was sent.")
        send = _first_visible(page, ["[data-testid='dmComposerSendButton']"], 5_000)
        if send is None:
            raise CommandError("message: there is no Send button under the words. Nothing was sent.")
        before = {item[0] for item in mine}
        human.click(send)
        until = time.monotonic() + LANDED_WAIT_SECONDS
        while time.monotonic() < until:
            page.wait_for_timeout(800)
            graph.drain()
            fresh = [item for item in _own_messages(graph.answers, own_id, conversation or _open_conversation(page.url, graph.answers)) if item[0] not in before]
            if any(_same_words(text, item[1]) for item in fresh):
                return {"done": True}
            try:
                last = page.locator("[data-testid='messageEntry']").last.inner_text(timeout=2_000)
            except Exception:  # noqa: BLE001
                last = ""
            if _same_words_in(text, last):
                return {"done": True}
        raise CommandError("message: Send was pressed but the message does not show in the conversation yet. It may already be sent; look before sending again.")
    finally:
        graph.__exit__()


# What this network can be asked to do. The package's __init__ prefixes each
# name with "x.", and a name nobody registered is refused.
ROUTINES = {
    "state": x_state,
    "quick_state": x_state_quick,
    "enter_code": x_enter_code,
    "search": x_search,
    "post": x_post,
    "check": x_check,
    "mentions": x_mentions,
    "trends": x_trends,
    "lookup": x_lookup,
    "community": x_community,
    "reach": x_reach,
    "reply": x_reply,
    "quote": x_quote,
    "publish": x_publish,
    "edit": x_edit,
    "delete": x_delete,
    "follow": x_follow,
    "warm_up": x_warm_up,
    "list_add": x_list_add,
    "inbox": x_inbox,
    "message": x_message,
}
