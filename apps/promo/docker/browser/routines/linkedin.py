"""What the browser actually does on LinkedIn.

The only file in the app that knows how a LinkedIn page is put together, the
way `x.py` is for X and `medium.py` for Medium. When LinkedIn redesigns, the
fix is here. The shape of every answer is in
`src/server/social/linkedin/calls.ts`; on a phone the same names reach the
LinkedIn app's steps in `rack/promo_rack.py`.

Every routine takes the live Playwright page and returns plain data the
TypeScript side stores. None of them touch the database or decide what to
write: the app does that, and only after a person pressed a button.

LinkedIn shows almost nothing to a visitor who is not signed in, so every read
here runs in a search account's browser: a spare LinkedIn account that never
writes (part 3). LinkedIn limits how much one account may look at in a day,
so every read answers `viewed`, the posts it put in front of the account, and
`limited`, true when LinkedIn answered with its limit page or turned the
browser away (status 429 or its own 999) anyway.

How a page is read. LinkedIn's web app loads its data from
`www.linkedin.com/voyager/api/...`, in a shape that changes often and is
spread over many small records. Nothing here asks those addresses. The page
is read as drawn, from the shapes in `SELECTORS` below, and LinkedIn's own
answers are only listened to for two things: its limit (429, 999) and, after
a press, the id of what was just written (`urn:li:comment:...`,
`urn:li:activity:...`). Every write is checked afterwards by finding it again
on the page, rather than trusted.

What has been proved: nothing yet against the live site. Every routine here
was written on 22 Oct 2026 from how LinkedIn's pages are put together, with no
LinkedIn account to sign in with. **Every page shape the routines rely on is
in the one `SELECTORS` block at the top of this file, and the page-reading
scripts below it read through that block**, so the first real run with a real
search account and a real commenting account fixes them in one place. The
parsing and the rules around the presses are proved by `test_linkedin.py`.
Each routine says which step failed when it fails.
"""

import ast
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

import human

# --- Every page shape, in one place ------------------------------------------
#
# Written from LinkedIn's pages as they were known on 22 Oct 2026, never
# checked on the live site. The first real run is their test: when a read
# comes back empty or a button is not found, the shape to fix is here.

SELECTORS = {
    # One post wherever it is drawn: the feed, search results, a person's or
    # page's activity, a post's own page. Its id sits in `data-urn` (or
    # `data-id`) as urn:li:activity:<digits>.
    "post": "div.feed-shared-update-v2[data-urn], div[data-urn^='urn:li:activity:'], div[data-id^='urn:li:activity:']",
    "post_actor_name": ".update-components-actor__title span[aria-hidden='true'], .update-components-actor__name span[aria-hidden='true']",
    "post_actor_headline": ".update-components-actor__description span[aria-hidden='true']",
    "post_actor_link": "a.update-components-actor__meta-link, a.update-components-actor__image",
    "post_actor_time": ".update-components-actor__sub-description span[aria-hidden='true']",
    "post_text": ".update-components-text, .feed-shared-update-v2__description",
    "post_reactions": ".social-details-social-counts__reactions-count, button[aria-label*='reaction']",
    "post_comments": "button[aria-label*='comment'] span, .social-details-social-counts__comments",
    "post_reposts": "button[aria-label*='repost'] span, .social-details-social-counts__item--right-aligned",
    "post_header": ".update-components-header",
    "post_poll": ".update-components-poll",
    "post_poll_option": ".update-components-poll-option",
    # A shared article's title, which is all a newsletter issue shows when shared without words.
    "post_article_title": ".update-components-article__title, .feed-shared-article__title",
    "post_comment_box_off": ".comments-disabled-message, .feed-shared-update-v2__comments-disabled",
    # A comment under a post. Its id sits in `data-id` as
    # urn:li:comment:(activity:<post>,<comment>) or with urn:li:activity: inside.
    "comment": "article.comments-comment-entity[data-id], article.comments-comment-item[data-id]",
    "comment_name": ".comments-comment-meta__description-title, .comments-post-meta__name-text",
    "comment_headline": ".comments-comment-meta__description-subtitle, .comments-post-meta__headline",
    "comment_link": "a.comments-comment-meta__description-container, a.comments-post-meta__actor-link",
    "comment_text": ".comments-comment-item__main-content, .update-components-text",
    "comment_reactions": ".comments-comment-social-bar__reactions-count, button[aria-label*='reaction']",
    "comment_replies": ".comments-comment-social-bar__replies-count",
    "comment_time": "time, .comments-comment-meta__data",
    "load_more_comments": "button.comments-comments-list__load-more-comments-button, button:has-text('Load more comments')",
    "load_previous_replies": "button.show-prev-replies, button:has-text('Load previous replies')",
    # The signed-in member's own link: the feed's identity card, or the Me menu.
    "me_link": ".feed-identity-module__actor-meta a[href*='/in/'], a.profile-card-profile-link[href*='/in/'], .global-nav__me a[href*='/in/']",
    "me_name": ".feed-identity-module__actor-meta .t-16, .profile-card-name",
    "premium_badge": ".global-nav__primary-link--premium, li-icon[type='premium-badge'], .premium-icon",
    "login_form": "form.login__form, input#username, a[href*='/login'], .sign-in-form",
    "code_field": "input[name='pin'], input#input__email_verification_pin, input[autocomplete='one-time-code']",
    "code_submit": "button#email-pin-submit-button, button[type='submit']:has-text('Submit'), button:has-text('Verify')",
    # Writing a comment.
    "comment_box": ".comments-comment-box__form .ql-editor[contenteditable='true'], .comments-comment-texteditor .ql-editor",
    "comment_open": "button[aria-label='Comment'], button.comment-button",
    "comment_post": "button.comments-comment-box__submit-button, button.comments-comment-box__submit-button--cr",
    "reply_open": "button.comments-comment-social-bar__reply-action-button, button:has-text('Reply')",
    "comment_as": "button.comments-comment-box__actor-toggle, button[aria-label*='Comment as'], button[aria-label*='Open menu to comment as']",
    "actor_choice": "[role='dialog'] [role='radio'], [role='menu'] [role='menuitemradio'], .actor-selection__option",
    "like_button": "button.react-button__trigger, button[aria-label^='React Like'], button[aria-label*='Like']",
    # Writing a post of your own.
    "start_post": "button.share-box-feed-entry__trigger, button:has-text('Start a post')",
    "group_start_post": "button:has-text('Start a public post'), button:has-text('Start a post in this group')",
    "post_box": "[role='dialog'] .ql-editor[contenteditable='true'], .share-creation-state__text-editor .ql-editor",
    "post_send": "[role='dialog'] button.share-actions__primary-action, [role='dialog'] button:text-is('Post')",
    "post_as": "[role='dialog'] button.share-unified-settings-entry-button, [role='dialog'] button[aria-label*='Post to']",
    "mention_list": "[role='listbox'] [role='option'], .editor-typeahead-fetch [role='option']",
    "media_open": "[role='dialog'] button[aria-label*='Add media'], [role='dialog'] button[aria-label*='Add a photo']",
    "file_input": "input[type='file']",
    "media_next": "[role='dialog'] button:has-text('Next'), [role='dialog'] button:has-text('Done')",
    "more_options": "[role='dialog'] button[aria-label*='More'], [role='dialog'] button[aria-label*='Add to your post']",
    "poll_open": "[role='dialog'] button[aria-label*='Create a poll'], [role='dialog'] button:has-text('Create a poll')",
    "poll_question": "#poll-question, textarea[name='question']",
    "poll_option": "input[id^='poll-option'], input[name^='option']",
    "poll_add_option": "button:has-text('Add option')",
    "poll_duration": "select#poll-duration, select[name='duration']",
    "poll_done": "[role='dialog'] button:has-text('Done')",
    "poll_preview": "[role='dialog'] .share-creation-state__poll-preview, [role='dialog'] .update-components-poll",
    "repost_button": "button.social-reshare-button, button[aria-label*='Repost']",
    "repost_with_thoughts": "[role='menu'] [role='menuitem']:has-text('Repost with your thoughts'), [role='menu'] [role='button']:has-text('Repost with your thoughts')",
    # A newsletter issue in LinkedIn's article editor.
    "article_title": "textarea#article-editor-headline__textarea, textarea[placeholder='Title']",
    "article_body": ".article-editor-content [contenteditable='true'], div[data-test-article-editor-content-textbox]",
    "article_cover": ".article-editor-cover-media input[type='file']",
    "article_next": "button:has-text('Next')",
    "article_publish": "button:has-text('Publish')",
    # Menus on a comment or post of ours.
    "comment_menu": "button.comment-options-trigger, button[aria-label*='More options']",
    "post_menu": "button.feed-shared-control-menu__trigger, button[aria-label*='Open control menu']",
    "menu_edit": "[role='menu'] [role='menuitem']:has-text('Edit'), [role='menu'] [role='button']:has-text('Edit')",
    "menu_delete": "[role='menu'] [role='menuitem']:has-text('Delete'), [role='menu'] [role='button']:has-text('Delete')",
    "confirm_delete": "[role='alertdialog'] button:has-text('Delete'), [role='dialog'] button:has-text('Delete')",
    "edit_save": "button:has-text('Save changes'), button:has-text('Save')",
    # A person's page and its connect buttons.
    "profile_name": "h1",
    "profile_headline": ".text-body-medium.break-words, .pv-text-details__left-panel .text-body-medium",
    "profile_actions": "main section.artdeco-card .pv-top-card-v2-ctas, main .pvs-profile-actions",
    # Searched only inside `profile_actions`, and its label must name the person.
    "connect_button": "button[aria-label^='Invite'][aria-label$='to connect']",
    "more_actions": "button[aria-label='More actions']",
    "menu_connect": "[role='menu'] [role='button'][aria-label^='Invite'], [role='menu'] [role='menuitem'][aria-label^='Invite']",
    "add_note": "[role='dialog'] button:has-text('Add a note')",
    "note_box": "[role='dialog'] textarea#custom-message, [role='dialog'] textarea[name='message']",
    "send_invite": "[role='dialog'] button[aria-label='Send invitation'], [role='dialog'] button[aria-label='Send now'], [role='dialog'] button:text-is('Send')",
    "send_without_note": "[role='dialog'] button:has-text('Send without a note')",
    # Requests waiting on the account.
    "invite_card": "li.invitation-card, .invitation-card__container, div[data-view-name='pending-invitation']",
    "invite_accept": "button:has-text('Accept')",
    # The messages page.
    "thread_box": ".msg-form__contenteditable[contenteditable='true']",
    "thread_send": "button.msg-form__send-button",
    "thread_header_link": ".msg-thread__link-to-profile, .msg-entity-lockup__entity-title a, header a[href*='/in/']",
}

NAV_TIMEOUT_MS = 45_000

# How long a page gets to draw its first posts or say it has none.
SETTLE_MS = 15_000

# A read answers inside the launcher's 90 seconds, the page load included.
READ_BUDGET_SECONDS = 70

# Scrolls in a row that bring nothing new before a read stops.
STALE_SCROLLS = 3

SEARCH_LIMIT = 200
POST_TEXT_CHARS = 6_000
HEADLINE_CHARS = 300

# How many top comments under a post are kept for the AI (LINKEDIN_TOP_COMMENTS).
TOP_COMMENTS = 5
INCOMING_LIMIT = 40
INBOX_LIMIT = 50
INBOX_THREADS = 8
INVITES_LIMIT = 100
VIEWERS_LIMIT = 100

# Each page looked up opens it. Eight fit the launcher's time comfortably.
LOOKUP_LIMIT = 8
# The weekly seen look opens one post per comment.
SEEN_LIMIT = 6

GROUP_TEXT_CHARS = 4_000

# Presses on "Load more comments" when looking for one comment under a post.
MORE_COMMENTS_PRESSES = 6

# Before a comment, every comment must be open to know ours is not among
# them, so a write presses longer. A post with more comments than these
# presses open is refused rather than risk a second comment.
WRITE_MORE_COMMENTS_PRESSES = 15
WRITE_EXPAND_SECONDS = 45

# Media for a post: LinkedIn takes pictures up to 8 MB and videos up to 200 MB
# from here (LinkedIn allows 5 GB, which no download of ours should be). Each
# must finish inside its time, read in pieces of this size.
PICTURE_MAX_BYTES = 8 * 1024 * 1024
PICTURE_SECONDS = 60
VIDEO_MAX_BYTES = 200 * 1024 * 1024
VIDEO_SECONDS = 300
MEDIA_CHUNK_BYTES = 64 * 1024
PICTURE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/gif": ".gif", "image/webp": ".webp"}
VIDEO_TYPES = {"video/mp4": ".mp4", "video/quicktime": ".mov", "video/webm": ".webm"}

# LinkedIn's poll: a question of 140 characters, two to four answers of 30, open 1, 3, 7 or 14 days.
POLL_QUESTION_CHARS = 140
POLL_CHOICES = (2, 4)
POLL_CHOICE_CHARS = 30
POLL_DAYS = (1, 3, 7, 14)
POLL_DAY_WORDS = {1: "1 day", 3: "3 days", 7: "1 week", 14: "2 weeks"}

COMMENT_CHARS = 1_250
POST_CHARS = 3_000
NOTE_CHARS = 300
TITLE_CHARS = 150
BODY_CHARS = 20_000

# A visit around a comment: a few minutes in the feed, a post opened, then
# the post, read, and the comment typed.
FEED_BEFORE_SECONDS = (60, 180)
FEED_AFTER_SECONDS = (20, 60)
PUBLISH_FEED_BEFORE_SECONDS = (30, 90)
PUBLISH_FEED_AFTER_SECONDS = (10, 30)
VISIT_BUDGET_SECONDS = 800
TYPING_SECONDS_PER_CHARACTER = 0.25
WRITE_RESERVE_SECONDS = 180

# A reaction before the comment: a person likes, then thinks, then writes.
REACT_THEN_WAIT_SECONDS = (3, 9)

# A warming account's day on LinkedIn.
WARM_UP_FEED_SECONDS = (90, 240)
WARM_UP_SEARCHES = (1, 2)
WARM_UP_SEARCH_SECONDS = (20, 60)

# A newsletter body is put in a paragraph at a time, with a pause between, as
# a person pastes and tidies a draft. Typing 20,000 characters key by key
# would outlast the launcher's half hour.
PARAGRAPH_PAUSE_SECONDS = (2.0, 6.0)

# How long the app waits for LinkedIn to show what was just written.
LANDED_WAIT_SECONDS = 25

# A post of the account's own, a newsletter issue or a message counts as an
# earlier try only when it went up in this last stretch, unless the app says
# when the first try began (`since`). A comment under a post has no such
# limit: the same words from the account under the same post are always an
# earlier try.
LOOK_BACK_SECONDS = 60 * 60
CLOCK_SLACK_SECONDS = 5 * 60

NO_EARLIER_LOOK = "LinkedIn's post did not draw its comments, so Promo could not look for an earlier try. Nothing was typed."
NO_EARLIER_LOOK_OWN = "The account's own activity did not draw, so Promo could not look for an earlier try. Nothing was typed."

# Added to whatever fails once Post, Send, Save or Publish was pressed. The
# app matches "may already be on LinkedIn" (wording.ts) to stop a blind retry.
MAY_BE_ON_LINKEDIN = "It may already be on LinkedIn; look before sending again."

ORIGIN = "https://www.linkedin.com"
FEED = ORIGIN + "/feed/"
LINKEDIN_HOSTS = {"www.linkedin.com", "linkedin.com"}


# A write is never pressed this close to its launcher limit: past the limit the
# launcher has answered the app already, and a press then would be a write the
# app thinks failed.
PRESS_MARGIN_SECONDS = 60

LAUNCHER = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "launch.py")


def _launcher_limits():
    """`ROUTINE_TIMEOUT_SECONDS` and `WORK_TIMEOUT_SECONDS` read out of launch.py, beside this folder here and in the image."""
    with open(LAUNCHER, encoding="utf-8") as source:
        tree = ast.parse(source.read())
    values = {}
    for node in ast.walk(tree):
        if isinstance(node, ast.Assign) and isinstance(node.targets[0], ast.Name) and node.targets[0].id in ("ROUTINE_TIMEOUT_SECONDS", "WORK_TIMEOUT_SECONDS"):
            values[node.targets[0].id] = ast.literal_eval(node.value)
    return values["ROUTINE_TIMEOUT_SECONDS"], values["WORK_TIMEOUT_SECONDS"]


# When the routine running now must have pressed by, or None outside a write.
_press_by = None


def _begin_write(routine, step):
    """Starts a write's clock: its last press must come `PRESS_MARGIN_SECONDS` before the launcher's limit for it."""
    global _press_by
    try:
        limits, default = _launcher_limits()
    except Exception as error:  # noqa: BLE001 - without the limit no press is safe
        raise CommandError("%s: the launcher's time limit could not be read (%s). Nothing was sent." % (step, _short(error)))
    _press_by = time.monotonic() + limits.get("linkedin." + routine, default) - PRESS_MARGIN_SECONDS
    return _press_by


def _time_to_press(step, words):
    """Refuses a press that would come too close to the launcher's limit."""
    if _press_by is not None and time.monotonic() >= _press_by:
        raise CommandError("%s: the visit ran too long, so %s was not pressed before the launcher's time ran out. Nothing was sent." % (step, words))


class CommandError(Exception):
    """A failure worth reporting verbatim to the app, naming the step."""


class _Refused(CommandError):
    """LinkedIn's own refusal after the press: nothing went up, so it never says it may be on LinkedIn."""


def _short(error):
    return (str(error) or error.__class__.__name__).splitlines()[0][:200]


# LinkedIn's own words use curly apostrophes ("Let’s do a quick security
# check"), so words are compared with them put back to plain.
PLAIN_MARKS = str.maketrans({"‘": "'", "’": "'", "“": '"', "”": '"', "–": "-", "—": "-", "…": "...", " ": " "})
ZERO_WIDTH = dict.fromkeys(map(ord, "​‌‍⁠﻿"))


def _plain(text):
    """Words as they compare: plain quotes and dashes, one space, lower case."""
    return re.sub(r"\s+", " ", (text or "").translate(ZERO_WIDTH).translate(PLAIN_MARKS)).strip().lower()


def _words_only(text):
    """A post's or comment's words as two copies of it compare: links and the "...see more" fold left out."""
    text = re.sub(r"https?://\S+", " ", text or "")
    text = re.sub(r"(?:…|\.\.\.)\s*(?:see more|more)\s*$", "", text.strip(), flags=re.I)
    return _plain(text).rstrip(". ")


# LinkedIn folds a long post or comment behind "...see more". What it shows
# then must be at least this long to count as ours.
CUT_OFF_CHARS = 40


def _same_words(sent, found):
    """True when `found` is the words we sent, all of them, or LinkedIn's fold of a long one."""
    wanted = _words_only(sent)
    shown = _words_only(found)
    if not wanted or not shown:
        return False
    if shown == wanted:
        return True
    folded = bool(re.search(r"(?:…|\.\.\.)\s*(?:see more|more)?\s*$", (found or "").strip(), re.I))
    return folded and len(shown) >= CUT_OFF_CHARS and wanted.startswith(shown.rstrip(". "))


def _goto(page, url):
    page.goto(url, wait_until="domcontentloaded", timeout=NAV_TIMEOUT_MS)


def _on_linkedin(page):
    return (urllib.parse.urlparse(page.url or "").hostname or "") in LINKEDIN_HOSTS


# --- Small readers, each tested on its own -------------------------------


def _number(text):
    """"1.2K" is 1200, "3M" is 3000000, "3,410" is 3410, anything else None."""
    found = re.fullmatch(r"\s*(\d[\d.,]*)\s*([KkMm]?)\+?\s*", text or "")
    if not found:
        return None
    digits = found.group(1).replace(",", "")
    try:
        value = float(digits)
    except ValueError:
        return None
    scale = {"k": 1_000, "m": 1_000_000}.get(found.group(2).lower(), 1)
    return int(round(value * scale))


def _count_in(text, words=None):
    """The first number in some words ("1,204 reactions", "12 comments"), or None.

    With `words`, only a number followed by one of them counts, so "3
    reposts" is not read as the comments.
    """
    # A K or M is part of the number only when no letter follows it, so "12 members" is not 12 million.
    for number, after in re.findall(r"(\d[\d.,]*(?:\s?[KkMm](?![A-Za-z]))?)\+?\s*([A-Za-z]*)", text or ""):
        if words and after.lower() not in words:
            continue
        value = _number(number)
        if value is not None:
            return value
    return None


# LinkedIn says how old a post is in its own short words: "5m", "3h", "2d",
# "1w", "4mo", "1yr", "Just now", sometimes with "Edited" beside.
AGE_UNITS = {"s": 1, "m": 60, "min": 60, "h": 3600, "hr": 3600, "d": 86400, "w": 7 * 86400, "mo": 30 * 86400, "yr": 365 * 86400, "y": 365 * 86400}


def _age_seconds(text):
    """How many seconds ago LinkedIn's short age words mean, or None."""
    plain = _plain(text)
    if plain.startswith("just now") or plain.startswith("now"):
        return 0
    found = re.search(r"(\d+)\s*(mo|yr|min|hr|s|m|h|d|w|y)\b", plain)
    if not found:
        return None
    return int(found.group(1)) * AGE_UNITS[found.group(2)]


def _posted_seconds(text, now=None):
    """When a post went up, as seconds since 1970, from its age words. None when they say nothing."""
    age = _age_seconds(text)
    if age is None:
        return None
    return (now if now is not None else time.time()) - age


ACTIVITY = re.compile(r"urn:li:(?:activity|ugcPost|share):(\d{10,25})")
COMMENT = re.compile(r"urn:li:comment:\((?:urn:li:)?(?:activity|ugcPost):(\d{10,25}),(\d{5,25})\)")


def _activity_id(text):
    """The activity id inside a URN or a post's address, or ""."""
    decoded = urllib.parse.unquote(text or "")
    found = ACTIVITY.search(decoded) or re.search(r"activity-(\d{10,25})", decoded)
    return found.group(1) if found else ""


def _comment_id(text):
    """The comment's own id inside its URN ("urn:li:comment:(activity:1,2)" is "2"), or ""."""
    found = COMMENT.search(urllib.parse.unquote(text or ""))
    return found.group(2) if found else ""


def _slug_from_href(href):
    """(kind, slug) out of a person's or company's address, or ("", "")."""
    path = urllib.parse.urlparse(href or "").path or (href or "")
    found = re.match(r"^/(in|company|school|showcase)/([^/?#]+)", path)
    if not found:
        return "", ""
    try:
        slug = urllib.parse.unquote(found.group(2))
    except Exception:  # noqa: BLE001
        return "", ""
    if not re.fullmatch(r"[\w-]{2,100}", slug):
        return "", ""
    return ("person" if found.group(1) == "in" else "company"), slug


def _slug_arg(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if not re.fullmatch(r"[\w-]{3,100}", text):
        raise CommandError("%s: that is not a LinkedIn page name" % step)
    return text


def _post_id(value, step):
    """A post id the app asked about, checked so it can only ever be one."""
    text = (value if isinstance(value, str) else "").strip()
    if not re.fullmatch(r"\d{10,25}", text):
        raise CommandError("%s: that is not a post id LinkedIn uses" % step)
    return text


def _optional_comment_id(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if text and not re.fullmatch(r"\d{5,25}", text):
        raise CommandError("%s: that is not a comment id LinkedIn uses" % step)
    return text


def _group_id(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if not re.fullmatch(r"\d{3,20}", text):
        raise CommandError("%s: that is not a group id LinkedIn uses" % step)
    return text


def _page_id(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if text and not re.fullmatch(r"\d{1,30}", text):
        raise CommandError("%s: that is not a company page id LinkedIn uses" % step)
    return text


def _conversation_id(value, step):
    text = (value if isinstance(value, str) else "").strip()
    if not re.fullmatch(r"[A-Za-z0-9_=-]{5,200}", text):
        raise CommandError("%s: that is not a conversation id LinkedIn uses" % step)
    return text


def _text_arg(args, key, step, limit, what="words"):
    text = (args.get(key) or "").strip() if isinstance(args.get(key), str) else ""
    if not text:
        raise CommandError("%s: no %s to send" % (step, what))
    if len(text) > limit:
        raise CommandError("%s: the %s are longer than LinkedIn's %d characters" % (step, what, limit))
    return text


def _post_url(post_id):
    return "%s/feed/update/urn:li:activity:%s/" % (ORIGIN, post_id)


def _comment_url(post_id, comment_id):
    urn = "urn:li:comment:(activity:%s,%s)" % (post_id, comment_id)
    return "%s?commentUrn=%s" % (_post_url(post_id), urllib.parse.quote(urn, safe=""))


def _since_arg(value, step):
    """Where a post's look for an earlier try starts: the app's `since` (seconds since 1970) when sent, else an hour ago."""
    if value is None or value == "":
        return time.time() - LOOK_BACK_SECONDS
    if isinstance(value, bool) or not isinstance(value, (int, float)) or value <= 0:
        raise CommandError("%s: since must be seconds since 1970" % step)
    return float(value) - CLOCK_SLACK_SECONDS


def _recent(seconds, since):
    """True when a post went up at or after `since`. One whose age LinkedIn did not show counts, to be safe."""
    return since is None or seconds is None or seconds >= since


def _limited(status):
    """True when an answer from LinkedIn is its limit: 429, or its own 999 for a browser it turned away."""
    return status in (429, 999)


def _search_url(kind, value):
    """Where a keyword's newest posts are: the post search by latest, or a person's or page's activity."""
    if kind == "search":
        return "%s/search/results/content/?keywords=%s&sortBy=%%22date_posted%%22" % (ORIGIN, urllib.parse.quote(value))
    if kind == "hashtag":
        return "%s/search/results/content/?keywords=%s&sortBy=%%22date_posted%%22" % (ORIGIN, urllib.parse.quote("#" + value.lstrip("#")))
    if kind == "person":
        return "%s/in/%s/recent-activity/all/" % (ORIGIN, urllib.parse.quote(value))
    if kind == "company":
        return "%s/company/%s/posts/?feedView=all&sortBy=recent" % (ORIGIN, urllib.parse.quote(value))
    raise CommandError("search: LinkedIn has no keyword of that kind")


def _poll_arg(poll, step):
    """A poll the app asked for, checked against LinkedIn's limits: (question, choices, days)."""
    if not isinstance(poll, dict):
        raise CommandError("%s: the poll is not one LinkedIn can take" % step)
    question = (poll.get("question") or "").strip() if isinstance(poll.get("question"), str) else ""
    if not question or len(question) > POLL_QUESTION_CHARS:
        raise CommandError("%s: a poll needs a question of up to 140 characters" % step)
    choices = [choice.strip() for choice in poll.get("choices") or [] if isinstance(choice, str) and choice.strip()]
    if not POLL_CHOICES[0] <= len(choices) <= POLL_CHOICES[1]:
        raise CommandError("%s: a poll needs two to four answers" % step)
    if any(len(choice) > POLL_CHOICE_CHARS for choice in choices):
        raise CommandError("%s: a poll answer is longer than LinkedIn's 30 characters" % step)
    days = poll.get("days")
    if isinstance(days, bool) or days not in POLL_DAYS:
        raise CommandError("%s: a poll runs for 1, 3, 7 or 14 days" % step)
    return question, choices, days


def _tags_arg(tags, text, step):
    """The tags the app asked for, each a name written as @Name in the words."""
    out = []
    for tag in tags or []:
        if not isinstance(tag, dict):
            raise CommandError("%s: a tag is not one LinkedIn can take" % step)
        name = (tag.get("name") or "").strip() if isinstance(tag.get("name"), str) else ""
        kind = tag.get("kind")
        slug = _slug_arg(tag.get("slug"), step)
        if not name or kind not in ("person", "company"):
            raise CommandError("%s: a tag needs a name and whether it is a person or a page" % step)
        if "@" + name not in text:
            raise CommandError("%s: the words do not hold @%s where the tag goes" % (step, name))
        out.append({"name": name, "slug": slug, "kind": kind})
    return out


def _shown_words(text, tags):
    """What the box shows once each tag is picked: LinkedIn draws @Name as the name alone."""
    for tag in tags:
        text = text.replace("@" + tag["name"], tag["name"])
    return text


def _box_matches(sent, shown):
    """True when the box holds exactly the words typed, as `_plain` compares them."""
    wanted = _plain(sent)
    return bool(wanted) and wanted == _plain(shown)


BAN_PHRASES = (
    "your account has been restricted",
    "your account is restricted",
    "your account has been temporarily restricted",
    "your account is temporarily restricted",
    "we've restricted your account",
    "temporarily restricted",
    "let's do a quick security check",
    "verify your identity",
    "help us verify your identity",
)

CODE_PHRASES = ("enter the code we sent", "we sent a code", "enter the 6-digit code", "check your email for a verification code", "verification code")
LIMIT_PHRASES = (
    "you've reached the commercial use limit",
    "you've reached the monthly limit for profile searches",
    "you've reached the limit",
    "too many requests",
)
GONE_PHRASES = (
    "this post cannot be displayed",
    "this post is unavailable",
    "this content isn't available",
    "this page doesn't exist",
    "post not found",
    "this post has been deleted",
)
CODE_REASON = "LinkedIn is asking for the code it emailed"
BAN_LINE_CHARS = 110


def _ban_line(line):
    """True when a line is one of LinkedIn's restriction phrases, or a short line that starts with one."""
    plain = _plain(line).rstrip(".")
    return any(plain == phrase or (plain.startswith(phrase) and len(plain) <= BAN_LINE_CHARS) for phrase in BAN_PHRASES)


def _ban_words(text, path=""):
    """LinkedIn's own words on a restriction, identity or security check page, or None.

    The line holding the phrase, with the sentence after it when there is
    one. LinkedIn's checkpoint page with no code field is its security check,
    whatever it says.
    """
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
    path = raw.get("path") or ""
    text = raw.get("text") or ""
    plain = _plain(text)
    out = {
        "onLinkedin": host in LINKEDIN_HOSTS,
        "checked": False,
        "slug": None,
        "name": "",
        "blocked": False,
        "reason": "",
        "banScreen": None,
        "codeAsked": False,
        "limited": False,
        "signedOut": False,
        "premium": raw.get("premium") if isinstance(raw.get("premium"), bool) else None,
        "gonePage": False,
    }
    if not out["onLinkedin"]:
        return out
    _kind, slug = _slug_from_href(raw.get("meHref") or "")
    out["slug"] = slug or None
    out["name"] = (raw.get("meName") or "").strip()[:200]
    ban = _ban_words(text, path)
    in_checkpoint = path.startswith("/checkpoint/")
    asking_code = bool(raw.get("codeField")) and (in_checkpoint or any(phrase in plain for phrase in CODE_PHRASES))
    out["limited"] = any(phrase in plain for phrase in LIMIT_PHRASES)
    in_login = path.startswith("/login") or path.startswith("/uas/login") or path.startswith("/checkpoint/lg/") or path.startswith("/authwall")
    out["signedOut"] = not slug and (bool(raw.get("login")) or in_login)
    if asking_code:
        # The emailed code is not a ban: once typed, the account carries on.
        out["codeAsked"] = True
        out["blocked"], out["reason"] = True, CODE_REASON
    elif ban:
        out["banScreen"] = ban
        out["blocked"], out["reason"] = True, ban
    elif in_checkpoint and not in_login:
        words = next((line.strip() for line in text.splitlines() if len(line.strip()) > 20), "LinkedIn is showing a security check")
        out["banScreen"] = words[:300]
        out["blocked"], out["reason"] = True, words[:300]
    elif out["limited"]:
        out["blocked"], out["reason"] = True, "LinkedIn says this account has reached its limit"
    out["checked"] = bool(slug or out["signedOut"] or out["blocked"])
    out["gonePage"] = any(phrase in plain for phrase in GONE_PHRASES)
    return out


def _person(card):
    """A person or page out of a drawn card's name, headline and link."""
    kind, slug = _slug_from_href(card.get("href") or "")
    return {
        "kind": kind or "person",
        "slug": slug,
        "name": (card.get("name") or "").strip()[:200],
        "headline": (card.get("headline") or "").strip()[:HEADLINE_CHARS],
    }


def _post_from_card(card, now=None):
    """One drawn post in the shape the app stores. None without an activity id."""
    post_id = _activity_id(card.get("urn") or "")
    if not post_id:
        return None
    who = _person(card)
    header = _plain(card.get("header"))
    text = (card.get("text") or "").strip()
    return {
        "postId": post_id,
        "url": _post_url(post_id),
        "text": text[:POST_TEXT_CHARS],
        "authorName": who["name"],
        "authorHeadline": who["headline"],
        "authorSlug": who["slug"],
        "authorKind": who["kind"],
        "authorFollowers": _count_in(card.get("headline") or "", ("followers", "follower")) if who["kind"] == "company" else None,
        "postedSeconds": _posted_seconds(card.get("age") or "", now),
        "reactions": _count_in(card.get("reactions") or "") or 0,
        "comments": _count_in(card.get("comments") or "", ("comment", "comments", "")) or 0,
        "reposts": _count_in(card.get("reposts") or "", ("repost", "reposts", "")) or 0,
        "canComment": not bool(card.get("commentsOff")),
        # "Jane reposted this" over a post with no words of the reposter's own.
        "isRepost": "reposted this" in header and not bool(card.get("ownWords")),
        "link": (card.get("link") or "").strip()[:600] if (card.get("link") or "").startswith("http") else "",
    }


def _comment_from_card(card, now=None):
    """One drawn comment as the app stores it. None without a comment id."""
    comment_id = _comment_id(card.get("urn") or "")
    if not comment_id:
        return None
    who = _person(card)
    return {
        "id": comment_id,
        "postId": _activity_id(card.get("urn") or ""),
        "parentId": _comment_id(card.get("parentUrn") or ""),
        "name": who["name"],
        "headline": who["headline"],
        "slug": who["slug"],
        "kind": who["kind"],
        "text": (card.get("text") or "").strip()[:POST_TEXT_CHARS],
        "reactions": _count_in(card.get("reactions") or "") or 0,
        "replies": _count_in(card.get("replies") or "", ("reply", "replies", "")),
        "postedSeconds": _posted_seconds(card.get("age") or "", now),
    }


def _shown_count(text):
    """A count LinkedIn draws: 0 when it draws none, the number when it reads, None when it says something unreadable."""
    if not (text or "").strip():
        return 0
    return _count_in(text)


def _poll_votes(raw):
    """A drawn poll's votes per answer, read off each answer's "12 votes" or its share, or None."""
    if not isinstance(raw, list) or not raw:
        return None
    votes = []
    for option in raw:
        count = _count_in(option or "", ("vote", "votes"))
        if count is None:
            return None
        votes.append(count)
    return votes


POST_ACTIVITY = re.compile(r"urn:li:activity:(\d{10,25})")


def _created_ids(bodies, exclude=()):
    """The ids of what was just written, read off LinkedIn's answers to the press.

    (comment ids, activity ids), in the order they appear, leaving out
    `exclude`: the post replied to, the comment answered, the post reposted,
    and every comment or post already on the page before the press. Only an
    activity URN names a post: a share or ugcPost number is another id.
    """
    skip = {item for item in exclude if item}
    comments, activities = [], []
    for body in bodies:
        text = body if isinstance(body, str) else json.dumps(body)
        for found in COMMENT.finditer(text):
            if found.group(2) not in skip and found.group(2) not in comments:
                comments.append(found.group(2))
        for found in POST_ACTIVITY.finditer(text):
            if found.group(1) not in skip and found.group(1) not in activities:
                activities.append(found.group(1))
    return comments, activities


def _only(ids):
    """The id when exactly one is left, else None: two candidates are a guess, and the page is looked at instead."""
    return ids[0] if len(ids) == 1 else None


# --- Listening to LinkedIn's own answers -------------------------------------


class _Net(object):
    """LinkedIn's answers, as the page receives them.

    Watches every answer from LinkedIn while it is in a `with`, notes its
    limit (429, 999), and keeps the bodies of the page's own writes (POST
    answers under /voyager/api/) for `_created_ids`. Bodies are read on this
    thread after each wait, not inside the listener.
    """

    def __init__(self, page):
        self.page = page
        self.limited = False
        self.writes = []
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
            host = urllib.parse.urlparse(response.url).hostname or ""
        except Exception:  # noqa: BLE001
            return
        if host in LINKEDIN_HOSTS:
            self._waiting.append(response)

    def drain(self):
        waiting, self._waiting = self._waiting, []
        for response in waiting:
            try:
                status = response.status
            except Exception:  # noqa: BLE001
                status = 0
            if _limited(status):
                self.limited = True
            try:
                method = response.request.method
            except Exception:  # noqa: BLE001
                method = "GET"
            if method != "POST" or "/voyager/api/" not in (response.url or ""):
                continue
            try:
                self.writes.append(response.text())
            except Exception:  # noqa: BLE001 - an empty or cut-off body
                continue

    def begin(self):
        """Forgets every write heard so far. Called right before a press, so only the press's own answers count."""
        self.drain()
        self.writes = []

    def created(self, exclude=()):
        self.drain()
        return _created_ids(self.writes, exclude)


# --- Reading the page itself ------------------------------------------------
#
# Each script takes `SELECTORS` as its argument, so the shapes live only above.

SIGNS_SCRIPT = """
(s) => {
  /* linkedin:signs */
  let text = (document.body && document.body.innerText) || ""
  // Posts, comments, profiles and messages are other people's words, never the
  // account's own screen: a post saying "your account has been restricted" is not one.
  for (const node of document.querySelectorAll([s.post, s.comment, '.msg-s-event-listitem', 'main .pv-top-card'].join(", "))) {
    const words = node.innerText || ""
    if (words.length > 2) text = text.split(words).join(" ")
  }
  const me = document.querySelector(s.me_link)
  const name = document.querySelector(s.me_name)
  return {
    url: location.href,
    host: location.hostname,
    path: location.pathname,
    text: text.slice(0, 5000),
    meHref: me ? me.getAttribute("href") || "" : "",
    meName: name ? name.innerText || "" : "",
    login: Boolean(document.querySelector(s.login_form)),
    codeField: Boolean(document.querySelector(s.code_field)),
    premium: me ? Boolean(document.querySelector(s.premium_badge)) : null,
  }
}
"""

CARDS_SCRIPT = """
(s) => {
  /* linkedin:cards */
  const one = (root, sel) => root.querySelector(sel)
  const words = (root, sel) => { const node = one(root, sel); return node ? node.innerText || "" : "" }
  const out = []
  for (const card of document.querySelectorAll(s.post)) {
    const actor = one(card, s.post_actor_link)
    const body = one(card, s.post_text)
    const link = body ? body.querySelector('a[href^="http"]') : null
    const poll = Array.from(card.querySelectorAll(s.post_poll_option)).map((node) => node.innerText || "")
    out.push({
      urn: card.getAttribute("data-urn") || card.getAttribute("data-id") || "",
      name: words(card, s.post_actor_name),
      headline: words(card, s.post_actor_headline),
      href: actor ? actor.getAttribute("href") || "" : "",
      age: words(card, s.post_actor_time),
      text: body ? body.innerText || "" : "",
      ownWords: Boolean(body),
      header: words(card, s.post_header),
      reactions: words(card, s.post_reactions),
      comments: words(card, s.post_comments),
      reposts: words(card, s.post_reposts),
      commentsOff: Boolean(one(card, s.post_comment_box_off)),
      link: link ? link.getAttribute("href") || "" : "",
      articleTitle: words(card, s.post_article_title),
      poll,
    })
  }
  return out
}
"""

COMMENTS_SCRIPT = """
(s) => {
  /* linkedin:comments */
  const words = (root, sel) => { const node = root.querySelector(sel); return node ? node.innerText || "" : "" }
  return Array.from(document.querySelectorAll(s.comment)).map((card) => {
    const link = card.querySelector(s.comment_link)
    const parent = card.parentElement ? card.parentElement.closest(s.comment) : null
    return {
      urn: card.getAttribute("data-id") || "",
      parentUrn: parent ? parent.getAttribute("data-id") || "" : "",
      name: words(card, s.comment_name),
      headline: words(card, s.comment_headline),
      href: link ? link.getAttribute("href") || "" : "",
      text: words(card, s.comment_text),
      reactions: words(card, s.comment_reactions),
      replies: words(card, s.comment_replies),
      age: words(card, s.comment_time),
    }
  })
}
"""

PAGE_TEXT_SCRIPT = """
(s) => {
  /* linkedin:text */
  const main = document.querySelector("main") || document.body
  const name = document.querySelector(s.profile_name)
  const headline = document.querySelector(s.profile_headline)
  return {
    name: name ? name.innerText || "" : "",
    headline: headline ? headline.innerText || "" : "",
    text: ((main && main.innerText) || "").slice(0, 8000),
  }
}
"""

PEOPLE_SCRIPT = """
(s) => {
  /* linkedin:people */
  // A list of people, each a card with a link to /in/...: requests waiting, profile viewers.
  const cards = document.querySelectorAll(s.invite_card + ", li:has(a[href*='/in/'])")
  const out = []
  for (const card of cards) {
    const link = card.querySelector("a[href*='/in/']")
    if (!link) continue
    const lines = (card.innerText || "").split("\\n").map((line) => line.trim()).filter(Boolean)
    out.push({ href: link.getAttribute("href") || "", lines })
  }
  return out
}
"""

THREADS_SCRIPT = """
() => {
  /* linkedin:threads */
  return Array.from(document.querySelectorAll("a[href*='/messaging/thread/']")).map((link) => ({
    href: link.getAttribute("href") || "",
    lines: (link.innerText || "").split("\\n").map((line) => line.trim()).filter(Boolean),
  }))
}
"""

MESSAGES_SCRIPT = """
(s) => {
  /* linkedin:messages */
  const header = document.querySelector(s.thread_header_link)
  const out = []
  let name = ""
  let href = ""
  let time = ""
  for (const item of document.querySelectorAll(".msg-s-message-list__event")) {
    const sender = item.querySelector(".msg-s-message-group__name")
    const link = item.querySelector("a.msg-s-message-group__profile-link, a[href*='/in/']")
    const stamp = item.querySelector("time")
    if (sender) name = sender.innerText || ""
    if (link) href = link.getAttribute("href") || ""
    if (stamp) time = stamp.innerText || ""
    const body = item.querySelector(".msg-s-event-listitem__body")
    if (!body) continue
    out.push({ urn: item.getAttribute("data-event-urn") || "", name, href, time, text: body.innerText || "" })
  }
  return { header: header ? header.getAttribute("href") || "" : "", messages: out }
}
"""

PAGES_SCRIPT = """
(s) => {
  /* linkedin:pages */
  // The company pages in the open "Comment as" or "Post as" list.
  return Array.from(document.querySelectorAll(s.actor_choice)).map((node) => {
    const link = node.querySelector("a[href*='/company/']")
    return {
      text: node.innerText || "",
      urn: node.getAttribute("data-urn") || node.getAttribute("value") || node.getAttribute("data-actor-urn") || "",
      href: link ? link.getAttribute("href") || "" : "",
    }
  })
}
"""

ACTIONS_SCRIPT = """
(s) => {
  /* linkedin:actions */
  // The profile's own buttons and its degree badge, never the rest of the page.
  const box = document.querySelector(s.profile_actions)
  const name = document.querySelector(s.profile_name)
  const degree = document.querySelector("main .dist-value, main .distance-badge")
  return {
    found: Boolean(box),
    name: name ? name.innerText || "" : "",
    labels: box ? Array.from(box.querySelectorAll("button, [role='button']")).map((node) => node.getAttribute("aria-label") || node.innerText || "") : [],
    degree: degree ? degree.innerText || "" : "",
  }
}
"""

ACTOR_SCRIPT = """
(first, second) => {
  /* linkedin:actor */
  // Who the open box writes as: the "Comment as" or "Post as" switch's own label and picture.
  // Asked of a card, the card comes first and the shape second; asked of the page, the shape alone.
  const root = second === undefined ? document : first
  const selector = second === undefined ? first : second
  const node = root.querySelector(selector)
  if (!node) return null
  const picture = node.querySelector("img[alt]")
  return [node.getAttribute("aria-label") || "", node.innerText || "", picture ? picture.getAttribute("alt") || "" : ""].join(" ")
}
"""

POLL_PREVIEW_SCRIPT = """
(s) => {
  /* linkedin:poll */
  const node = document.querySelector(s.poll_preview)
  return node ? node.innerText || "" : null
}
"""

READY_SCRIPT = """
(s) => {
  /* linkedin:ready */
  const text = ((document.body && document.body.innerText) || "").toLowerCase()
  return {
    posts: document.querySelectorAll(s.post).length,
    comments: document.querySelectorAll(s.comment).length,
    empty: text.includes("no results found") || text.includes("hasn't posted") || text.includes("no posts yet"),
    error: text.includes("something went wrong") || text.includes("cannot be displayed") || text.includes("isn't available"),
    login: Boolean(document.querySelector(s.login_form)),
  }
}
"""


def _run(page, script, fallback):
    try:
        found = page.evaluate(script, SELECTORS)
    except Exception:  # noqa: BLE001 - a page moving under us reads as nothing
        return fallback
    return found if found is not None else fallback


def _signs(page):
    """What the page on screen says about the account. Never moves the page."""
    return _judge(_run(page, SIGNS_SCRIPT, {}))


def _settle(page, net=None, timeout_ms=SETTLE_MS):
    """Waits for the page to draw posts or comments, or to say it has none."""
    deadline = time.monotonic() + timeout_ms / 1000
    while True:
        if net is not None:
            net.drain()
            if net.limited:
                break
        ready = _run(page, READY_SCRIPT, {})
        if any(ready.get(key) for key in ("posts", "comments", "empty", "error", "login")):
            break
        if time.monotonic() >= deadline:
            break
        page.wait_for_timeout(500)
    page.wait_for_timeout(random.randint(600, 1200))
    if net is not None:
        net.drain()


def _usable(page, step):
    """The page's signs, after checking the account is signed in and nothing but a limit is in the way."""
    signs = _signs(page)
    if not signs["onLinkedin"]:
        raise CommandError("%s: the page is not on LinkedIn" % step)
    if signs["banScreen"]:
        raise CommandError("%s: LinkedIn shows this on the account: %s" % (step, signs["banScreen"]))
    if signs["blocked"] and not signs["limited"]:
        raise CommandError("%s: %s" % (step, signs["reason"]))
    if not signs["slug"] and not signs["limited"]:
        raise CommandError("%s: this browser is not signed in to LinkedIn, or LinkedIn's page did not finish drawing" % step)
    return signs


def _cards(page):
    return _run(page, CARDS_SCRIPT, [])


def _comments(page):
    return _run(page, COMMENTS_SCRIPT, [])


def _posts_on_page(page, now=None):
    """Every drawn post once, in page order."""
    out, ids = [], set()
    for card in _cards(page):
        post = _post_from_card(card, now)
        if post is None or post["postId"] in ids:
            continue
        ids.add(post["postId"])
        post["_poll"] = card.get("poll") or []
        post["_commentCount"] = _shown_count(card.get("comments"))
        post["_articleTitle"] = (card.get("articleTitle") or "").strip()
        out.append(post)
    return out


def _comments_on_page(page, now=None):
    out, ids = [], set()
    for card in _comments(page):
        comment = _comment_from_card(card, now)
        if comment is None or comment["id"] in ids:
            continue
        ids.add(comment["id"])
        out.append(comment)
    return out


def _clean_post(post):
    return {key: value for key, value in post.items() if not key.startswith("_")}


def _scroll(page, sizes=None):
    """A few ordinary scrolls down, as a person reading a feed makes them."""
    for _ in range(random.randint(2, 4)):
        moved = human.scroll_once(page)
        if sizes is not None:
            sizes.append(abs(moved))
        page.wait_for_timeout(random.randint(500, 1400))


def _collect(page, net, want, deadline):
    """Scrolls until `want` posts are drawn, nothing new comes, LinkedIn limits it, or time is up.

    Returns the posts (never more than `want`) and every post id the account
    was shown on the way.
    """
    stale = 0
    seen = set()
    while True:
        if net is not None:
            net.drain()
        posts = _posts_on_page(page)
        seen.update(post["postId"] for post in posts)
        if len(posts) >= want or (net is not None and net.limited) or stale >= STALE_SCROLLS or time.monotonic() >= deadline:
            return posts[:want], seen
        before = len(seen)
        _scroll(page)
        after = {post["postId"] for post in _posts_on_page(page)}
        seen.update(after)
        stale = stale + 1 if len(seen) <= before else 0


def _read_start(page, net, url, step):
    """Opens a page for a read, waits for it to draw, and checks the search account can read it."""
    try:
        _goto(page, url)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: LinkedIn's page would not open: %s" % (step, _short(error)))
    _settle(page, net)
    return _usable(page, step)


def _read_cost(seen, net, signs):
    return {"viewed": len(seen), "limited": bool((net is not None and net.limited) or (signs or {}).get("limited"))}


def _first_visible(scope, selectors, timeout_ms):
    """The first of these shapes that is on screen, or None. Each is tried in turn."""
    if isinstance(selectors, str):
        selectors = [selectors]
    deadline = time.monotonic() + timeout_ms / 1000
    while time.monotonic() < deadline:
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
        scope.wait_for_timeout(300) if hasattr(scope, "wait_for_timeout") else time.sleep(0.3)
    return None


# --- Who is signed in -----------------------------------------------------


def _state_from(signs, pages=None, followers=None):
    return {
        "checked": bool(signs.get("checked")),
        "slug": signs.get("slug"),
        "name": signs.get("name") or "",
        "blocked": bool(signs.get("blocked")),
        "reason": signs.get("reason") or "",
        "banScreen": signs.get("banScreen"),
        "codeAsked": bool(signs.get("codeAsked")),
        "pages": pages,
        "premium": signs.get("premium"),
        "followers": followers,
    }


NOT_LOOKED = {"checked": False, "slug": None, "name": "", "blocked": False, "reason": "", "banScreen": None, "codeAsked": False, "pages": None, "premium": None, "followers": None}


def linkedin_state_quick(page, args=None):
    """Who is signed in, and whether a restriction, check or code page is on screen, without moving the page.

    Asked after every LinkedIn job, so it never navigates: a person may be
    halfway through signing in in the same window. `checked` is False when
    the page is not on LinkedIn, or said nothing either way, so a look at
    another site is never written down as "signed out".
    """
    if not _on_linkedin(page):
        return dict(NOT_LOOKED)
    deadline = time.monotonic() + 4
    while True:
        signs = _signs(page)
        if signs["checked"] or time.monotonic() >= deadline:
            return _state_from(signs)
        page.wait_for_timeout(500)


def _pages_from(raw):
    """The company pages in an open actor list: every choice with a company's number or address."""
    out = []
    for item in raw or []:
        urn = item.get("urn") or ""
        found = re.search(r"urn:li:(?:fsd_)?(?:company|organization):(\d{1,30})", urn)
        _kind, slug = _slug_from_href(item.get("href") or "")
        if not found and not slug:
            continue
        lines = [line.strip() for line in (item.get("text") or "").splitlines() if line.strip()]
        out.append({"pageId": found.group(1) if found else "", "slug": slug, "name": (lines[0] if lines else slug)[:200]})
    return [page for page in out if page["pageId"]]


def _read_pages(page):
    """The company pages the member may comment as, from the "Comment as" list on the first post of the feed. None when it could not tell."""
    toggle = _first_visible(page, [SELECTORS["comment_as"]], 3_000)
    if toggle is None:
        opener = _first_visible(page, [SELECTORS["comment_open"]], 3_000)
        if opener is None:
            return None
        human.click(opener)
        toggle = _first_visible(page, [SELECTORS["comment_as"]], 4_000)
    # A member who runs no page has no "Comment as" switch at all.
    if toggle is None:
        return []
    human.click(toggle)
    page.wait_for_timeout(random.randint(700, 1300))
    pages = _pages_from(_run(page, PAGES_SCRIPT, []))
    try:
        page.keyboard.press("Escape")
    except Exception:  # noqa: BLE001
        pass
    return pages


def linkedin_state(page, args=None):
    """The full look: goes to LinkedIn's feed first, so it runs only for a check a person asked for.

    Reads the company pages the member runs off the first post's "Comment
    as" list, and the followers off their own page. Nothing is pressed but
    the list's opener, which writes nothing.
    """
    try:
        _goto(page, FEED)
        page.wait_for_timeout(random.randint(2000, 3500))
    except Exception as error:  # noqa: BLE001 - reported, never swallowed
        return dict(NOT_LOOKED, reason=_short(error))
    state = linkedin_state_quick(page)
    if not state["slug"] or state["blocked"]:
        return state
    try:
        state["pages"] = _read_pages(page)
    except Exception as error:  # noqa: BLE001 - the pages are extra
        print("linkedin state: the pages would not read: %s" % _short(error), flush=True)
    try:
        _goto(page, "%s/in/%s/" % (ORIGIN, state["slug"]))
        page.wait_for_timeout(random.randint(1500, 2500))
        raw = _run(page, PAGE_TEXT_SCRIPT, {})
        state["followers"] = _count_in(raw.get("text") or "", ("followers", "follower"))
    except Exception as error:  # noqa: BLE001
        print("linkedin state: the member's page would not read: %s" % _short(error), flush=True)
    return state


def linkedin_enter_code(page, args):
    """Types the code LinkedIn emailed into the page asking for it, presses Submit, and says who is signed in.

    Nothing else is typed. The code never appears in an error.
    """
    code = (args.get("code") or "").strip() if isinstance(args.get("code"), str) else ""
    if not re.fullmatch(r"\d{4,8}", code):
        raise CommandError("enter code: the code must be digits only")
    if not _on_linkedin(page):
        raise CommandError("enter code: the page is not on LinkedIn")
    field = _first_visible(page, [SELECTORS["code_field"]], 8_000)
    if field is None or not _signs(page)["codeAsked"]:
        raise CommandError("enter code: LinkedIn is not asking for a code on this page")
    human.click(field)
    human.type_text(field, code)
    human.pause_before_submit(page)
    button = _first_visible(page, [SELECTORS["code_submit"]], 4_000)
    if button is None:
        page.keyboard.press("Enter")
    else:
        human.click(button)
    page.wait_for_timeout(random.randint(4000, 6000))
    return linkedin_state_quick(page)


# --- Reads, through a search account --------------------------------------


def linkedin_search(page, args):
    """The newest posts for one keyword: LinkedIn's post search by latest, or a person's or page's activity.

    Posts come back in page order, each once. Scrolling stops at `max` posts,
    when nothing new comes, when LinkedIn limits the account, or at the read's
    time. Plain reposts are returned marked `isRepost`; the app decides.
    """
    kind = args.get("kind")
    value = (args.get("value") or "").strip() if isinstance(args.get("value"), str) else ""
    if kind not in ("search", "hashtag", "person", "company") or not value:
        raise CommandError("search: LinkedIn has no keyword of that kind")
    if kind in ("person", "company"):
        value = _slug_arg(value, "search")
    try:
        want = max(1, min(SEARCH_LIMIT, int(args.get("max") or 20)))
    except (TypeError, ValueError):
        raise CommandError("search: max must be a number") from None
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    with _Net(page) as net:
        signs = _read_start(page, net, _search_url(kind, value), "search")
        posts, seen = _collect(page, net, want, deadline)
    out = []
    for position, post in enumerate(posts):
        item = _clean_post(post)
        item["position"] = position
        out.append(item)
    return {"posts": out, **_read_cost(seen, net, signs)}


def _expand_comments(page, deadline, presses=MORE_COMMENTS_PRESSES):
    """Presses "Load more comments" and "Load previous replies" until there are none, or the presses or time run out.

    Returns True when the list was fully opened, False when more were still
    there to load, so a comment not found can be told from one not reached.
    """
    for _ in range(presses):
        if time.monotonic() >= deadline:
            return False
        button = _first_visible(page, [SELECTORS["load_more_comments"], SELECTORS["load_previous_replies"]], 1_500)
        if button is None:
            return True
        human.click(button)
        page.wait_for_timeout(random.randint(900, 1800))
    return _first_visible(page, [SELECTORS["load_more_comments"]], 1_000) is None


def _card(page, selector):
    """The first drawn element of this shape, as a place to look inside, or None when there is none."""
    found = page.locator(selector)
    try:
        return found.first if found.count() else None
    except Exception:  # noqa: BLE001 - a page moving under us
        return None


def _all_open(opened, post, comments):
    """True when every comment under the post is on the page.

    No Load more showing is not enough on its own: LinkedIn can be slow to
    draw it. So the drawn comments must also number at least what LinkedIn
    counts, when that count was read, and an unreadable count with nothing
    drawn is not "none".
    """
    count = post.get("_commentCount")
    if not opened:
        return False
    if count is None:
        return bool(comments)
    return len(comments) >= count


def _focal(page, post_id):
    """The post itself on its own page: the drawn post with this id, or None."""
    return next((post for post in _posts_on_page(page) if post["postId"] == post_id), None)


def linkedin_post(page, args):
    """One post read again for the right column, with its top comments, most reacted first (part 22).

    The writer's own comments are left out: the AI answers the post and what
    others said under it. `missing` when LinkedIn says the post is gone or
    only its writer's connections may see it.
    """
    post_id = _post_id(args.get("postId"), "post")
    with _Net(page) as net:
        signs = _read_start(page, net, _post_url(post_id), "post")
        post = _focal(page, post_id)
        comments = _comments_on_page(page)
    if post is None:
        # A post that did not draw is never written down as gone; only LinkedIn's own words say so.
        if not signs.get("gonePage"):
            raise CommandError("post: the post did not draw, so nothing could be read")
        return {"post": None, "missing": True, "comments": [], **_read_cost(set(), net, signs)}
    top = [comment for comment in comments if not comment["parentId"] and comment["slug"] != post["authorSlug"]]
    top.sort(key=lambda comment: comment["reactions"], reverse=True)
    return {
        "post": _clean_post(post),
        "missing": False,
        "comments": [
            {"id": comment["id"], "name": comment["name"], "headline": comment["headline"], "slug": comment["slug"], "text": comment["text"], "reactions": comment["reactions"]}
            for comment in top[:TOP_COMMENTS]
        ],
        **_read_cost({post_id}, net, signs),
    }


def _incoming(comments, own_slug):
    return [
        {
            "id": comment["id"],
            "name": comment["name"],
            "headline": comment["headline"],
            "slug": comment["slug"],
            "text": comment["text"],
            "reactions": comment["reactions"],
            "postedSeconds": comment["postedSeconds"],
        }
        for comment in comments
        if (comment["slug"] or "").lower() != (own_slug or "").lower()
    ][:INCOMING_LIMIT]


def linkedin_check(page, args):
    """A sent comment or post of ours read again by a stranger (part 43).

    For a comment (`commentId`): whether it shows under its post, its
    reactions, and the replies under it. For a post (`commentId` ""): its
    numbers, its poll's votes, and the comments under it. `visible` is None
    when the comments could not all be opened in time, so a comment not
    reached is never read as gone.
    """
    post_id = _post_id(args.get("postId"), "check")
    comment_id = _optional_comment_id(args.get("commentId"), "check")
    slug = (args.get("slug") or "").strip() if isinstance(args.get("slug"), str) else ""
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    with _Net(page) as net:
        signs = _read_start(page, net, _post_url(post_id), "check")
        post = _focal(page, post_id)
        empty = {"found": False, "visible": False, "reactions": None, "comments": None, "reposts": None, "pollVotes": None, "incoming": []}
        if post is None:
            if not signs.get("gonePage"):
                raise CommandError("check: the post did not draw, so nothing could be read")
            return {**empty, **_read_cost(set(), net, signs)}
        opened = _all_open(_expand_comments(page, deadline), post, _comments_on_page(page))
        comments = _comments_on_page(page)
    cost = _read_cost({post_id}, net, signs)
    if comment_id:
        ours = next((comment for comment in comments if comment["id"] == comment_id), None)
        if ours is None:
            return {"found": True, "visible": False if opened else None, "reactions": None, "comments": None, "reposts": None, "pollVotes": None, "incoming": [], **cost}
        replies = [comment for comment in comments if comment["parentId"] == comment_id]
        return {
            "found": True,
            "visible": True,
            "reactions": ours["reactions"],
            "comments": ours["replies"] if ours["replies"] is not None else len(replies),
            "reposts": None,
            "pollVotes": None,
            "incoming": _incoming(replies, slug),
            **cost,
        }
    under = [comment for comment in comments if not comment["parentId"]]
    return {
        "found": True,
        "visible": True,
        "reactions": post["reactions"],
        "comments": post["comments"],
        "reposts": post["reposts"],
        "pollVotes": _poll_votes(post.get("_poll")),
        "incoming": _incoming(under, slug),
        **cost,
    }


def _page_facts(raw, kind, slug):
    """Whether a person's or company's page exists, with its name, headline and followers."""
    text = _plain(raw.get("text"))
    if "this page doesn't exist" in text or "page not found" in text or "profile is not available" in text:
        return {"kind": kind, "slug": slug, "exists": False, "name": "", "headline": "", "followers": None}
    name = (raw.get("name") or "").strip().splitlines()
    if not name:
        return None
    return {
        "kind": kind,
        "slug": slug,
        "exists": True,
        "name": name[0][:200],
        "headline": (raw.get("headline") or "").strip()[:HEADLINE_CHARS],
        "followers": _count_in(raw.get("text") or "", ("followers", "follower")),
    }


def linkedin_lookup(page, args):
    """Whether people and company pages exist, with their names and followers (part 16).

    Each is opened on its own page, at most eight in one read. One that could
    not be read is left out, never written down as missing.
    """
    people = [_slug_arg(slug, "lookup") for slug in (args.get("people") or [])]
    companies = [_slug_arg(slug, "lookup") for slug in (args.get("companies") or [])]
    asked = [("person", slug) for slug in people] + [("company", slug) for slug in companies]
    found = []
    seen = set()
    signs = {}
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    with _Net(page) as net:
        for kind, slug in asked[:LOOKUP_LIMIT]:
            if time.monotonic() >= deadline or net.limited:
                break
            url = "%s/%s/%s/" % (ORIGIN, "in" if kind == "person" else "company", urllib.parse.quote(slug))
            try:
                _goto(page, url)
                _settle(page, net, 8_000)
                signs = _usable(page, "lookup")
            except CommandError:
                raise
            except Exception as error:  # noqa: BLE001 - this one is left out
                print("linkedin lookup: %s would not read: %s" % (slug, _short(error)), flush=True)
                continue
            facts = _page_facts(_run(page, PAGE_TEXT_SCRIPT, {}), kind, slug)
            seen.update(post["postId"] for post in _posts_on_page(page))
            if facts is not None:
                found.append(facts)
    return {"found": found, **_read_cost(seen, net, signs)}


def _group_from(raw):
    """A group's name, about words, rules and members, off its About page's words."""
    lines = [line.strip() for line in (raw.get("text") or "").splitlines() if line.strip()]
    plain = [_plain(line) for line in lines]
    name = (raw.get("name") or (lines[0] if lines else "")).strip()[:200]
    members = None
    for line in lines:
        if re.search(r"\bmembers?\b", line, re.I):
            members = _count_in(line, ("member", "members"))
            if members is not None:
                break

    def section(*headings):
        start = next((index for index, line in enumerate(plain) if line in headings), None)
        if start is None:
            return ""
        out = []
        for line, low in zip(lines[start + 1:], plain[start + 1:]):
            if low in ("about this group", "group rules", "rules", "admins", "members", "show less", "show all"):
                break
            out.append(line)
        return "\n".join(out)[:GROUP_TEXT_CHARS]

    return {"name": name, "description": section("about this group", "about"), "rules": section("group rules", "rules"), "members": members}


def linkedin_group(page, args):
    """A group's name, about words and rules (part 37), from its About page."""
    group_id = _group_id(args.get("groupId"), "group")
    with _Net(page) as net:
        signs = _read_start(page, net, "%s/groups/%s/about/" % (ORIGIN, group_id), "group")
        if signs.get("gonePage"):
            raise CommandError("group: LinkedIn says that group is not there")
        group = _group_from(_run(page, PAGE_TEXT_SCRIPT, {}))
    return {**group, **_read_cost(set(), net, signs)}


def linkedin_seen(page, args):
    """Whether a stranger sees each of the account's latest comments under its post (part 46).

    Each comment's post is opened and its comments opened up. `shown` is None
    when the list could not all be opened in time, never False on a guess.
    """
    _slug_arg(args.get("slug"), "seen")
    asked = []
    for item in args.get("comments") or []:
        if not isinstance(item, dict):
            raise CommandError("seen: a comment to look for is not one LinkedIn uses")
        asked.append((_post_id(item.get("postId"), "seen"), _optional_comment_id(item.get("commentId"), "seen")))
    results = []
    seen = set()
    signs = {}
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    with _Net(page) as net:
        for post_id, comment_id in asked[:SEEN_LIMIT]:
            if not comment_id:
                continue
            if time.monotonic() >= deadline or net.limited:
                results.append({"commentId": comment_id, "shown": None})
                continue
            signs = _read_start(page, net, _post_url(post_id), "seen")
            seen.add(post_id)
            post = _focal(page, post_id)
            if post is None:
                results.append({"commentId": comment_id, "shown": None if not signs.get("gonePage") else False})
                continue
            finished = _expand_comments(page, deadline, presses=4)
            drawn = _comments_on_page(page)
            opened = _all_open(finished, post, drawn)
            ids = {comment["id"] for comment in drawn}
            results.append({"commentId": comment_id, "shown": True if comment_id in ids else (False if opened else None)})
    return {"results": results, **_read_cost(seen, net, signs)}


def linkedin_find_own(page, args):
    """Where a phone's comment or post landed, which the LinkedIn app does not show.

    A comment by its writer and words under `postId`; a post by its words on
    the account's own activity when `postId` is "". `found` is the id, or None.
    """
    slug = _slug_arg(args.get("slug"), "find own")
    text = (args.get("text") or "").strip() if isinstance(args.get("text"), str) else ""
    if not text:
        raise CommandError("find own: no words to look for")
    post_id = (args.get("postId") or "").strip() if isinstance(args.get("postId"), str) else ""
    with _Net(page) as net:
        if post_id:
            post_id = _post_id(post_id, "find own")
            signs = _read_start(page, net, _post_url(post_id), "find own")
            _expand_comments(page, time.monotonic() + READ_BUDGET_SECONDS / 2)
            found = _mine_in_comments(_comments_on_page(page), slug, text)
            return {"found": found, **_read_cost({post_id}, net, signs)}
        signs = _read_start(page, net, "%s/in/%s/recent-activity/all/" % (ORIGIN, urllib.parse.quote(slug)), "find own")
        posts = _posts_on_page(page)
        found = _mine_in_posts(posts, slug, text, since=None)
        return {"found": found, **_read_cost({post["postId"] for post in posts}, net, signs)}


def _mine_in_comments(comments, slug, text, parent_id=""):
    """The id of a comment by `slug` with these words (under `parent_id` when given), or None."""
    for comment in comments:
        if (comment["slug"] or "").lower() != (slug or "").lower():
            continue
        if parent_id and comment["parentId"] != parent_id:
            continue
        if _same_words(text, comment["text"]):
            return comment["id"]
    return None


def _mine_in_posts(posts, slug, text, since=None, repost_of=""):
    """The id of a post by `slug` with these words from `since` on, or None."""
    for post in posts:
        if (post["authorSlug"] or "").lower() != (slug or "").lower():
            continue
        if not _recent(post["postedSeconds"], since):
            continue
        if _same_words(text, post["text"]):
            return post["postId"]
    return None


# --- Writing, from the account's own browser ---------------------------------


def _new_visit():
    return {"beforeSeconds": 0, "afterSeconds": 0, "problems": [], "_sizes": []}


def _finish_visit(visit):
    sizes = visit.pop("_sizes")
    visit["scrolls"] = len(sizes)
    return visit, human.describe_scrolls(sizes)


def _feed(page, seconds, visit, deadline):
    """Time in the home feed, reading. Never reacts, comments or reposts."""
    if urllib.parse.urlparse(page.url or "").path.rstrip("/") != "/feed":
        _goto(page, FEED)
    _settle(page, None, 10_000)
    visit["_sizes"].extend(human.browse(page, seconds, deadline))


def _signed_in_feed(page, step):
    """Goes to the feed and returns the signed-in member's signs (`slug`, `name`), or raises naming what is in the way."""
    try:
        _goto(page, FEED)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: LinkedIn's feed would not open: %s" % (step, _short(error)))
    deadline = time.monotonic() + 12
    while True:
        signs = _signs(page)
        if signs["checked"] or time.monotonic() >= deadline:
            break
        page.wait_for_timeout(600)
    signs = _usable(page, step)
    if signs["limited"]:
        raise CommandError("%s: %s" % (step, signs["reason"] or "LinkedIn says this account has reached its limit"))
    return signs


def _box_text(box):
    """What the box holds now: a text box's value, or an editor's drawn words."""
    try:
        return box.input_value(timeout=2_000)
    except Exception:  # noqa: BLE001 - LinkedIn's editors are not text boxes
        pass
    try:
        return box.inner_text(timeout=2_000)
    except Exception:  # noqa: BLE001
        return ""


def _check_box(box, text, step, nothing="Nothing was posted."):
    """Reads the box back before the press, and refuses unless it holds the words written."""
    if not _box_matches(text, _box_text(box)):
        raise CommandError("%s: the words in the box did not match what was written. %s" % (step, nothing))


def _mention_list_showing(page):
    try:
        found = page.locator(SELECTORS["mention_list"])
        return any(found.nth(index).is_visible() for index in range(min(found.count(), 3)))
    except Exception:  # noqa: BLE001
        return False


def _pick_tag(page, tag, step):
    """Picks the person or page named by `tag` in LinkedIn's @ list: only the choice whose link is theirs."""
    deadline = time.monotonic() + 8
    while time.monotonic() < deadline:
        options = page.locator(SELECTORS["mention_list"])
        try:
            count = options.count()
        except Exception:  # noqa: BLE001
            count = 0
        for index in range(min(count, 8)):
            option = options.nth(index)
            try:
                href = option.get_attribute("data-entity-href") or option.get_attribute("href") or ""
                if not href:
                    link = option.locator("a").first
                    href = link.get_attribute("href") if link.count() else ""
            except Exception:  # noqa: BLE001
                continue
            _kind, slug = _slug_from_href(href or "")
            if slug.lower() == tag["slug"].lower():
                human.click(option)
                page.wait_for_timeout(random.randint(300, 700))
                return
        page.wait_for_timeout(500)
    raise CommandError("%s: LinkedIn's list did not offer %s (%s) for the tag. Nothing was posted." % (step, tag["name"], tag["slug"]))


def _type_into(page, box, text, step, tags=()):
    """Types the words a line at a time, picking each tag from LinkedIn's @ list as it is reached.

    A line break is Shift+Enter, never Enter: with LinkedIn's "Press Enter to
    Send" on, Enter sends the box. Shift+Enter while LinkedIn's @ list is open
    may still pick a name, so before each line break the list, when it is
    showing, is closed with Escape. Escape is never pressed otherwise: in a
    pop-up composer it would ask to throw the post away.
    """
    try:
        human.click(box)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the box could not be pressed: %s" % (step, _short(error)))
    gaps = []
    names = sorted({tag["name"] for tag in tags}, key=len, reverse=True)
    pattern = re.compile("(%s)" % "|".join(re.escape("@" + name) for name in names)) if names else None
    lines = text.split("\n")
    for index, line in enumerate(lines):
        pieces = pattern.split(line) if pattern else [line]
        for piece in pieces:
            if not piece:
                continue
            tag = next((tag for tag in tags if pattern and piece == "@" + tag["name"]), None)
            gaps.extend(human.type_text(box, piece) or [])
            if tag:
                _pick_tag(page, tag, step)
        if index == len(lines) - 1:
            break
        page.wait_for_timeout(random.randint(400, 800))
        if _mention_list_showing(page):
            page.keyboard.press("Escape")
            page.wait_for_timeout(random.randint(200, 400))
        page.keyboard.press("Shift+Enter")
    human.pause_before_submit(page)
    return gaps


def _after_press(step, look):
    """Runs a step after Post, Send, Save or Publish was pressed.

    Whatever fails in it says the words may already be on LinkedIn, the words
    the app matches before it lets anyone send again. LinkedIn's own refusal
    passes through as it is, because nothing went up.
    """
    try:
        return look()
    except _Refused:
        raise
    except Exception as error:  # noqa: BLE001 - reported with the warning
        words = str(error) or error.__class__.__name__
        if "may already be on LinkedIn" in words:
            raise
        if words.startswith(step + ": "):
            words = words[len(step) + 2:]
        raise CommandError("%s: %s. %s" % (step, _short(Exception(words)).rstrip("."), MAY_BE_ON_LINKEDIN)) from error


def _must(look, step, what):
    """A look after a press that raises when it finds nothing, so `_after_press` says it may already be on LinkedIn."""

    def checked():
        if not look():
            raise CommandError("%s: %s" % (step, what))
        return True

    return checked


def _press(page, selectors, step, words, scope=None):
    """Presses LinkedIn's button once, after waiting for LinkedIn to switch it on. Never pressed twice.

    Looked for inside `scope` when given (a comment's card, the post's card),
    so a button somewhere else on the page is never the one pressed. Refused
    when the write is too close to its launcher limit.
    """
    button = _first_visible(scope if scope is not None else page, selectors if isinstance(selectors, list) else [selectors], 8_000)
    if button is None:
        raise CommandError("%s: there is no %s button. Nothing was sent." % (step, words))
    until = time.monotonic() + 60
    while button.get_attribute("disabled") is not None or button.get_attribute("aria-disabled") == "true":
        if time.monotonic() >= until:
            raise CommandError("%s: LinkedIn kept the %s button switched off (a file still uploading, or words it would not take). Nothing was sent." % (step, words))
        page.wait_for_timeout(500)
    _time_to_press(step, words)
    human.click(button)


def _pick_actor(page, toggle_selector, page_id, step, scope=None):
    """Switches "Comment as" or "Post as" to the company page `page_id`, and returns the page's name.

    The switch is looked for inside `scope` when given. Refuses when the page
    is not in LinkedIn's list.
    """
    toggle = _first_visible(scope if scope is not None else page, [toggle_selector], 5_000)
    if toggle is None:
        raise CommandError("%s: there is no switch to write as a company page, so this member runs none. Nothing was sent." % step)
    human.click(toggle)
    page.wait_for_timeout(random.randint(700, 1300))
    pages = _pages_from(_run(page, PAGES_SCRIPT, []))
    wanted = next((item for item in pages if item["pageId"] == page_id), None)
    if wanted is None:
        try:
            page.keyboard.press("Escape")
        except Exception:  # noqa: BLE001
            pass
        raise CommandError("%s: the company page %s is not in LinkedIn's list of pages this member may write as. Nothing was sent." % (step, page_id))
    options = page.locator(SELECTORS["actor_choice"])
    for index in range(min(options.count(), 12)):
        option = options.nth(index)
        urn = option.get_attribute("data-urn") or option.get_attribute("value") or option.get_attribute("data-actor-urn") or ""
        if urn.endswith(":" + page_id):
            human.click(option)
            page.wait_for_timeout(random.randint(500, 900))
            done = _first_visible(page, ["[role='dialog'] button:text-is('Save')", "[role='dialog'] button:text-is('Done')"], 2_000)
            if done is not None:
                human.click(done)
            return wanted["name"]
    raise CommandError("%s: the company page %s could not be picked. Nothing was sent." % (step, page_id))


def _actor_label(where, toggle_selector):
    """The "Comment as" or "Post as" switch's own words inside `where` (a card, or the page), or None when there is no switch."""
    try:
        return where.evaluate(ACTOR_SCRIPT, toggle_selector)
    except Exception:  # noqa: BLE001
        return None


def _check_actor(page, toggle_selector, name, step, scope=None):
    """Reads back who the box writes as before anything is typed, and refuses unless it is `name`.

    `name` is the company page picked, or the member. A member who runs no
    page has no switch at all, and writes as themself. With a switch there,
    its words must name who was meant, or nothing is sent: a comment as the
    wrong page, or as the member when a page was meant, is the one mistake
    that cannot be taken back quietly.
    """
    label = _actor_label(scope if scope is not None else page, toggle_selector)
    if label is None:
        return
    if not name or _plain(name) not in _plain(label):
        raise CommandError("%s: LinkedIn's switch says it writes as \"%s\", not %s. Nothing was sent." % (step, (label or "").strip()[:80], name or "the member"))


def _react_once(page, post_id, step, visit):
    """Gives the post one Like, unless the account reacted already. Says whether it pressed."""
    card = page.locator("%s[data-urn$=':%s']" % ("div", post_id))
    scope = card.first if card.count() else page
    button = _first_visible(scope, [SELECTORS["like_button"]], 4_000)
    if button is None:
        visit["problems"].append("no Like button on the post, so the comment went without one")
        return False
    if (button.get_attribute("aria-pressed") or "").lower() == "true":
        return False
    human.click(button)
    page.wait_for_timeout(random.randint(*REACT_THEN_WAIT_SECONDS) * 1000)
    return True


def _comment_landed(page, net, slug, post_id, parent_id, text, before):
    """The id of the comment just sent: LinkedIn's answer to the press, else the comment found on the page.

    Ids already on the page before the press, and the comment answered,
    never count.
    """
    deadline = time.monotonic() + LANDED_WAIT_SECONDS
    skip = set(before) | {parent_id}
    while True:
        comments, _activities = net.created(skip)
        found = _only(comments)
        if found:
            return found
        drawn = [comment for comment in _comments_on_page(page) if comment["id"] not in skip]
        found = _mine_in_comments(drawn, slug, text, parent_id) if slug else _mine_by_words(drawn, text, parent_id)
        if found:
            return found
        if time.monotonic() >= deadline:
            return None
        page.wait_for_timeout(800)


def linkedin_comment(page, args):
    """One comment on a post, or a reply under one of its comments, inside an ordinary visit.

    Before: a few minutes in the feed. Then the post, read; the box opened
    and who it writes as read back; a Like when the app asked for one, the
    account has not reacted already and it writes as the member; the words
    typed at a person's pace, read back, and Post pressed once. After: a
    little more feed.

    Looks first: if our comment with these words is under the post already
    (an earlier try that went out without saying so, however long ago), its
    id is returned and nothing is typed or liked. When the comments could
    not all be opened, or did not draw, nothing is typed either.
    """
    post_id = _post_id(args.get("postId"), "comment")
    parent_id = _optional_comment_id(args.get("parentCommentId"), "comment")
    text = _text_arg(args, "text", "comment", COMMENT_CHARS)
    page_id = _page_id(args.get("asPageId"), "comment")
    react = args.get("react") is True
    _begin_write("comment", "comment")
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = WRITE_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = _new_visit()
    me = _signed_in_feed(page, "comment")
    try:
        _feed(page, random.uniform(*FEED_BEFORE_SECONDS), visit, deadline - reserve)
    except Exception as error:  # noqa: BLE001 - the comment still goes
        visit["problems"].append("the feed before: %s" % _short(error))
    visit["beforeSeconds"] = int(time.monotonic() - started)
    comment_id = _write_comment(page, me["slug"], post_id, parent_id, text, page_id, react, visit, me["name"])
    if not visit.get("alreadyThere"):
        _after_feed(page, visit, FEED_AFTER_SECONDS, deadline)
    _log_visit("comment", visit)
    return {"commentId": comment_id, "url": _comment_url(post_id, comment_id)}


def _write_comment(page, slug, post_id, parent_id, text, page_id, react, visit=None, member_name=""):
    step = "comment"
    with _Net(page) as net:
        try:
            _goto(page, _post_url(post_id))
        except Exception as error:  # noqa: BLE001
            raise CommandError("%s: the post would not open: %s" % (step, _short(error)))
        _settle(page, net)
        _usable(page, step)
        post = _focal(page, post_id)
        if post is None:
            raise CommandError("%s: the post is gone, or only its writer's connections may see it, so nothing was typed" % step)
        opened = _expand_comments(page, time.monotonic() + WRITE_EXPAND_SECONDS, presses=WRITE_MORE_COMMENTS_PRESSES)
        comments = _comments_on_page(page)
        # Every comment must be on the page to know ours is not among them: the
        # list opened to its end, as many drawn as LinkedIn counts, and none
        # drawn only when LinkedIn says none.
        if not _all_open(opened, post, comments):
            raise CommandError("%s: %s" % (step, NO_EARLIER_LOOK))
        # Written as a page, the comment carries the page's name, not the member's.
        writer = slug if not page_id else None
        already = _mine_in_comments(comments, writer, text, parent_id) if writer else _mine_by_words(comments, text, parent_id)
        if already:
            if visit is not None:
                visit["alreadyThere"] = True
            return already
        if not post["canComment"]:
            raise CommandError("%s: the writer turned comments off or limited them to connections, so nothing was typed" % step)
        if visit is not None:
            human.read_page(page, len(post["text"]) or 400, visit["_sizes"])
        # The box, the switch and Post are looked for only inside the comment
        # answered, or the post's own card: the post's main box comes first on
        # the page, and a reply typed there would be a new comment.
        if parent_id:
            scope = _card(page, "article[data-id*=',%s)']" % parent_id)
            if scope is None:
                raise CommandError("%s: the comment to answer is not on the page. Nothing was sent." % step)
            opener = _first_visible(scope, [SELECTORS["reply_open"]], 6_000)
            if opener is None:
                raise CommandError("%s: there is no Reply button on the comment to answer. Nothing was sent." % step)
            human.click(opener)
        else:
            scope = _card(page, "div[data-urn='urn:li:activity:%s']" % post_id)
            if scope is None:
                raise CommandError("%s: the post's own card is not on the page. Nothing was sent." % step)
            if _first_visible(scope, [SELECTORS["comment_box"]], 3_000) is None:
                opener = _first_visible(scope, [SELECTORS["comment_open"]], 6_000)
                if opener is None:
                    raise CommandError("%s: there is no comment box on the post. Nothing was sent." % step)
                human.click(opener)
        box = _first_visible(scope, [SELECTORS["comment_box"]], 10_000)
        if box is None:
            raise CommandError("%s: LinkedIn's comment box did not open. Nothing was sent." % step)
        name = _pick_actor(page, SELECTORS["comment_as"], page_id, step, scope) if page_id else member_name
        _check_actor(page, SELECTORS["comment_as"], name, step, scope)
        # A page's comment goes without a Like: the post's Like button reacts as
        # the member, and a Like from the member beside the page's comment ties the two.
        if react and not page_id and visit is not None:
            _react_once(page, post_id, step, visit)
        gaps = _type_into(page, box, text, step)
        _check_box(box, text, step)
        net.begin()
        _press(page, [SELECTORS["comment_post"]], step, "Post", scope)
        before = {comment["id"] for comment in comments}
        comment_id = _after_press(step, lambda: _comment_landed(page, net, writer or "", post_id, parent_id, text, before))
    if not comment_id:
        raise CommandError("%s: Post was pressed but the comment does not show under the post yet. %s" % (step, MAY_BE_ON_LINKEDIN))
    print("linkedin %s typed: %s" % (step, human.describe_gaps(gaps)), flush=True)
    return comment_id


def _mine_by_words(comments, text, parent_id):
    """A comment with these words written as a company page: any writer, since the page's name is not the member's."""
    for comment in comments:
        if parent_id and comment["parentId"] != parent_id:
            continue
        if comment["kind"] == "company" and _same_words(text, comment["text"]):
            return comment["id"]
    return None


def _after_feed(page, visit, seconds_range, deadline):
    after = time.monotonic()
    try:
        seconds = min(random.uniform(*seconds_range), deadline - after)
        if seconds > 5:
            _feed(page, seconds, visit, deadline)
    except Exception as error:  # noqa: BLE001 - it is on LinkedIn already
        visit["problems"].append("the feed after: %s" % _short(error))
    visit["afterSeconds"] = int(time.monotonic() - after)


def _log_visit(step, visit):
    record, scrolls = _finish_visit(visit)
    print(
        "linkedin %s visit: %d seconds in the feed before, %d after; %s; %s"
        % (step, record["beforeSeconds"], record["afterSeconds"], scrolls, "; ".join(record["problems"]) or "no problems"),
        flush=True,
    )


# --- Media files -------------------------------------------------------------


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
    """Downloads a media library file for LinkedIn's file box, and returns its path.

    Only https, only to a public address, with no redirect followed, only a
    type LinkedIn takes, no bigger than the limit, and within its time.
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
            raise CommandError("%s: the %s is %s, which LinkedIn does not take" % (step, what, kind))
        handle, file_path = tempfile.mkstemp(prefix="promo-linkedin-", suffix=types[kind])
        size = 0
        with os.fdopen(handle, "wb") as out:
            while True:
                left = deadline - time.monotonic()
                if left <= 0:
                    raise CommandError("%s: the %s took longer than %d seconds to download" % (step, what, seconds))
                if connection.pinned is not None:
                    connection.pinned.settimeout(left)
                chunk = answer.read(MEDIA_CHUNK_BYTES)
                if not chunk:
                    break
                size += len(chunk)
                if size > max_bytes:
                    raise CommandError("%s: the %s is bigger than the %d MB Promo sends to LinkedIn" % (step, what, max_bytes // (1024 * 1024)))
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


def _picture_file(url, step):
    return _media_file(url, step, PICTURE_TYPES, PICTURE_MAX_BYTES, PICTURE_SECONDS, "picture")


def _video_file(url, step):
    return _media_file(url, step, VIDEO_TYPES, VIDEO_MAX_BYTES, VIDEO_SECONDS, "video")


# --- Posts of the account's own ----------------------------------------------


def _own_activity(page, slug, net, step, kind="all"):
    """The account's own recent activity, read for an earlier try. (posts, whether anything drew to look in)."""
    return _activity_at(page, "%s/in/%s/recent-activity/%s/" % (ORIGIN, urllib.parse.quote(slug), kind), net, step)


def _page_activity(page, page_id, net, step):
    """A company page's own newest posts, read for an earlier try of a post written as the page. (posts, whether anything drew)."""
    return _activity_at(page, "%s/company/%s/posts/?feedView=all&sortBy=recent" % (ORIGIN, page_id), net, step)


def _activity_at(page, url, net, step):
    try:
        _goto(page, url)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the activity to look in would not open: %s" % (step, _short(error)))
    _settle(page, net)
    ready = _run(page, READY_SCRIPT, {})
    posts = _posts_on_page(page)
    return posts, bool(posts or ready.get("empty"))


def _mine_as_page(posts, text, since=None):
    """The id of a post written as a company page with these words from `since` on, or None. On the page's own posts, every post is the page's."""
    for post in posts:
        if post["authorKind"] == "company" and _recent(post["postedSeconds"], since) and _same_words(text, post["text"]):
            return post["postId"]
    return None


def _attach_media(page, picture_path, video_path, step):
    """Adds the picture or the video in LinkedIn's composer."""
    path = picture_path or video_path
    if not path:
        return
    opener = _first_visible(page, [SELECTORS["media_open"]], 5_000)
    if opener is not None:
        human.click(opener)
        page.wait_for_timeout(random.randint(700, 1300))
    try:
        page.locator("[role='dialog'] " + SELECTORS["file_input"]).first.set_input_files(path)
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the file could not be added in LinkedIn's composer: %s. Nothing was sent." % (step, _short(error)))
    page.wait_for_timeout(random.randint(2000, 4000))
    after = _first_visible(page, [SELECTORS["media_next"]], 60_000 if video_path else 20_000)
    if after is None:
        raise CommandError("%s: the file did not finish loading in LinkedIn's composer. Nothing was sent." % step)
    human.click(after)
    page.wait_for_timeout(random.randint(800, 1500))


def _attach_poll(page, poll, step):
    """Makes the poll in LinkedIn's composer: its question, its answers and how long it runs."""
    question, choices, days = poll
    more = _first_visible(page, [SELECTORS["more_options"]], 4_000)
    if more is not None:
        human.click(more)
        page.wait_for_timeout(random.randint(500, 900))
    opener = _first_visible(page, [SELECTORS["poll_open"]], 5_000)
    if opener is None:
        raise CommandError("%s: there is no poll in LinkedIn's composer. Nothing was sent." % step)
    human.click(opener)
    field = _first_visible(page, [SELECTORS["poll_question"]], 6_000)
    if field is None:
        raise CommandError("%s: LinkedIn's poll has no question box. Nothing was sent." % step)
    human.click(field)
    human.type_text(field, question)
    for index, choice in enumerate(choices):
        boxes = page.locator(SELECTORS["poll_option"])
        if boxes.count() <= index:
            add = _first_visible(page, [SELECTORS["poll_add_option"]], 3_000)
            if add is None:
                raise CommandError("%s: LinkedIn's poll has no box for answer %d. Nothing was sent." % (step, index + 1))
            human.click(add)
            boxes = page.locator(SELECTORS["poll_option"])
        box = boxes.nth(index)
        human.click(box)
        human.type_text(box, choice)
    try:
        page.locator(SELECTORS["poll_duration"]).first.select_option(label=POLL_DAY_WORDS[days])
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the poll's length could not be set: %s. Nothing was sent." % (step, _short(error)))
    done = _first_visible(page, [SELECTORS["poll_done"]], 4_000)
    if done is None:
        raise CommandError("%s: LinkedIn's poll has no Done button. Nothing was sent." % step)
    human.click(done)
    page.wait_for_timeout(random.randint(800, 1500))


def _open_composer(page, repost_of, group_id, step):
    """Opens LinkedIn's composer: on the feed, in a group, or as a repost with your thoughts."""
    if repost_of:
        _goto(page, _post_url(repost_of))
        _settle(page, None, 10_000)
        if _focal(page, repost_of) is None:
            raise CommandError("%s: the post to repost is gone, so nothing was typed" % step)
        button = _first_visible(page, [SELECTORS["repost_button"]], 6_000)
        if button is None:
            raise CommandError("%s: there is no Repost button on the post. Nothing was typed." % step)
        human.click(button)
        item = _first_visible(page, [SELECTORS["repost_with_thoughts"]], 5_000)
        if item is None:
            raise CommandError("%s: LinkedIn did not offer \"Repost with your thoughts\". Nothing was typed." % step)
        human.click(item)
    elif group_id:
        _goto(page, "%s/groups/%s/" % (ORIGIN, group_id))
        _settle(page, None, 10_000)
        button = _first_visible(page, [SELECTORS["group_start_post"], SELECTORS["start_post"]], 8_000)
        if button is None:
            raise CommandError("%s: the group has no place to start a post, so the account may not be a member yet. Nothing was typed." % step)
        human.click(button)
    else:
        if urllib.parse.urlparse(page.url or "").path.rstrip("/") != "/feed":
            _goto(page, FEED)
        button = _first_visible(page, [SELECTORS["start_post"]], 8_000)
        if button is None:
            raise CommandError("%s: there is no \"Start a post\" on the feed. Nothing was typed." % step)
        human.click(button)
    box = _first_visible(page, [SELECTORS["post_box"]], 10_000)
    if box is None:
        raise CommandError("%s: LinkedIn's composer did not open. Nothing was typed." % step)
    return box


def _post_landed(page, net, slug, page_id, text, since, before, step):
    """The activity id of the post just sent.

    LinkedIn's answer to the press when it names exactly one new activity
    (the post reposted, and every post already on the activity looked in
    first, never count); else the post found on the account's or the page's
    own activity.
    """
    deadline = time.monotonic() + LANDED_WAIT_SECONDS
    while time.monotonic() < deadline:
        _comments, activities = net.created(before)
        found = _only(activities)
        if found:
            return found
        page.wait_for_timeout(1_000)
    if page_id:
        posts, _looked = _page_activity(page, page_id, net, step)
        return _mine_as_page([post for post in posts if post["postId"] not in before], text, since=since)
    posts, _looked = _own_activity(page, slug, net, step)
    return _mine_in_posts([post for post in posts if post["postId"] not in before], slug, text, since=since)


def _check_poll(page, poll, step):
    """Reads the poll back off the composer before Post, and refuses unless its question and every answer show."""
    question, choices, _days = poll
    try:
        shown = page.evaluate(POLL_PREVIEW_SCRIPT, SELECTORS)
    except Exception:  # noqa: BLE001
        shown = None
    plain = _plain(shown)
    if not shown or _plain(question) not in plain or any(_plain(choice) not in plain for choice in choices):
        raise CommandError("%s: the poll in the composer did not match what was written. Nothing was posted." % step)


def linkedin_publish(page, args):
    """One post of the account's own, or a repost with thoughts, with a picture, a video or a poll, tags, into a group, or as a page.

    Looks first (from `since`, or the last hour) for a post with these words:
    on the account's own activity, or on the company page's own posts when it
    is written as the page. When it is there, its id is returned and nothing
    is typed. Then the composer; who it writes as read back; the words typed
    with each tag picked from LinkedIn's own @ list; the file or poll added;
    the words (with the tags as LinkedIn draws them) and the poll read back
    last; and Post pressed once.
    """
    step = "publish"
    text = _text_arg(args, "text", step, POST_CHARS)
    since = _since_arg(args.get("since"), step)
    tags = _tags_arg(args.get("tags"), text, step)
    repost_of = (args.get("repostOf") or "").strip() if isinstance(args.get("repostOf"), str) else ""
    if repost_of:
        repost_of = _post_id(repost_of, step)
    group_id = (args.get("groupId") or "").strip() if isinstance(args.get("groupId"), str) else ""
    if group_id:
        group_id = _group_id(group_id, step)
    page_id = _page_id(args.get("asPageId"), step)
    picture_url = (args.get("pictureUrl") or "").strip() if isinstance(args.get("pictureUrl"), str) else ""
    video_url = (args.get("videoUrl") or "").strip() if isinstance(args.get("videoUrl"), str) else ""
    poll = _poll_arg(args.get("poll"), step) if args.get("poll") else None
    if sum(bool(item) for item in (picture_url, video_url, poll, repost_of)) > 1:
        raise CommandError("%s: a post carries one of a picture, a video, a poll or a repost, not several" % step)
    _begin_write("publish", step)
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    visit = _new_visit()
    me = _signed_in_feed(page, step)
    slug = me["slug"]
    files = []
    try:
        with _Net(page) as net:
            if page_id:
                posts, looked = _page_activity(page, page_id, net, step)
                already = _mine_as_page(posts, text, since=since) if looked else None
            else:
                posts, looked = _own_activity(page, slug, net, step)
                already = _mine_in_posts(posts, slug, text, since=since) if looked else None
            if not looked:
                raise CommandError("%s: %s" % (step, NO_EARLIER_LOOK_OWN))
            if already:
                return {"postId": already, "url": _post_url(already)}
            before = {post["postId"] for post in posts} | {repost_of}
            picture_path = _picture_file(picture_url, step) if picture_url else None
            video_path = _video_file(video_url, step) if video_url else None
            files = [path for path in (picture_path, video_path) if path]
            # A video's download counts against the visit: what is left must still cover the typing and the press.
            if time.monotonic() + WRITE_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER > deadline:
                raise CommandError("%s: the file took too long to download, so there is no time left to post it. Nothing was sent." % step)
            try:
                _feed(page, random.uniform(*PUBLISH_FEED_BEFORE_SECONDS), visit, deadline - WRITE_RESERVE_SECONDS - len(text) * TYPING_SECONDS_PER_CHARACTER)
            except Exception as error:  # noqa: BLE001
                visit["problems"].append("the feed before: %s" % _short(error))
            visit["beforeSeconds"] = int(time.monotonic() - started)
            box = _open_composer(page, repost_of, group_id, step)
            name = _pick_actor(page, SELECTORS["post_as"], page_id, step) if page_id else me["name"]
            _check_actor(page, SELECTORS["post_as"], name, step)
            gaps = _type_into(page, box, text, step, tags)
            _attach_media(page, picture_path, video_path, step)
            if poll:
                _attach_poll(page, poll, step)
            # Read back last, after the file or poll is in, right before the press.
            _check_box(box, _shown_words(text, tags), step)
            if poll:
                _check_poll(page, poll, step)
            net.begin()
            _press(page, [SELECTORS["post_send"]], step, "Post")
            post_id = _after_press(step, lambda: _post_landed(page, net, slug, page_id, text, since, before, step))
    finally:
        for path in files:
            try:
                os.unlink(path)
            except OSError:
                pass
    if not post_id:
        raise CommandError("%s: Post was pressed but the post does not show yet. %s" % (step, MAY_BE_ON_LINKEDIN))
    _after_feed(page, visit, PUBLISH_FEED_AFTER_SECONDS, deadline)
    _log_visit(step, visit)
    print("linkedin %s typed: %s" % (step, human.describe_gaps(gaps)), flush=True)
    return {"postId": post_id, "url": _post_url(post_id)}


def _paragraphs(body):
    return [part.strip() for part in re.split(r"\n\s*\n", body or "") if part.strip()]


def _mine_article(posts, title, since=None):
    """The id of the account's shared article with exactly this title from `since` on, or None.

    Matched on the article card's own title, never on words that only
    mention it.
    """
    wanted = _plain(title)
    for post in posts:
        if wanted and _recent(post["postedSeconds"], since) and _plain(post.get("_articleTitle")) == wanted:
            return post["postId"]
    return None


def linkedin_newsletter(page, args):
    """One issue of the account's newsletter (part 36), in LinkedIn's article editor.

    Looks first on the account's articles for one with this title from
    `since`, or the last hour. Then the title typed, the body put in a
    paragraph at a time with a person's pauses, the cover added, read back,
    and Next then Publish pressed once each.
    """
    step = "newsletter"
    title = _text_arg(args, "title", step, TITLE_CHARS, "title")
    body = _text_arg(args, "body", step, BODY_CHARS, "body")
    since = _since_arg(args.get("since"), step)
    cover_url = (args.get("coverUrl") or "").strip() if isinstance(args.get("coverUrl"), str) else ""
    _begin_write("newsletter", step)
    slug = _signed_in_feed(page, step)["slug"]
    cover_path = None
    try:
        with _Net(page) as net:
            posts, looked = _own_activity(page, slug, net, step, "articles")
            if not looked:
                raise CommandError("%s: %s" % (step, NO_EARLIER_LOOK_OWN))
            already = _mine_article(posts, title, since)
            if already:
                return {"postId": already, "url": _post_url(already)}
            before = {post["postId"] for post in posts}
            cover_path = _picture_file(cover_url, step) if cover_url else None
            _goto(page, ORIGIN + "/article/new/")
            title_box = _first_visible(page, [SELECTORS["article_title"]], 15_000)
            body_box = _first_visible(page, [SELECTORS["article_body"]], 15_000)
            if title_box is None or body_box is None:
                raise CommandError("%s: LinkedIn's article editor did not open. Nothing was typed." % step)
            if cover_path:
                try:
                    page.locator(SELECTORS["article_cover"]).first.set_input_files(cover_path)
                except Exception as error:  # noqa: BLE001
                    raise CommandError("%s: the cover could not be added: %s. Nothing was published." % (step, _short(error)))
                page.wait_for_timeout(random.randint(2000, 4000))
            human.click(title_box)
            human.type_text(title_box, title)
            human.click(body_box)
            parts = _paragraphs(body)
            for index, part in enumerate(parts):
                page.keyboard.insert_text(part)
                if index < len(parts) - 1:
                    page.keyboard.press("Shift+Enter")
                page.wait_for_timeout(random.uniform(*PARAGRAPH_PAUSE_SECONDS) * 1000)
            _check_box(title_box, title, step, "Nothing was published.")
            if not _box_matches("\n".join(parts), _box_text(body_box)):
                raise CommandError("%s: the words in the editor did not match what was written. Nothing was published." % step)
            _press(page, [SELECTORS["article_next"]], step, "Next")
            page.wait_for_timeout(random.randint(1500, 3000))
            net.begin()
            _press(page, [SELECTORS["article_publish"]], step, "Publish")
            post_id = _after_press(step, lambda: _newsletter_landed(page, net, slug, title, since, before, step))
    finally:
        if cover_path:
            try:
                os.unlink(cover_path)
            except OSError:
                pass
    if not post_id:
        raise CommandError("%s: Publish was pressed but the issue does not show yet. %s" % (step, MAY_BE_ON_LINKEDIN))
    return {"postId": post_id, "url": _post_url(post_id)}


def _newsletter_landed(page, net, slug, title, since, before, step):
    deadline = time.monotonic() + LANDED_WAIT_SECONDS
    while time.monotonic() < deadline:
        _comments, activities = net.created(before)
        found = _only(activities)
        if found:
            return found
        page.wait_for_timeout(1_000)
    posts, _looked = _own_activity(page, slug, net, step, "articles")
    return _mine_article([post for post in posts if post["postId"] not in before], title, since)


# --- Changing what went out --------------------------------------------------


def _open_own(page, post_id, step):
    try:
        _goto(page, _post_url(post_id))
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the post would not open: %s" % (step, _short(error)))
    _settle(page, None)
    signs = _usable(page, step)
    if _focal(page, post_id) is None:
        raise CommandError("%s: the post is not there any more" % step)
    return signs


def _menu_item(page, scope, menu, item, step, what):
    opener = _first_visible(scope, [SELECTORS[menu]], 6_000)
    if opener is None:
        raise CommandError("%s: there is no menu on the %s" % (step, what))
    human.click(opener)
    choice = _first_visible(page, [SELECTORS[item]], 4_000)
    if choice is None:
        raise CommandError("%s: the %s's menu has no %s" % (step, what, item.split("_")[-1].title()))
    human.click(choice)


def linkedin_edit(page, args):
    """New words for a comment of ours, or for a post of ours when `commentId` is "" (part 45).

    When the comment or post already shows the new words (an earlier try that
    saved), nothing is pressed. Otherwise the menu's Edit, the words replaced
    at a person's pace, read back, and Save pressed once.
    """
    step = "edit"
    post_id = _post_id(args.get("postId"), step)
    comment_id = _optional_comment_id(args.get("commentId"), step)
    text = _text_arg(args, "text", step, COMMENT_CHARS if comment_id else POST_CHARS)
    _begin_write("edit", step)
    signs = _open_own(page, post_id, step)
    if comment_id:
        _expand_comments(page, time.monotonic() + 30)
        ours = next((comment for comment in _comments_on_page(page) if comment["id"] == comment_id), None)
        if ours is None:
            raise CommandError("%s: our comment is not under the post any more" % step)
        if _same_words(text, ours["text"]):
            return {"done": True}
        scope = page.locator("article[data-id*=',%s)']" % comment_id).first
        _menu_item(page, scope, "comment_menu", "menu_edit", step, "comment")
        box = _first_visible(scope, [SELECTORS["comment_box"], ".ql-editor[contenteditable='true']"], 6_000)
    else:
        post = _focal(page, post_id)
        if post and (post["authorSlug"] or "").lower() != (signs["slug"] or "").lower():
            raise CommandError("%s: that post is not this account's" % step)
        if post and _same_words(text, post["text"]):
            return {"done": True}
        _menu_item(page, page, "post_menu", "menu_edit", step, "post")
        box = _first_visible(page, [SELECTORS["post_box"]], 8_000)
    if box is None:
        raise CommandError("%s: LinkedIn's edit box did not open. Nothing was changed." % step)
    human.click(box)
    page.keyboard.press("ControlOrMeta+A")
    page.keyboard.press("Backspace")
    _type_into(page, box, text, step)
    _check_box(box, text, step, "Nothing was changed.")
    if comment_id:
        _press(page, [SELECTORS["edit_save"]], step, "Save", scope)
    else:
        _press(page, ["[role='dialog'] " + part.strip() for part in SELECTORS["edit_save"].split(",")] + [SELECTORS["post_send"]], step, "Save")

    def shows_new():
        page.wait_for_timeout(3_000)
        if comment_id:
            ours = next((comment for comment in _comments_on_page(page) if comment["id"] == comment_id), None)
            return bool(ours and _same_words(text, ours["text"]))
        post = _focal(page, post_id)
        return bool(post and _same_words(text, post["text"]))

    _after_press(step, _must(shows_new, step, "Save was pressed but LinkedIn still shows the old words"))
    return {"done": True}


def linkedin_delete(page, args):
    """Deletes a comment of ours, or a post of ours when `commentId` is "".

    When it is gone already, nothing is pressed and the answer is done.
    """
    step = "delete"
    post_id = _post_id(args.get("postId"), step)
    comment_id = _optional_comment_id(args.get("commentId"), step)
    _begin_write("delete", step)
    try:
        _goto(page, _post_url(post_id))
    except Exception as error:  # noqa: BLE001
        raise CommandError("%s: the post would not open: %s" % (step, _short(error)))
    _settle(page, None)
    signs = _usable(page, step)
    post = _focal(page, post_id)
    if post is None:
        # Gone with its post: LinkedIn's own words say so. A page that did not draw says nothing.
        if signs.get("gonePage"):
            return {"done": True}
        raise CommandError("%s: the post did not draw, so nothing was pressed" % step)
    if comment_id:
        _expand_comments(page, time.monotonic() + 30)
        if not any(comment["id"] == comment_id for comment in _comments_on_page(page)):
            return {"done": True}
        _menu_item(page, page.locator("article[data-id*=',%s)']" % comment_id).first, "comment_menu", "menu_delete", step, "comment")
    else:
        if (post["authorSlug"] or "").lower() != (signs["slug"] or "").lower():
            raise CommandError("%s: that post is not this account's" % step)
        _menu_item(page, page, "post_menu", "menu_delete", step, "post")
    _press(page, [SELECTORS["confirm_delete"]], step, "Delete")

    def gone():
        page.wait_for_timeout(3_000)
        if comment_id:
            return _focal(page, post_id) is not None and not any(comment["id"] == comment_id for comment in _comments_on_page(page))
        _goto(page, _post_url(post_id))
        _settle(page, None, 8_000)
        # A page that did not draw is not a deleted post: only LinkedIn's own words say so.
        return _focal(page, post_id) is None and bool(_signs(page).get("gonePage"))

    _after_press(step, _must(gone, step, "Delete was pressed but it still shows on LinkedIn"))
    return {"done": True}


# --- People ------------------------------------------------------------------

LIMIT_INVITE_PHRASES = ("you've reached the weekly invitation limit", "weekly invitation limit", "you've reached your weekly limit")


def _names_person(label, name):
    """True when a button's label names the profile's person, so a button for somebody else is never pressed."""
    wanted = _plain(name)
    return bool(wanted) and wanted in _plain(label)


def _connect_state(actions):
    """What the profile's own buttons say about the account and its person: "connect", "pending", "connected", or "".

    Read only off the profile's actions and its degree badge: "1st" is
    connected, a Pending button naming the person is a request out, an
    Invite button naming the person (or More, which may hold it) is connect.
    """
    name = ((actions or {}).get("name") or "").strip()
    labels = (actions or {}).get("labels") or []
    if re.search(r"\b1st\b", _plain((actions or {}).get("degree"))):
        return "connected"
    if any(_plain(label).startswith("pending") and _names_person(label, name) for label in labels):
        return "pending"
    if any(_plain(label).startswith("invite") and _names_person(label, name) for label in labels):
        return "connect"
    if any(_plain(label) == "more actions" or _plain(label) == "more" for label in labels):
        return "connect"
    return ""


def _profile_actions(page):
    return _run(page, ACTIONS_SCRIPT, {})


def linkedin_connect(page, args):
    """One connection request from the person's page, with the note or without (part 39).

    Already connected or asked: nothing is pressed, and `already` says so.
    Otherwise Connect, found only among the profile's own buttons (or its More
    menu) and only when its label names the person; Add a note when there is
    one, the note typed and read back; and Send pressed once. Done when the
    profile's own buttons show Pending for them; anything else after Send
    says it may already be on LinkedIn.
    """
    step = "connect"
    slug = _slug_arg(args.get("slug"), step)
    note = (args.get("note") or "").strip() if isinstance(args.get("note"), str) else ""
    if len(note) > NOTE_CHARS:
        raise CommandError("%s: the note is longer than LinkedIn's %d characters" % (step, NOTE_CHARS))
    _begin_write("connect", step)
    me = _signed_in_feed(page, step)["slug"]
    if me.lower() == slug.lower():
        raise CommandError("%s: that is the account itself" % step)
    _goto(page, "%s/in/%s/" % (ORIGIN, urllib.parse.quote(slug)))
    _settle(page, None, 10_000)
    _usable(page, step)
    actions = _profile_actions(page)
    name = (actions.get("name") or "").strip().splitlines()[0] if (actions.get("name") or "").strip() else ""
    if not actions.get("found") or not name:
        raise CommandError("%s: %s's own buttons did not draw. Nothing was sent." % (step, slug))
    state = _connect_state(actions)
    if state in ("pending", "connected"):
        return {"done": False, "already": True}
    scope = _first_visible(page, [SELECTORS["profile_actions"]], 6_000)
    if scope is None:
        raise CommandError("%s: %s's own buttons did not draw. Nothing was sent." % (step, slug))
    button = _first_visible(scope, [SELECTORS["connect_button"]], 4_000)
    if button is not None and not _names_person(button.get_attribute("aria-label") or "", name):
        button = None
    if button is None:
        more = _first_visible(scope, [SELECTORS["more_actions"]], 4_000)
        if more is None:
            raise CommandError("%s: there is no Connect on %s's page. Nothing was sent." % (step, slug))
        human.click(more)
        button = _first_visible(page, [SELECTORS["menu_connect"]], 4_000)
        if button is not None and not _names_person(button.get_attribute("aria-label") or "", name):
            button = None
        if button is None:
            raise CommandError("%s: %s's page offers no Connect for them, so they may only take requests from people they know. Nothing was sent." % (step, slug))
    _time_to_press(step, "Connect")
    human.click(button)
    page.wait_for_timeout(random.randint(800, 1500))
    limit = _plain(_run(page, PAGE_TEXT_SCRIPT, {}).get("text"))
    if any(phrase in limit for phrase in LIMIT_INVITE_PHRASES):
        raise _Refused("%s: LinkedIn says the account has reached its weekly invitation limit. Nothing was sent." % step)

    def refuse(words):
        # Some profiles send the request on the Connect click itself, with no dialog.
        if _connect_state(_profile_actions(page)) == "pending":
            raise CommandError("%s: the request went when Connect was pressed, without the note. %s" % (step, MAY_BE_ON_LINKEDIN))
        raise CommandError("%s: %s Nothing was sent." % (step, words))

    if note:
        add = _first_visible(page, [SELECTORS["add_note"]], 5_000)
        if add is None:
            refuse("LinkedIn did not offer Add a note.")
        human.click(add)
        box = _first_visible(page, [SELECTORS["note_box"]], 5_000)
        if box is None:
            refuse("LinkedIn's note box did not open.")
        _type_into(page, box, note, step)
        _check_box(box, note, step, "Nothing was sent.")
        _press(page, [SELECTORS["send_invite"]], step, "Send")
    else:
        if _first_visible(page, [SELECTORS["send_without_note"], SELECTORS["send_invite"]], 5_000) is None:
            if _connect_state(_profile_actions(page)) == "pending":
                return {"done": True, "already": False}
            refuse("there is no Send button.")
        _press(page, [SELECTORS["send_without_note"], SELECTORS["send_invite"]], step, "Send")

    def pending():
        page.wait_for_timeout(2_500)
        return _connect_state(_profile_actions(page)) == "pending"

    _after_press(step, _must(pending, step, "Send was pressed but %s's page does not show the request as Pending" % slug))
    return {"done": True, "already": False}


def _people(raw, limit):
    """People out of a drawn list: each once, with their name, headline and the rest of their lines."""
    out, slugs = [], set()
    for item in raw or []:
        kind, slug = _slug_from_href(item.get("href") or "")
        if kind != "person" or not slug or slug.lower() in slugs:
            continue
        lines = [line for line in item.get("lines") or [] if line and not re.fullmatch(r"(?i)accept|ignore|message|connect|view profile", line)]
        if not lines:
            continue
        slugs.add(slug.lower())
        out.append({"slug": slug, "name": lines[0][:200], "headline": (lines[1] if len(lines) > 1 else "")[:HEADLINE_CHARS], "rest": lines[2:]})
        if len(out) >= limit:
            break
    return out


def linkedin_invites(page, args):
    """The connection requests waiting on the account (part 40). Read only: nothing is accepted here."""
    step = "invites"
    try:
        limit = max(1, min(INVITES_LIMIT, int(args.get("max") or 50)))
    except (TypeError, ValueError):
        raise CommandError("%s: max must be a number" % step) from None
    _signed_in_feed(page, step)
    _goto(page, ORIGIN + "/mynetwork/invitation-manager/received/")
    _settle(page, None, 10_000)
    _usable(page, step)
    people = _people(_run(page, PEOPLE_SCRIPT, []), limit)
    invites = []
    for person in people:
        # A note sits on its own line in quotes, or after "Message:".
        note = next((line.strip('"“”') for line in person["rest"] if line.startswith(('"', "“")) or len(line) > 60), "")
        invites.append({"slug": person["slug"], "name": person["name"], "headline": person["headline"], "note": note[:1000]})
    return {"invites": invites}


def linkedin_accept(page, args):
    """Accepts one waiting request, from the invitations page.

    When the request is not there any more and the person shows as
    connected, it was accepted already and nothing is pressed.
    """
    step = "accept"
    slug = _slug_arg(args.get("slug"), step)
    _begin_write("accept", step)
    _signed_in_feed(page, step)
    _goto(page, ORIGIN + "/mynetwork/invitation-manager/received/")
    _settle(page, None, 10_000)
    _usable(page, step)
    cards = page.locator(SELECTORS["invite_card"])
    target = None
    for index in range(min(cards.count(), INVITES_LIMIT)):
        card = cards.nth(index)
        link = card.locator("a[href*='/in/']").first
        try:
            href = link.get_attribute("href") if link.count() else ""
        except Exception:  # noqa: BLE001
            continue
        _kind, found = _slug_from_href(href or "")
        if found.lower() == slug.lower():
            target = card
            break
    if target is None:
        _goto(page, "%s/in/%s/" % (ORIGIN, urllib.parse.quote(slug)))
        _settle(page, None, 8_000)
        if _connect_state(_profile_actions(page)) == "connected":
            return {"done": True}
        raise CommandError("%s: there is no waiting request from %s any more. Nothing was pressed." % (step, slug))
    button = _first_visible(target, [SELECTORS["invite_accept"]], 4_000)
    if button is None:
        raise CommandError("%s: the request from %s has no Accept button. Nothing was pressed." % (step, slug))
    human.click(button)

    def accepted():
        page.wait_for_timeout(2_500)
        # LinkedIn turns the card into "You're now connected"; the request still
        # showing is its Accept button still there.
        return _first_visible(target, [SELECTORS["invite_accept"]], 1_500) is None

    _after_press(step, _must(accepted, step, "Accept was pressed but the request still shows"))
    return {"done": True}


def _viewed_seconds(lines, now=None):
    """When a viewer looked, from their "Viewed 2d ago" line, or None."""
    for line in lines:
        if re.search(r"(?i)viewed|ago", line):
            seconds = _posted_seconds(line, now)
            if seconds is not None:
                return seconds
    return None


def linkedin_viewers(page, args):
    """Who viewed the account's profile (part 41), as many as LinkedIn shows it. Read only.

    A free account sees a few; `premiumNeeded` says when LinkedIn hid the rest
    behind Premium, and `total` is LinkedIn's own count when it shows one.
    """
    step = "viewers"
    try:
        limit = max(1, min(VIEWERS_LIMIT, int(args.get("max") or 50)))
    except (TypeError, ValueError):
        raise CommandError("%s: max must be a number" % step) from None
    _signed_in_feed(page, step)
    _goto(page, ORIGIN + "/me/profile-views/")
    _settle(page, None, 10_000)
    _usable(page, step)
    raw = _run(page, PAGE_TEXT_SCRIPT, {})
    text = raw.get("text") or ""
    total = None
    found = re.search(r"(\d[\d,.]*\s*[KkMm]?)\s+profile view(?:er)?s?", text, re.I)
    if found:
        total = _number(found.group(1))
    premium_needed = bool(re.search(r"(?i)try premium|unlock|see all your viewers with premium|reactivate premium", text))
    people = _people(_run(page, PEOPLE_SCRIPT, []), limit)
    viewers = [{"slug": person["slug"], "name": person["name"], "headline": person["headline"], "viewedSeconds": _viewed_seconds(person["rest"])} for person in people]
    return {"viewers": viewers, "total": total, "premiumNeeded": premium_needed}


NUMBER_LABELS = {
    "followers": ("followers", "follower"),
    "connections": ("connections", "connection"),
    "profileViews": ("profile viewers", "profile views", "profile viewer"),
    "impressions": ("post impressions", "impressions"),
}


def _labelled(text, labels):
    """The number written just before (or on the line before) one of these labels, or None."""
    lines = [line.strip() for line in (text or "").splitlines() if line.strip()]
    for index, line in enumerate(lines):
        low = _plain(line)
        for label in labels:
            if low.endswith(label) or low == label:
                found = re.match(r"(\d[\d,.]*\s*[KkMm]?)\+?\s+" + re.escape(label), low)
                if found:
                    return _number(found.group(1))
                if low == label and index > 0:
                    value = _number(lines[index - 1])
                    if value is not None:
                        return value
    return None


def linkedin_numbers(page, args=None):
    """The account's own numbers off its dashboard (part 47). Read only.

    A number LinkedIn shows only to Premium, or did not show, is None, never 0.
    """
    step = "numbers"
    slug = _signed_in_feed(page, step)["slug"]
    _goto(page, ORIGIN + "/dashboard/")
    _settle(page, None, 10_000)
    _usable(page, step)
    dashboard = _run(page, PAGE_TEXT_SCRIPT, {}).get("text") or ""
    out = {key: _labelled(dashboard, labels) for key, labels in NUMBER_LABELS.items()}
    if out["followers"] is None or out["connections"] is None:
        _goto(page, "%s/in/%s/" % (ORIGIN, urllib.parse.quote(slug)))
        _settle(page, None, 8_000)
        profile = _run(page, PAGE_TEXT_SCRIPT, {}).get("text") or ""
        if out["followers"] is None:
            out["followers"] = _count_in(profile, ("followers", "follower"))
        if out["connections"] is None:
            out["connections"] = _count_in(profile, ("connections", "connection"))
    return out


def linkedin_feed(page, args):
    """The newest posts in the account's own home feed (part 13). Read only, at a person's pace."""
    step = "feed"
    try:
        want = max(1, min(SEARCH_LIMIT, int(args.get("max") or 20)))
    except (TypeError, ValueError):
        raise CommandError("%s: max must be a number" % step) from None
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    _signed_in_feed(page, step)
    with _Net(page) as net:
        _settle(page, net)
        posts, _seen = _collect(page, net, want, deadline)
    out = []
    for position, post in enumerate(posts):
        item = _clean_post(post)
        item["position"] = position
        out.append(item)
    return {"posts": out}


def _search_as_person(page, words, visit, deadline):
    """Types words into LinkedIn's search box, goes to its Posts results, and reads for a while."""
    box = _first_visible(page, ["input.search-global-typeahead__input", "input[placeholder='Search']"], 5_000)
    if box is None:
        raise RuntimeError("LinkedIn's search box did not show")
    human.click(box)
    page.keyboard.press("ControlOrMeta+A")
    page.keyboard.press("Backspace")
    human.type_text(box, words)
    page.wait_for_timeout(random.randint(400, 1000))
    page.keyboard.press("Enter")
    human.wait_for_address(page, lambda address: "/search/results" in address)
    page.wait_for_timeout(random.randint(1500, 3000))
    posts_tab = _first_visible(page, ["button:has-text('Posts')", "a:has-text('Posts')"], 6_000)
    if posts_tab is not None:
        human.click(posts_tab)
        page.wait_for_timeout(random.randint(1500, 3000))
    visit["_sizes"].extend(human.browse(page, random.uniform(*WARM_UP_SEARCH_SECONDS), deadline))


def linkedin_warm_up(page, args):
    """A warming account's day on LinkedIn: the feed, then a search or two on its topic.

    Read only: nothing is liked, commented, reposted, followed or connected.
    `postsRead` is how many posts LinkedIn put in front of the account.
    """
    words = [word.strip()[:100] for word in (args.get("words") or []) if isinstance(word, str) and word.strip()]
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    visit = _new_visit()
    seen = set()
    _signed_in_feed(page, "warm up")
    try:
        _feed(page, random.uniform(*WARM_UP_FEED_SECONDS), visit, deadline)
    except Exception as error:  # noqa: BLE001 - the day carries on
        visit["problems"].append("the feed: %s" % _short(error))
    seen.update(post["postId"] for post in _posts_on_page(page))
    if words:
        for word in random.sample(words, min(len(words), random.randint(*WARM_UP_SEARCHES))):
            if time.monotonic() >= deadline:
                break
            try:
                _search_as_person(page, word, visit, deadline)
            except Exception as error:  # noqa: BLE001
                visit["problems"].append("searching %s: %s" % (word, _short(error)))
            seen.update(post["postId"] for post in _posts_on_page(page))
    record, scrolls = _finish_visit(visit)
    print("linkedin warm-up: %d posts read; %s; %s" % (len(seen), scrolls, "; ".join(record["problems"]) or "no problems"), flush=True)
    return {"postsRead": len(seen), "problems": record["problems"]}


# --- Messages ----------------------------------------------------------------


WEEKDAYS = ("mon", "tue", "wed", "thu", "fri", "sat", "sun")


CLOCK_SCRIPT = """
() => {
  /* linkedin:clock */
  // The page's own clock: LinkedIn draws message times in the browser's zone, which is the proxy's, not the container's.
  const now = new Date()
  return { now: now.getTime() / 1000, offset: -now.getTimezoneOffset() * 60 }
}
"""


def _page_clock(page):
    """(now, the page's zone as seconds east of UTC) off the page's own `new Date()`, or (now, None) when it would not say."""
    try:
        clock = page.evaluate(CLOCK_SCRIPT)
        return float(clock["now"]), int(clock["offset"])
    except Exception:  # noqa: BLE001
        return time.time(), None


def _message_seconds(text, now=None, offset=None):
    """When a message was sent, from LinkedIn's time on it, as seconds since 1970, or None.

    LinkedIn writes "10:42 AM" for today, "Yesterday", a weekday ("Mon") for
    this week and a date ("Oct 21") before that, and "5m" in the list. A
    clock time is today's in the page's zone (`offset`, seconds east of
    UTC), or yesterday's when that would be in the future; with the zone not
    known it is not read at all. Yesterday, a weekday or a date is more than
    a day ago; only the day is known, so they answer None. None is never
    "recent".
    """
    now = time.time() if now is None else now
    plain = _plain(text)
    found = re.fullmatch(r"(\d{1,2}):(\d{2})\s*([ap]m)?", plain)
    if found:
        hour, minute = int(found.group(1)), int(found.group(2))
        if found.group(3):
            if hour > 12 or hour == 0:
                return None
            hour = hour % 12 + (12 if found.group(3) == "pm" else 0)
        if hour > 23 or minute > 59 or offset is None:
            return None
        midnight = (now + offset) // 86400 * 86400 - offset
        moment = midnight + hour * 3600 + minute * 60
        return moment - 86400 if moment > now + 60 else moment
    if plain.startswith("yesterday") or plain[:3] in WEEKDAYS or re.match(r"[a-z]{3} \d{1,2}", plain):
        return None
    if re.fullmatch(r"\d+\s*(?:mo|yr|min|hr|s|m|h|d|w|y)(?: ago)?", plain) or plain in ("now", "just now"):
        return _posted_seconds(plain, now)
    return None


def _thread_id(href):
    found = re.search(r"/messaging/thread/([A-Za-z0-9_=-]{5,200})", urllib.parse.unquote(href or ""))
    return found.group(1) if found else ""


def _messages_from(raw, own_slug, conversation_id, now=None, offset=None):
    """The messages in an open conversation from people other than the account."""
    out = []
    for item in (raw or {}).get("messages") or []:
        _kind, slug = _slug_from_href(item.get("href") or "")
        if not slug or slug.lower() == (own_slug or "").lower():
            continue
        text = (item.get("text") or "").strip()
        if not text:
            continue
        out.append({
            "id": item.get("urn") or "%s:%d" % (conversation_id, len(out)),
            "conversationId": conversation_id,
            "name": (item.get("name") or "").strip()[:200],
            "slug": slug,
            "text": text[:4_000],
            "sentSeconds": _message_seconds(item.get("time") or "", now, offset),
        })
    return out


def linkedin_inbox(page, args=None):
    """The newest messages to the account, from people other than itself (part 42).

    The newest conversations are opened in turn, at most eight and inside the
    read's time, and each's messages from the other person are read. Nothing
    is sent.
    """
    step = "inbox"
    deadline = time.monotonic() + READ_BUDGET_SECONDS
    own = _signed_in_feed(page, step)["slug"]
    _goto(page, ORIGIN + "/messaging/")
    _settle(page, None, 10_000)
    _usable(page, step)
    threads = []
    for item in _run(page, THREADS_SCRIPT, []):
        thread = _thread_id(item.get("href") or "")
        if thread and thread not in threads:
            threads.append(thread)
    messages = []
    for thread in threads[:INBOX_THREADS]:
        # The conversations not reached in time are read on the next pass.
        if time.monotonic() >= deadline:
            break
        try:
            _goto(page, "%s/messaging/thread/%s/" % (ORIGIN, thread))
            page.wait_for_timeout(random.randint(1500, 3000))
        except Exception as error:  # noqa: BLE001 - the next conversation is read
            print("linkedin inbox: a conversation would not open: %s" % _short(error), flush=True)
            continue
        now, offset = _page_clock(page)
        messages.extend(_messages_from(_run(page, MESSAGES_SCRIPT, {}), own, thread, now, offset))
        if len(messages) >= INBOX_LIMIT:
            break
    return {"messages": messages[:INBOX_LIMIT]}


def linkedin_message(page, args):
    """One answer in the conversation `conversationId`, with `slug` as the other person.

    The conversation's header must name that person, or nothing is typed.
    When our message with these words went out in the last hour, nothing is
    typed. Otherwise the words typed, read back, and Send pressed once.
    """
    step = "message"
    conversation = _conversation_id(args.get("conversationId"), step)
    slug = _slug_arg(args.get("slug"), step)
    text = _text_arg(args, "text", step, 8_000)
    _begin_write("message", step)
    own = _signed_in_feed(page, step)["slug"]
    _goto(page, "%s/messaging/thread/%s/" % (ORIGIN, conversation))
    page.wait_for_timeout(random.randint(2000, 3500))
    _usable(page, step)
    raw = _run(page, MESSAGES_SCRIPT, {})
    _kind, other = _slug_from_href(raw.get("header") or "")
    if other.lower() != slug.lower():
        raise CommandError("%s: that conversation is not with %s, so nothing was typed" % (step, slug))
    now, offset = _page_clock(page)
    since = now - LOOK_BACK_SECONDS

    def ours(items):
        return [item for item in items if _slug_from_href(item.get("href") or "")[1].lower() == own.lower() and _same_words(text, item.get("text") or "")]

    # The same words sent on an older day stay on the page; only one more after Send is this one.
    sent_before = len(ours(raw.get("messages") or []))
    for item in raw.get("messages") or []:
        _kind, writer = _slug_from_href(item.get("href") or "")
        seconds = _message_seconds(item.get("time") or "", now, offset)
        # A time LinkedIn wrote in a way Promo cannot read is never "within the hour".
        if writer.lower() == own.lower() and seconds is not None and seconds >= since and _same_words(text, item.get("text") or ""):
            return {"done": True}
    box = _first_visible(page, [SELECTORS["thread_box"]], 8_000)
    if box is None:
        raise CommandError("%s: the conversation has no message box. Nothing was typed." % step)
    _type_into(page, box, text, step)
    _check_box(box, text, step, "Nothing was sent.")
    _press(page, [SELECTORS["thread_send"]], step, "Send")

    def shown():
        page.wait_for_timeout(2_500)
        return len(ours(_run(page, MESSAGES_SCRIPT, {}).get("messages") or [])) > sent_before

    _after_press(step, _must(shown, step, "Send was pressed but the message does not show in the conversation"))
    return {"done": True}


# What this network can be asked to do. The package's __init__ prefixes each
# name with "linkedin.", and a name nobody registered is refused.
ROUTINES = {
    "state": linkedin_state,
    "quick_state": linkedin_state_quick,
    "enter_code": linkedin_enter_code,
    "search": linkedin_search,
    "post": linkedin_post,
    "check": linkedin_check,
    "lookup": linkedin_lookup,
    "group": linkedin_group,
    "seen": linkedin_seen,
    "find_own": linkedin_find_own,
    "comment": linkedin_comment,
    "publish": linkedin_publish,
    "newsletter": linkedin_newsletter,
    "edit": linkedin_edit,
    "delete": linkedin_delete,
    "connect": linkedin_connect,
    "invites": linkedin_invites,
    "accept": linkedin_accept,
    "viewers": linkedin_viewers,
    "numbers": linkedin_numbers,
    "feed": linkedin_feed,
    "warm_up": linkedin_warm_up,
    "inbox": linkedin_inbox,
    "message": linkedin_message,
}
