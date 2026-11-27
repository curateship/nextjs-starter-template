"""What the browser actually does on YouTube.

The only file in the app that knows how a YouTube page is put together, the
way `x.py` is for X and `linkedin.py` for LinkedIn. When YouTube redesigns,
the fix is here, and every page detail sits in the one `SELECTORS` block
below. The shape of every answer is in `src/server/social/youtube/calls.ts`;
on a phone the same names reach the YouTube app's steps in
`rack/promo_rack.py`. The task is `workspace/tasks/YouTube/01-youtube-features.md`.

Every routine takes the live Playwright page and returns plain data the
TypeScript side stores. None of them touch the database or decide what to
write: the app does that, and only after a person pressed a button.

- `state` and `quick_state`: who is signed in, read off the page's own
  settings (`ytcfg`'s `LOGGED_IN`) and the channel's own address
  (`youtube.com/@handle`), and YouTube's words for a strike, a terminated
  channel or a "verify it's you" page, which stop the channel (part 2).
  `quick_state` never moves the page.
- `upload`: the file downloaded from Promo's own https address, YouTube
  Studio's upload window, the title, description and tags typed at a
  person's pace, the thumbnail, "No, it's not made for kids", YouTube's
  altered or synthetic content question answered with the tick from New
  post, Public, and Save, once the file has finished uploading (parts 3, 4
  and 7). A Short is uploaded the same way: YouTube makes a tall video of
  three minutes or less a Short by itself.
- `health`: the channel's subscribers and videos off its own page, each
  named video's views, likes and comments, and the newest comments under them
  (parts 8 and 9).
- `inbox` and `reply`: the comments under the channel's newest videos, and
  one answer typed under one comment, never with a link (Tyler, 26 Nov 2026:
  "Never a link").

What has been proved: nothing yet against the live site. Every routine here
was written on 26 Nov 2026 from how YouTube and YouTube Studio pages are put
together, with no channel to sign in with, and the first run with a real
signed-in channel is their test. The readers around them are proved by
`test_youtube.py`. Each routine says which step failed when it fails.
"""

import http.client
import ipaddress
import os
import random
import re
import socket
import ssl
import tempfile
import time
import urllib.parse

import human

NAV_TIMEOUT_MS = 45_000

HOME = "https://www.youtube.com/"
# YouTube sends a signed-in visitor here on to their own channel's /@handle.
OWN_CHANNEL = "https://www.youtube.com/profile"
UPLOAD = "https://www.youtube.com/upload"

YOUTUBE_HOSTS = {"youtube.com", "www.youtube.com", "m.youtube.com", "studio.youtube.com"}

# Every page detail YouTube and YouTube Studio are read and driven by.
SELECTORS = {
    "sign_in_button": "a[href*='accounts.google.com/ServiceLogin'], ytd-button-renderer a[aria-label='Sign in']",
    "file_input": "input[type='file'][name='Filedata'], ytcp-uploads-file-picker input[type='file']",
    "title_box": "#title-textarea #textbox, ytcp-social-suggestions-textbox[label*='Title'] #textbox",
    "description_box": "#description-textarea #textbox, ytcp-social-suggestions-textbox[label*='Description'] #textbox",
    "thumbnail_input": "#still-picker input[type='file'], ytcp-thumbnail-uploader input[type='file'], #file-loader",
    "thumbnail_problem": "ytcp-thumbnails-compact-editor-uploader .error, #thumbnail-editor-message, ytcp-feature-eligibility-dialog",
    "not_for_kids": "tp-yt-paper-radio-button[name='VIDEO_MADE_FOR_KIDS_NOT_MFK']",
    "show_more": "#toggle-button, ytcp-button#toggle-button",
    "altered_yes": "tp-yt-paper-radio-button[name='VIDEO_HAS_ALTERED_CONTENT_YES']",
    "altered_no": "tp-yt-paper-radio-button[name='VIDEO_HAS_ALTERED_CONTENT_NO']",
    "tags_box": "#tags-container input, ytcp-free-text-chip-bar input, input[aria-label='Tags']",
    "next_button": "#next-button",
    "public": "tp-yt-paper-radio-button[name='PUBLIC']",
    "done_button": "#done-button",
    "progress": "ytcp-video-upload-progress .progress-label, .progress-label.ytcp-video-upload-progress",
    "video_link": "ytcp-video-info a.ytcp-video-info, .video-url-fadeable a, a[href*='youtu.be/']",
    "close_after": "ytcp-button#close-button, ytcp-uploads-still-processing-dialog #close-button",
    "comments_section": "ytd-comments#comments, #comments",
    "comment_thread": "ytd-comment-thread-renderer",
    "comment_author": "#author-text",
    "comment_text": "#content-text",
    "reply_button": "#reply-button-end button, ytd-button-renderer#reply-button-end",
    "reply_box": "#contenteditable-root",
    "reply_submit": "#submit-button button, ytd-button-renderer#submit-button",
}

# A YouTube upload is a big file: up to 5 GB, the most the Archive keeps, in
# up to 30 minutes, from Promo's own https address only.
VIDEO_MAX_BYTES = 5 * 1024 ** 3
VIDEO_SECONDS = 30 * 60
PICTURE_MAX_BYTES = 2 * 1024 * 1024
PICTURE_SECONDS = 60
MEDIA_CHUNK_BYTES = 256 * 1024
VIDEO_TYPES = {
    "video/mp4": ".mp4",
    "video/quicktime": ".mov",
    "video/webm": ".webm",
    "video/x-msvideo": ".avi",
    "video/x-matroska": ".mkv",
    "video/mpeg": ".mpg",
}
PICTURE_TYPES = {"image/jpeg": ".jpg", "image/jpg": ".jpg", "image/png": ".png"}

# The launcher allows `youtube.upload` 2,400 seconds (`launch.py`). The file
# must be in and YouTube must say so with time left to press Save.
UPLOAD_BUDGET_SECONDS = 2_250

# The most comments one read keeps, and the most from one video.
COMMENTS_PER_VIDEO = 10
COMMENTS_LIMIT = 50
# The newest videos `inbox` reads the comments of.
INBOX_VIDEOS = 5
COMMENT_TEXT_CHARS = 2_000

# YouTube's own words on a screen that stops the channel (part 2).
BAN_PHRASES = (
    "this channel was terminated",
    "your channel has been terminated",
    "this account has been terminated",
    "your channel has been suspended",
    "your account has been disabled",
    "community guidelines strike",
    "your channel received a strike",
    "copyright strike",
    "verify it's you",
    "confirm it's you",
)
BAN_LINE_CHARS = 120
CHECK_PHRASES = ("verify that it's you", "to continue, verify", "unusual traffic from your computer network")

NOT_LOOKED = {"checked": False, "handle": None, "blocked": False, "reason": "", "banScreen": None}

PLAIN_MARKS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " "})

SIGNS_SCRIPT = """() => {
  const cfg = (window.ytcfg && typeof window.ytcfg.get === 'function') ? window.ytcfg : null
  const loggedIn = cfg ? cfg.get('LOGGED_IN') : null
  const handleLink = document.querySelector("a[href^='/@'], a[href*='youtube.com/@']")
  return {
    host: location.hostname,
    path: location.pathname,
    loggedIn: loggedIn === true ? true : loggedIn === false ? false : null,
    signInButton: !!document.querySelector("a[href*='accounts.google.com/ServiceLogin']"),
    text: (document.body && document.body.innerText || '').slice(0, 20000),
    ownHandleHref: handleLink && location.pathname.startsWith('/@') ? location.pathname : '',
  }
}"""

CHANNEL_SCRIPT = """() => ({
  text: (document.body && document.body.innerText || '').slice(0, 20000),
  path: location.pathname,
})"""

VIDEO_SCRIPT = """() => {
  const meta = (name) => { const tag = document.querySelector(`meta[itemprop='${name}']`); return tag ? tag.getAttribute('content') : '' }
  const like = document.querySelector("like-button-view-model button, #segmented-like-button button, ytd-toggle-button-renderer button")
  const count = document.querySelector("ytd-comments-header-renderer #count, ytd-comments-header-renderer h2")
  const title = document.querySelector("h1.ytd-watch-metadata, ytd-watch-metadata h1, h1.title")
  return {
    views: meta('interactionCount'),
    likeLabel: like ? (like.getAttribute('aria-label') || '') : '',
    commentsLabel: count ? count.innerText : '',
    title: title ? title.innerText : document.title.replace(/ - YouTube$/, ''),
  }
}"""

COMMENTS_SCRIPT = """(limit) => Array.from(document.querySelectorAll('ytd-comment-thread-renderer')).slice(0, limit).map((thread) => {
  const author = thread.querySelector('#author-text')
  const text = thread.querySelector('#content-text')
  return { author: author ? author.innerText : '', text: text ? text.innerText : '' }
})"""

VIDEO_LINKS_SCRIPT = """(limit) => Array.from(document.querySelectorAll("ytd-rich-item-renderer a#video-title-link, ytd-grid-video-renderer a#video-title, a#video-title-link"))
  .slice(0, limit).map((link) => ({ href: link.href, title: link.getAttribute('title') || link.innerText || '' }))"""


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


def _short(error):
    return (str(error) or error.__class__.__name__).splitlines()[0][:200]


def _plain(text):
    return re.sub(r"\s+", " ", (text or "").translate(PLAIN_MARKS)).strip().lower()


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


def _on_youtube(page):
    return (urllib.parse.urlparse(page.url or "").hostname or "") in YOUTUBE_HOSTS


# --- Small readers, each tested on its own -------------------------------


def _number(text):
    """YouTube's way of writing a count as a number: "1,234", "1.2K", "3M", "No". None when it says nothing."""
    plain = (text or "").strip().replace(",", "").replace(" ", " ")
    if re.match(r"^(no|none)\b", plain, re.I):
        return 0
    found = re.match(r"^(\d+(?:\.\d+)?)\s*([KkMmBb])?", plain)
    if not found:
        return None
    value = float(found.group(1))
    scale = {"k": 1_000, "m": 1_000_000, "b": 1_000_000_000}.get((found.group(2) or "").lower(), 1)
    return int(round(value * scale))


def _count_before(text, word):
    """The count written just before `word` ("1.2K subscribers", "48 videos"), or None."""
    found = re.search(r"(\d[\d.,]*\s*[KkMmBb]?)\s+" + word, text or "", re.I)
    return _number(found.group(1)) if found else None


def _likes_from_label(label):
    """The likes in a like button's label: "like this video along with 1,234 other people"."""
    found = re.search(r"along with ([\d.,]+[KkMm]?) other", label or "", re.I) or re.search(r"([\d.,]+[KkMm]?)\s+likes?", label or "", re.I)
    return _number(found.group(1)) if found else None


def _handle_from_path(path):
    """The handle in a channel's own address, "/@pomoder/videos" -> "pomoder", or None."""
    found = re.match(r"^/@([A-Za-z0-9._-]{3,100})(?:/|$)", path or "")
    return found.group(1) if found else None


def _ban_line(line):
    plain = _plain(line).rstrip(".")
    return any(plain == phrase or (plain.startswith(phrase) and len(plain) <= BAN_LINE_CHARS) for phrase in BAN_PHRASES)


def _ban_words(text):
    """YouTube's own words on a strike, terminated or "verify it's you" screen, or None."""
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for index, line in enumerate(lines):
        if _ban_line(line):
            words = line
            if index + 1 < len(lines) and len(lines[index + 1]) > 20:
                words = "%s %s" % (line, lines[index + 1])
            return words[:300]
    return None


def _judge(raw):
    """What the page's signs mean: who is signed in, and what is in the way. Pure, so it is tested."""
    host = raw.get("host") or ""
    out = dict(NOT_LOOKED)
    if host not in YOUTUBE_HOSTS:
        return out
    text = raw.get("text") or ""
    plain = _plain(text)
    ban = _ban_words(text)
    if ban:
        out.update(checked=True, blocked=True, reason=ban, banScreen=ban)
        return out
    if any(phrase in plain for phrase in CHECK_PHRASES):
        out.update(checked=True, blocked=True, reason="YouTube is asking the browser to prove who it is")
        return out
    logged_in = raw.get("loggedIn")
    if logged_in is False or (logged_in is None and raw.get("signInButton")):
        out.update(checked=True, handle=None)
        return out
    handle = _handle_from_path(raw.get("ownHandleHref") or "")
    if logged_in and handle:
        out.update(checked=True, handle=handle)
    # Signed in with no handle on screen: nothing is written down either way.
    return out


def _clean_comment(author, text, own_handle):
    """A comment as Promo keeps it, or None for the channel's own and empty ones."""
    who = re.sub(r"\s+", " ", author or "").strip()
    words = re.sub(r"\s+", " ", text or "").strip()[:COMMENT_TEXT_CHARS]
    if not who or not words:
        return None
    if own_handle and who.lstrip("@").lower() == own_handle.lower():
        return None
    return {"author": who, "text": words}


def _signs(page):
    try:
        raw = page.evaluate(SIGNS_SCRIPT) or {}
    except Exception:  # noqa: BLE001 - a page moving under us reads as "not looked at"
        raw = {}
    return _judge(raw)


def _first_visible(scope, selectors, timeout_ms):
    """The first of these shapes on screen, or None. Each is tried in turn."""
    if isinstance(selectors, str):
        selectors = [selectors]
    deadline = time.monotonic() + timeout_ms / 1000
    while True:
        for selector in selectors:
            locator = scope.locator(selector)
            try:
                count = locator.count()
            except Exception:  # noqa: BLE001
                count = 0
            for index in range(min(count, 6)):
                item = locator.nth(index)
                try:
                    if item.is_visible():
                        return item
                except Exception:  # noqa: BLE001
                    continue
        if time.monotonic() >= deadline:
            return None
        # A page waits through Playwright, so its own events keep running; a locator has no wait of its own.
        if hasattr(scope, "wait_for_timeout"):
            scope.wait_for_timeout(400)
        else:
            time.sleep(0.4)


def _usable(page, step):
    """Refuses to go on when the channel is not signed in or a ban or check screen is in the way."""
    signs = _signs(page)
    if signs["banScreen"]:
        raise CommandError("%s: YouTube shows this on the channel: %s" % (step, signs["banScreen"]))
    if signs["blocked"]:
        raise CommandError("%s: %s" % (step, signs["reason"]))
    if signs["checked"] and not signs["handle"]:
        raise CommandError("%s: the browser is not signed in to YouTube" % step)
    return signs


# --- Who is signed in -----------------------------------------------------


def youtube_state_quick(page, args=None):
    """Who is signed in, and whether a ban or check screen is on screen, without moving the page."""
    if not _on_youtube(page):
        return dict(NOT_LOOKED)
    deadline = time.monotonic() + 4
    while True:
        signs = _signs(page)
        if signs["checked"] or time.monotonic() >= deadline:
            return signs
        page.wait_for_timeout(500)


def youtube_state(page, args=None):
    """The full look: YouTube's front page, then the channel's own page for its handle."""
    try:
        _goto(page, HOME)
        page.wait_for_timeout(random.randint(2000, 3500))
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        return dict(NOT_LOOKED, reason=_short(error))
    signs = _signs(page)
    # A ban or check screen, or plainly signed out: that is the answer. Signed in, the handle is on the channel's own page.
    if signs["blocked"] or (signs["checked"] and not signs["handle"]):
        return signs
    try:
        _goto(page, OWN_CHANNEL)
        human.wait_for_address(page, lambda url: "/@" in url, 15_000)
    except Exception as error:  # noqa: BLE001
        print("youtube state: the channel's own page would not open: %s" % _short(error), flush=True)
    return youtube_state_quick(page)


# --- Files ----------------------------------------------------------------


class _PinnedHTTPS(http.client.HTTPSConnection):
    """An https connection to one address already checked, its certificate still checked against the host's name."""

    def __init__(self, host, address, port, timeout):
        self._checked_tls = ssl.create_default_context()
        http.client.HTTPSConnection.__init__(self, host, port, timeout=timeout, context=self._checked_tls)
        self._address = address
        self.pinned = None

    def connect(self):
        sock = socket.create_connection((self._address, self.port), self.timeout)
        self.sock = self.pinned = self._checked_tls.wrap_socket(sock, server_hostname=self.host)


def _public_address(host, port, step):
    """The first address a file's host names, after checking every one is out on the internet."""
    try:
        found = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the file's address would not resolve: %s" % (step, _short(error)))
    addresses = [item[4][0] for item in found]
    if not addresses:
        raise CommandError("%s: the file's address would not resolve" % step)
    for address in addresses:
        ip = ipaddress.ip_address(address.split("%")[0])
        if not ip.is_global or ip.is_multicast:
            raise CommandError("%s: the file's address is not out on the internet, so it was not downloaded" % step)
    return addresses[0]


def _media_file(url, step, types, max_bytes, seconds, what):
    """Downloads one of Promo's own files for YouTube's file box, and returns its path.

    Only https, only to a public address, with no redirect followed, only a
    type YouTube takes, no bigger than the limit, and within its time.
    """
    parsed = urllib.parse.urlparse(url or "")
    if parsed.scheme != "https" or not parsed.hostname:
        raise CommandError("%s: the %s's address must start with https://" % (step, what))
    try:
        port = parsed.port or 443
    except ValueError:
        raise CommandError("%s: the %s's address has a port that is not a number" % (step, what)) from None
    deadline = time.monotonic() + seconds
    address = _public_address(parsed.hostname, port, step)
    path = (parsed.path or "/") + ("?" + parsed.query if parsed.query else "")
    connection = _PinnedHTTPS(parsed.hostname, address, port, timeout=20)
    file_path = None
    try:
        connection.request("GET", path, headers={"user-agent": "Promo/1"})
        answer = connection.getresponse()
        if 300 <= answer.status < 400:
            raise CommandError("%s: the %s's address sends the download somewhere else, which Promo does not follow" % (step, what))
        if answer.status != 200:
            raise CommandError("%s: the %s would not download: the address answered %d" % (step, what, answer.status))
        kind = answer.headers.get_content_type()
        if kind not in types:
            raise CommandError("%s: the %s is %s, which YouTube does not take" % (step, what, kind))
        handle, file_path = tempfile.mkstemp(prefix="promo-youtube-", suffix=types[kind])
        size = 0
        with os.fdopen(handle, "wb") as out:
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    raise CommandError("%s: the %s took longer than %d minutes to download" % (step, what, seconds // 60))
                if connection.pinned is not None:
                    connection.pinned.settimeout(left)
                chunk = answer.read(MEDIA_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise CommandError("%s: the %s is bigger than Promo sends to YouTube" % (step, what))
                out.write(chunk)
    except CommandError:
        if file_path:
            os.unlink(file_path)
        raise
    except Exception as error:  # noqa: BLE001
        if file_path:
            os.unlink(file_path)
        raise CommandError("%s: the %s would not download: %s" % (step, what, _short(error)))
    finally:
        connection.close()
    return file_path


# --- Upload ---------------------------------------------------------------


def _type_long(page, field, text):
    """Puts a long description in a paragraph at a time, with a person's pauses, as LinkedIn's newsletter does."""
    human.click(field)
    for index, paragraph in enumerate(text.split("\n")):
        if index:
            page.keyboard.press("Enter")
        if paragraph:
            page.keyboard.insert_text(paragraph)
        page.wait_for_timeout(random.randint(250, 900))


def _clear_and_type(page, field, text, long=False):
    human.click(field)
    page.keyboard.press("Control+A")
    page.keyboard.press("Delete")
    if long:
        _type_long(page, field, text)
    else:
        human.type_text(field, text)


def _upload_done(page):
    """True once YouTube says the file is in: "Upload complete", or checks or processing begun."""
    label = _first_visible(page, [SELECTORS["progress"]], 1_000)
    words = _plain(label.inner_text()) if label is not None else ""
    return any(phrase in words for phrase in ("upload complete", "checks complete", "processing", "checking"))


def _args_text(args, key, limit):
    value = args.get(key)
    return value[:limit] if isinstance(value, str) else ""


def youtube_upload(page, args):
    """Uploads one video with its words, Public, once. Only ever called after a person pressed Post."""
    step = "upload"
    started = time.monotonic()
    title = _args_text(args, "title", 100).strip()
    description = _args_text(args, "description", 5_000)
    tags = [tag for tag in (args.get("tags") or []) if isinstance(tag, str) and tag.strip()][:60]
    if not title:
        raise CommandError("%s: the video has no title" % step)
    # Signed in first, so a signed-out browser never waits on a 5 GB download.
    try:
        _goto(page, UPLOAD)
        page.wait_for_timeout(random.randint(2500, 4000))
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: YouTube Studio's upload page would not open: %s" % (step, _short(error)))
    if not _on_youtube(page):
        raise CommandError("%s: the browser is not signed in to YouTube, so YouTube sent it to sign in" % step)
    _usable(page, step)
    video_path = _media_file(args.get("mediaUrl"), step, VIDEO_TYPES, VIDEO_MAX_BYTES, VIDEO_SECONDS, "video")
    thumbnail_path = None
    try:
        if args.get("thumbnailUrl"):
            thumbnail_path = _media_file(args.get("thumbnailUrl"), step, PICTURE_TYPES, PICTURE_MAX_BYTES, PICTURE_SECONDS, "thumbnail")
        picker = page.locator(SELECTORS["file_input"]).first
        try:
            picker.set_input_files(video_path, timeout=30_000)
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: YouTube Studio's upload window did not take the file: %s" % (step, _short(error)))

        title_box = _first_visible(page, [SELECTORS["title_box"]], 60_000)
        if title_box is None:
            raise CommandError("%s: YouTube Studio did not show the video's details after the file was picked" % step)
        _clear_and_type(page, title_box, title)
        if description:
            box = _first_visible(page, [SELECTORS["description_box"]], 10_000)
            if box is None:
                raise CommandError("%s: YouTube Studio showed no description box" % step)
            _clear_and_type(page, box, description, long=True)

        thumbnail_set, thumbnail_note = None, ""
        if thumbnail_path:
            thumbnail_set, thumbnail_note = _set_thumbnail(page, thumbnail_path)

        kids = _first_visible(page, [SELECTORS["not_for_kids"]], 15_000)
        if kids is None:
            raise CommandError("%s: YouTube Studio did not ask whether the video is made for kids" % step)
        human.click(kids)
        more = _first_visible(page, [SELECTORS["show_more"]], 5_000)
        if more is not None:
            human.click(more)
            page.wait_for_timeout(random.randint(600, 1200))
        altered = _first_visible(page, [SELECTORS["altered_yes" if args.get("aiMade") else "altered_no"]], 8_000)
        if altered is None:
            raise CommandError("%s: YouTube Studio did not ask about altered or synthetic content" % step)
        human.click(altered)
        if tags:
            box = _first_visible(page, [SELECTORS["tags_box"]], 8_000)
            if box is None:
                raise CommandError("%s: YouTube Studio showed no tags box" % step)
            human.click(box)
            human.type_text(box, ",".join(tags) + ",")

        # Details, then Video elements, then Checks, then Visibility.
        for _ in range(3):
            button = _first_visible(page, [SELECTORS["next_button"]], 15_000)
            if button is None:
                raise CommandError("%s: YouTube Studio's Next button did not show" % step)
            human.click(button)
            page.wait_for_timeout(random.randint(900, 1800))
        public = _first_visible(page, [SELECTORS["public"]], 15_000)
        if public is None:
            raise CommandError("%s: YouTube Studio did not offer Public" % step)
        human.click(public)

        # Save before the file is in would leave YouTube waiting on a browser that is about to close.
        while not _upload_done(page):
            if time.monotonic() - started > UPLOAD_BUDGET_SECONDS:
                raise CommandError("%s: the file was still uploading when the time ran out. Nothing was saved; look in YouTube Studio before trying again" % step)
            page.wait_for_timeout(5_000)

        link = _video_link(page)
        human.pause_before_submit(page)
        done = _first_visible(page, [SELECTORS["done_button"]], 10_000)
        if done is None:
            raise CommandError("%s: YouTube Studio's Save button did not show. It may be in Studio as a draft; look there before trying again" % step)
        human.click(done)
        page.wait_for_timeout(random.randint(2500, 4000))
        close = _first_visible(page, [SELECTORS["close_after"]], 4_000)
        if close is not None:
            human.click(close)
        return {"postUrl": link, "thumbnailSet": thumbnail_set, "thumbnailNote": thumbnail_note}
    finally:
        for path in (video_path, thumbnail_path):
            if path:
                try:
                    os.unlink(path)
                except OSError:
                    pass


def _set_thumbnail(page, path):
    """Sets the thumbnail, and says whether it took and, when not, YouTube's words. Never stops the upload."""
    picker = page.locator(SELECTORS["thumbnail_input"]).first
    try:
        picker.set_input_files(path, timeout=10_000)
    except Exception as error:  # noqa: BLE001 - an unverified channel has no thumbnail box at all
        return False, "YouTube showed no thumbnail box (%s). A channel must be verified with a phone number to set its own." % _short(error)
    page.wait_for_timeout(random.randint(2000, 3500))
    problem = _first_visible(page, [SELECTORS["thumbnail_problem"]], 1_500)
    if problem is not None:
        words = re.sub(r"\s+", " ", problem.inner_text() or "").strip()[:300]
        return False, words or "YouTube did not take the thumbnail."
    return True, ""


def _video_link(page):
    """The new video's link off Studio's window, or "" when it would not show."""
    link = _first_visible(page, [SELECTORS["video_link"]], 10_000)
    if link is None:
        return ""
    try:
        href = link.get_attribute("href") or link.inner_text() or ""
    except Exception:  # noqa: BLE001
        return ""
    found = re.search(r"youtu\.be/([A-Za-z0-9_-]{6,20})", href) or re.search(r"[?&]v=([A-Za-z0-9_-]{6,20})", href) or re.search(r"/shorts/([A-Za-z0-9_-]{6,20})", href)
    return "https://www.youtube.com/watch?v=%s" % found.group(1) if found else ""


# --- Reading the channel --------------------------------------------------


def _video_id(url):
    found = re.search(r"[?&]v=([A-Za-z0-9_-]{6,20})", url or "") or re.search(r"/shorts/([A-Za-z0-9_-]{6,20})", url or "") or re.search(r"youtu\.be/([A-Za-z0-9_-]{6,20})", url or "")
    return found.group(1) if found else None


def _read_comments(page, own_handle, limit):
    """The comments drawn under the open video, newest as YouTube orders them, the channel's own left out."""
    section = _first_visible(page, [SELECTORS["comments_section"]], 6_000)
    if section is None:
        return []
    try:
        section.scroll_into_view_if_needed(timeout=5_000)
    except Exception:  # noqa: BLE001
        pass
    for _ in range(3):
        human.scroll_once(page)
        page.wait_for_timeout(random.randint(800, 1500))
    try:
        raw = page.evaluate(COMMENTS_SCRIPT, limit * 2) or []
    except Exception:  # noqa: BLE001
        raw = []
    out = []
    for item in raw:
        comment = _clean_comment(item.get("author"), item.get("text"), own_handle)
        if comment:
            out.append(comment)
        if len(out) >= limit:
            break
    return out


def _read_video(page, url, own_handle, with_comments):
    """One video's numbers, its title, and the newest comments under it when asked for."""
    _goto(page, url)
    page.wait_for_timeout(random.randint(2500, 4000))
    try:
        raw = page.evaluate(VIDEO_SCRIPT) or {}
    except Exception:  # noqa: BLE001
        raw = {}
    title = re.sub(r"\s+", " ", raw.get("title") or "").strip()[:200]
    numbers = {
        "url": url,
        "views": _number(raw.get("views") or ""),
        "likes": _likes_from_label(raw.get("likeLabel") or ""),
        "comments": _count_before(raw.get("commentsLabel") or "", "comments") if raw.get("commentsLabel") else None,
    }
    comments = [dict(comment, thread=title or "One of its videos") for comment in _read_comments(page, own_handle, COMMENTS_PER_VIDEO)] if with_comments else []
    return numbers, comments


def youtube_health(page, args):
    """The daily reading: subscribers, videos, each named video's numbers and the newest comments under them."""
    step = "health"
    try:
        _goto(page, OWN_CHANNEL)
        human.wait_for_address(page, lambda url: "/@" in url, 15_000)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the channel's own page would not open: %s" % (step, _short(error)))
    signs = _signs(page)
    if signs["banScreen"]:
        return {"handle": None, "subscribers": None, "videos": None, "verified": None, "numbers": [], "comments": [], "banScreen": signs["banScreen"]}
    if signs["blocked"]:
        raise CommandError("%s: %s" % (step, signs["reason"]))
    handle = signs["handle"]
    if not handle:
        raise CommandError("%s: the browser is not signed in to YouTube, so there is no channel to read" % step)
    raw = page.evaluate(CHANNEL_SCRIPT) or {}
    text = raw.get("text") or ""
    answer = {
        "handle": handle,
        "subscribers": _count_before(text, "subscribers?"),
        "videos": _count_before(text, "videos?"),
        "verified": None,
        "numbers": [],
        "comments": [],
        "banScreen": None,
    }
    urls = [url for url in (args.get("videoUrls") or []) if isinstance(url, str) and _video_id(url)][:20]
    for url in urls:
        try:
            numbers, comments = _read_video(page, url, handle, len(answer["comments"]) < COMMENTS_LIMIT)
        except Exception as error:  # noqa: BLE001 - one video that will not open never loses the rest
            print("youtube health: %s would not read: %s" % (url, _short(error)), flush=True)
            continue
        answer["numbers"].append(numbers)
        answer["comments"].extend(comments[: COMMENTS_LIMIT - len(answer["comments"])])
    return answer


def youtube_inbox(page, args):
    """The comments under the channel's newest videos, in the shape the phones answer."""
    step = "inbox"
    if (args.get("kind") or "comment") != "comment":
        raise CommandError("%s: YouTube has no direct messages" % step)
    try:
        _goto(page, OWN_CHANNEL)
        human.wait_for_address(page, lambda url: "/@" in url, 15_000)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the channel's own page would not open: %s" % (step, _short(error)))
    signs = _usable(page, step)
    handle = signs["handle"] or (args.get("handle") or "")
    _goto(page, "https://www.youtube.com/@%s/videos" % handle)
    page.wait_for_timeout(random.randint(2000, 3500))
    try:
        videos = page.evaluate(VIDEO_LINKS_SCRIPT, INBOX_VIDEOS) or []
    except Exception:  # noqa: BLE001
        videos = []
    comments = []
    for video in videos:
        if not _video_id(video.get("href")):
            continue
        try:
            _numbers, found = _read_video(page, video["href"], handle, True)
        except Exception as error:  # noqa: BLE001
            print("youtube inbox: a video would not read: %s" % _short(error), flush=True)
            continue
        comments.extend(found)
        if len(comments) >= COMMENTS_LIMIT:
            break
    return {"conversations": [], "comments": comments[:COMMENTS_LIMIT]}


def youtube_reply(page, args):
    """Answers one comment under one of the channel's videos. Only ever after a person pressed Send."""
    step = "reply"
    text = _args_text(args, "text", 1_000).strip()
    thread = _args_text(args, "thread", 200).strip()
    author = _args_text(args, "author", 120).strip()
    quote = _args_text(args, "quote", 2_000).strip()
    if not text or not author:
        raise CommandError("%s: the answer or the comment it answers is missing" % step)
    if re.search(r"(https?://|www\.)\S+", text, re.I):
        raise CommandError("%s: an answer under a YouTube video never carries a link" % step)
    try:
        _goto(page, OWN_CHANNEL)
        human.wait_for_address(page, lambda url: "/@" in url, 15_000)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the channel's own page would not open: %s" % (step, _short(error)))
    signs = _usable(page, step)
    _goto(page, "https://www.youtube.com/@%s/videos" % signs["handle"])
    page.wait_for_timeout(random.randint(2000, 3500))
    videos = page.evaluate(VIDEO_LINKS_SCRIPT, 30) or []
    target = next((video for video in videos if _plain(video.get("title")) == _plain(thread)), None)
    if target is None:
        raise CommandError("%s: the video \"%s\" is not on the channel's Videos tab" % (step, thread[:80]))
    _goto(page, target["href"])
    page.wait_for_timeout(random.randint(2500, 4000))
    _read_comments(page, signs["handle"], COMMENTS_PER_VIDEO * 3)
    threads = page.locator(SELECTORS["comment_thread"])
    match = None
    for index in range(min(threads.count(), 60)):
        item = threads.nth(index)
        try:
            who = item.locator(SELECTORS["comment_author"]).first.inner_text()
            said = item.locator(SELECTORS["comment_text"]).first.inner_text()
        except Exception:  # noqa: BLE001
            continue
        if _plain(who).lstrip("@") == _plain(author).lstrip("@") and (not quote or _plain(quote)[:80] in _plain(said)):
            match = item
            break
    if match is None:
        raise CommandError("%s: the comment by %s is not under the video any more" % (step, author))
    reply = _first_visible(match, [SELECTORS["reply_button"]], 5_000)
    if reply is None:
        raise CommandError("%s: YouTube showed no Reply button under that comment" % step)
    human.click(reply)
    box = _first_visible(match, [SELECTORS["reply_box"]], 8_000)
    if box is None:
        raise CommandError("%s: YouTube did not open the answer box" % step)
    human.click(box)
    human.type_text(box, text)
    human.pause_before_submit(page)
    submit = _first_visible(match, [SELECTORS["reply_submit"]], 5_000)
    if submit is None:
        raise CommandError("%s: YouTube's Reply button did not show after typing. Nothing was sent" % step)
    human.click(submit)
    page.wait_for_timeout(random.randint(2500, 4000))
    try:
        sent = _plain(text)[:60] in _plain(match.inner_text())
    except Exception:  # noqa: BLE001
        sent = False
    return {"sent": sent}


ROUTINES = {
    "state": youtube_state,
    "quick_state": youtube_state_quick,
    "upload": youtube_upload,
    "health": youtube_health,
    "inbox": youtube_inbox,
    "reply": youtube_reply,
}
