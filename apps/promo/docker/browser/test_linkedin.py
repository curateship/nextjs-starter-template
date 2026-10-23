"""Tests for LinkedIn's routines in routines/linkedin.py. Run from apps/promo:

    python3 -m unittest discover -s docker/browser -p "test_*.py"

No browser is needed. The drawn posts, comments and pages below have the
shapes the page-reading scripts return, written from how LinkedIn puts its
pages together. None of them was measured on the live site yet: a real
search account and a real commenting account on the real site are the only
proof a routine works; these prove the parsing, the answer shapes and the
rules around every press.
"""

import ast
import os
import re
import sys
import time
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The person-pace helpers are replaced below, so nothing waits.
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import linkedin as li  # noqa: E402

POST = "7250000000000000001"
OTHER = "7250000000000000002"
ME = "sam-kim"


def card(post_id, name="Jane Doe", slug="jane-doe", kind="in", headline="Founder at Acme", text="Hiring your first engineer is hard",
         age="3h • ", reactions="12", comments="4 comments", reposts="1 repost", header="", comments_off=False, poll=None, link=""):
    return {
        "urn": "urn:li:activity:%s" % post_id,
        "name": name,
        "headline": headline,
        "href": "https://www.linkedin.com/%s/%s/" % (kind, slug),
        "age": age,
        "text": text,
        "ownWords": bool(text),
        "header": header,
        "reactions": reactions,
        "comments": comments,
        "reposts": reposts,
        "commentsOff": comments_off,
        "link": link,
        "poll": poll or [],
    }


def comment(post_id, comment_id, slug="lee-park", name="Lee Park", text="Same here", parent=None, reactions="2", replies="", age="1h", kind="in"):
    return {
        "urn": "urn:li:comment:(activity:%s,%s)" % (post_id, comment_id),
        "parentUrn": "urn:li:comment:(activity:%s,%s)" % (post_id, parent) if parent else "",
        "name": name,
        "headline": "Engineer",
        "href": "/%s/%s/" % (kind, slug),
        "text": text,
        "reactions": reactions,
        "replies": replies,
        "age": age,
    }


class FakeResponse(object):
    def __init__(self, url, status=200, method="GET", body=""):
        self.url = url
        self.status = status
        self.request = types.SimpleNamespace(method=method)
        self._body = body

    def text(self):
        return self._body


class FakeLocator(object):
    def __init__(self, items=None):
        self.items = items or []

    def count(self):
        return len(self.items)

    def nth(self, index):
        return self.items[index]

    @property
    def first(self):
        return self.items[0] if self.items else self


class FakeKeyboard(object):
    def __init__(self, record):
        self.record = record

    def press(self, key):
        self.record.append(("key", key))

    def insert_text(self, text):
        self.record.append(("inserted", text))


class FakePage(object):
    """The parts of Playwright's page the routines use. A visit to an address plays what that page draws."""

    def __init__(self, plays=None, slug=ME, url="https://www.linkedin.com/feed/", text="", code=False, record=None):
        self.plays = plays or {}
        self.slug = slug
        self.url = url
        self.text = text
        self.code = code
        self.went = []
        self.listeners = []
        self.record = record if record is not None else []
        self.keyboard = FakeKeyboard(self.record)
        self.after_press = None

    def on(self, event, handler):
        self.listeners.append(handler)

    def remove_listener(self, event, handler):
        self.listeners.remove(handler)

    def play(self):
        return self.plays.get(self.url, {})

    def goto(self, url, wait_until=None, timeout=None):
        self.went.append(url)
        self.url = url
        play = self.play()
        if isinstance(play, Exception):
            raise play
        for status in play.get("statuses", []):
            for handler in list(self.listeners):
                handler(FakeResponse(url, status))

    def wait_for_timeout(self, ms):
        pass

    def locator(self, selector):
        # A post's or a comment's own card is there when the page draws it.
        play = self.play() if not isinstance(self.play(), Exception) else {}
        post = re.search(r"data-urn='urn:li:activity:(\d+)'", selector)
        if post and any(item["urn"].endswith(post.group(1)) for item in play.get("cards", [])):
            return FakeScope(self, "post %s" % post.group(1))
        under = re.search(r"article\[data-id\*=',(\d+)\)'\]", selector)
        if under and any(item["urn"].endswith(",%s)" % under.group(1)) for item in play.get("comments", [])):
            return FakeScope(self, "comment %s" % under.group(1))
        return FakeLocator()

    def evaluate(self, script, arg=None):
        play = self.play() if not isinstance(self.play(), Exception) else {}
        parsed = li.urllib.parse.urlparse(self.url)
        if "linkedin:signs" in script:
            return {"url": self.url, "host": parsed.hostname, "path": parsed.path, "text": play.get("signsText", self.text),
                    "meHref": "/in/%s/" % self.slug if self.slug else "", "meName": "Sam Kim", "login": not self.slug,
                    "codeField": self.code, "premium": False}
        if "linkedin:ready" in script:
            return {"posts": len(play.get("cards", [])), "comments": len(play.get("comments", [])), "empty": not play.get("cards"), "error": False, "login": False}
        if "linkedin:cards" in script:
            return play.get("cards", [])
        if "linkedin:comments" in script:
            return play.get("comments", [])
        if "linkedin:text" in script:
            return play.get("page", {"name": "", "headline": "", "text": ""})
        if "linkedin:people" in script:
            return play.get("people", [])
        if "linkedin:threads" in script:
            return play.get("threads", [])
        if "linkedin:messages" in script:
            return play.get("messages", {"header": "", "messages": []})
        if "linkedin:pages" in script:
            return play.get("pages", [])
        if "linkedin:actions" in script:
            return play.get("actions", {"found": False, "name": "", "labels": [], "degree": ""})
        if "linkedin:actor" in script:
            return play.get("actor")
        if "linkedin:clock" in script:
            return play.get("clock", {"now": time.time(), "offset": 0})
        if "linkedin:poll" in script:
            return play.get("poll")
        raise AssertionError("unexpected script: %s" % script[:80])


class FakeScope(object):
    """A drawn card to look inside: it asks its page, and says which card it is."""

    def __init__(self, page, name):
        self.page = page
        self.name = name

    def count(self):
        return 1

    @property
    def first(self):
        return self

    def locator(self, selector):
        return FakeLocator()

    def evaluate(self, script, arg=None):
        return self.page.evaluate(script, arg)

    def wait_for_timeout(self, ms):
        pass


class FakeHuman(object):
    """Scrolls that move and clicks that are written down, so the rules around them can be watched."""

    def __init__(self, record):
        self.record = record

    def scroll_once(self, page, direction=1, limit=None):
        self.record.append(("scrolled",))
        return 300

    def click(self, locator, timeout=None):
        self.record.append(("pressed", getattr(locator, "name", "something")))
        if isinstance(locator, FakeButton) and locator.on_press:
            locator.on_press()

    def type_text(self, field, text):
        self.record.append(("typed", text))
        return [0.1] * max(len(text) - 1, 0)

    def pause_before_submit(self, page):
        pass

    def read_page(self, page, length, sizes=None):
        pass

    def browse(self, page, seconds, deadline=None):
        return [300]

    def describe_scrolls(self, sizes):
        return "%d scrolls" % len(sizes)

    def describe_gaps(self, gaps):
        return "%d gaps" % len(gaps)

    def wait_for_address(self, page, matches, timeout_ms=None):
        pass


class FakeBox(object):
    """An editor that keeps what was typed, and reads back `shown` when set (a tag or a picker having changed a word)."""

    name = "box"

    def __init__(self, record, shown=None):
        self.record = record
        self.shown = shown

    def input_value(self, timeout=None):
        raise RuntimeError("Not an input element")

    def inner_text(self, timeout=None):
        if self.shown is not None:
            return self.shown
        # A Shift+Enter is a line break in the box; nothing else pressed is a character.
        return "".join(item[1] if item[0] == "typed" else "\n" for item in self.record if item[0] == "typed" or item == ("key", "Shift+Enter"))

    def get_attribute(self, name):
        return None


class FakeButton(object):
    def __init__(self, name, pressed=None, on_press=None, label=None):
        self.name = name
        self.pressed = pressed
        self.on_press = on_press
        self.label = label

    def get_attribute(self, name):
        if name == "aria-pressed":
            return self.pressed
        if name == "aria-label":
            return self.label
        return None


class PatchedTest(unittest.TestCase):
    """Fake hands, and `_first_visible` answering from `self.visible`: a word in the selector to what is on screen."""

    def setUp(self):
        self.saved = (li.human, li._first_visible)
        self.record = []
        li.human = FakeHuman(self.record)
        self.box = FakeBox(self.record)
        self.visible = {}

        def visible(scope, selectors, timeout_ms):
            joined = " ".join(selectors if isinstance(selectors, list) else [selectors])
            for word, thing in self.visible.items():
                if word in joined:
                    return thing
            return None

        li._first_visible = visible

    def tearDown(self):
        li.human, li._first_visible = self.saved


POST_KEYS = {"postId", "url", "text", "authorName", "authorHeadline", "authorSlug", "authorKind", "authorFollowers", "postedSeconds",
             "reactions", "comments", "reposts", "canComment", "isRepost", "link"}
STATE_KEYS = {"checked", "slug", "name", "blocked", "reason", "banScreen", "codeAsked", "pages", "premium", "followers"}


class ShapesMatchTheContractTest(unittest.TestCase):
    """The keys every answer carries are the keys `calls.ts` checks, read out of that file so the two never drift."""

    @classmethod
    def setUpClass(cls):
        path = os.path.join(HERE, "..", "..", "src", "server", "social", "linkedin", "calls.ts")
        with open(path, encoding="utf-8") as source:
            cls.calls = source.read()

    def keys(self, shape):
        found = re.search(r"const %s = z\.object\(\{(.*?)\n\}\)" % shape, self.calls, re.S)
        self.assertIsNotNone(found, shape)
        body = re.sub(r"/\*\*.*?\*/", "", found.group(1), flags=re.S)
        return {name for name in re.findall(r"^\s{2}(\w+):", body, re.M)}

    def test_a_post_and_the_state_carry_exactly_the_contracts_keys(self):
        self.assertEqual(self.keys("postShape"), POST_KEYS)
        self.assertEqual(self.keys("stateShape"), STATE_KEYS)
        self.assertEqual(set(li.NOT_LOOKED), STATE_KEYS)

    def test_every_routine_in_the_contract_is_registered_and_nothing_else(self):
        named = set(re.findall(r'call\(target, "linkedin/(\w+)"', self.calls))
        self.assertEqual(named, set(li.ROUTINES))


class SmallReadersTest(unittest.TestCase):
    def test_numbers_as_linkedin_writes_them(self):
        self.assertEqual(li._number("1.2K"), 1200)
        self.assertEqual(li._number("3M"), 3_000_000)
        self.assertEqual(li._number("1,234"), 1234)
        self.assertEqual(li._number("500+"), 500)
        self.assertIsNone(li._number("many"))
        self.assertEqual(li._count_in("1,204 reactions"), 1204)
        self.assertEqual(li._count_in("3 reposts • 12 comments", ("comments",)), 12)
        self.assertIsNone(li._count_in("3 reposts", ("comments",)))

    def test_ages_in_linkedins_short_words(self):
        self.assertEqual(li._age_seconds("5m • Edited"), 300)
        self.assertEqual(li._age_seconds("3h •"), 3 * 3600)
        self.assertEqual(li._age_seconds("2d"), 2 * 86400)
        self.assertEqual(li._age_seconds("1w"), 7 * 86400)
        self.assertEqual(li._age_seconds("4mo"), 120 * 86400)
        self.assertEqual(li._age_seconds("1yr"), 365 * 86400)
        self.assertEqual(li._age_seconds("Just now"), 0)
        self.assertIsNone(li._age_seconds("Promoted"))
        self.assertEqual(li._posted_seconds("1h", now=10_000), 10_000 - 3600)

    def test_ids_out_of_urns_and_addresses(self):
        self.assertEqual(li._activity_id("urn:li:activity:7250000000000000001"), POST)
        self.assertEqual(li._activity_id("https://www.linkedin.com/posts/jane_hiring-activity-7250000000000000001-AbCd"), POST)
        self.assertEqual(li._activity_id("urn%3Ali%3AugcPost%3A7250000000000000001"), POST)
        self.assertEqual(li._comment_id("urn:li:comment:(activity:7250000000000000001,7250000000000000099)"), "7250000000000000099")
        self.assertEqual(li._comment_id("urn:li:comment:(urn:li:activity:7250000000000000001,7250000000000000099)"), "7250000000000000099")
        self.assertEqual(li._comment_id("urn:li:activity:7250000000000000001"), "")

    def test_slugs_out_of_addresses(self):
        self.assertEqual(li._slug_from_href("https://www.linkedin.com/in/jane-doe/"), ("person", "jane-doe"))
        self.assertEqual(li._slug_from_href("/company/acme/posts/"), ("company", "acme"))
        self.assertEqual(li._slug_from_href("/in/j%C3%B6rg-m/"), ("person", "jörg-m"))
        self.assertEqual(li._slug_from_href("/feed/"), ("", ""))
        self.assertEqual(li._slug_from_href("/in/../etc/"), ("", ""))

    def test_arguments_are_checked_so_they_can_only_be_what_they_say(self):
        for bad in ["", "abc", "123", "7250/../1", None]:
            with self.assertRaises(li.CommandError, msg=bad):
                li._post_id(bad, "post")
        for bad in ["", "a b", "../x", None]:
            with self.assertRaises(li.CommandError, msg=bad):
                li._slug_arg(bad, "connect")
        with self.assertRaises(li.CommandError):
            li._group_id("12/../3", "group")
        with self.assertRaises(li.CommandError):
            li._page_id("acme", "comment")
        self.assertEqual(li._page_id("", "comment"), "")

    def test_a_poll_against_linkedins_limits(self):
        self.assertEqual(li._poll_arg({"question": "Which?", "choices": ["A", "B"], "days": 7}, "publish"), ("Which?", ["A", "B"], 7))
        for poll in [{"question": "", "choices": ["A", "B"], "days": 7}, {"question": "Q", "choices": ["A"], "days": 7},
                     {"question": "Q", "choices": ["a", "b", "c", "d", "e"], "days": 7}, {"question": "Q", "choices": ["a" * 31, "b"], "days": 7},
                     {"question": "Q", "choices": ["A", "B"], "days": 5}, {"question": "Q" * 141, "choices": ["A", "B"], "days": 1}]:
            with self.assertRaises(li.CommandError, msg=str(poll)):
                li._poll_arg(poll, "publish")

    def test_tags_must_be_in_the_words_and_read_back_as_names(self):
        tags = li._tags_arg([{"name": "Jane Doe", "slug": "jane-doe", "kind": "person"}], "Thanks @Jane Doe for this", "publish")
        self.assertEqual(li._shown_words("Thanks @Jane Doe for this", tags), "Thanks Jane Doe for this")
        with self.assertRaises(li.CommandError):
            li._tags_arg([{"name": "Lee", "slug": "lee-park", "kind": "person"}], "No tag here", "publish")

    def test_what_linkedin_answers_to_a_write(self):
        bodies = ['{"urn":"urn:li:comment:(activity:7250000000000000001,7250000000000000099)"}', {"entityUrn": "urn:li:share:7250000000000000005"}]
        # A share or ugcPost number is not a post's activity id, so it never stands in for one.
        self.assertEqual(li._created_ids(bodies), (["7250000000000000099"], []))
        self.assertEqual(li._created_ids(['{"urn":"urn:li:activity:7250000000000000005"}']), ([], ["7250000000000000005"]))
        self.assertEqual(li._created_ids([]), ([], []))

    def test_words_compare_and_a_folded_post_counts_only_when_long(self):
        long = "We rewrote onboarding around one question and signups doubled in a month."
        self.assertTrue(li._same_words(long, long.replace("'", "’")))
        self.assertTrue(li._same_words(long, long[:50] + "…see more"))
        self.assertFalse(li._same_words("Yes, agreed", "Yes…see more"))
        self.assertFalse(li._same_words("Something else", long))

    def test_linkedins_limit_statuses(self):
        self.assertTrue(li._limited(429))
        self.assertTrue(li._limited(999))
        self.assertFalse(li._limited(200))

    def test_a_drawn_post_in_the_apps_shape(self):
        post = li._post_from_card(card(POST, poll=["12 votes", "3 votes"]), now=100_000)
        self.assertEqual(set(post), POST_KEYS)
        self.assertEqual((post["postId"], post["authorSlug"], post["authorKind"], post["reactions"], post["comments"], post["reposts"]), (POST, "jane-doe", "person", 12, 4, 1))
        self.assertEqual(post["postedSeconds"], 100_000 - 3 * 3600)
        self.assertTrue(post["canComment"])
        self.assertFalse(li._post_from_card(card(POST, comments_off=True))["canComment"])
        self.assertTrue(li._post_from_card(card(POST, header="Jane Doe reposted this", text=""))["isRepost"])
        self.assertIsNone(li._post_from_card({"urn": ""}))
        self.assertEqual(li._poll_votes(["12 votes", "3 votes"]), [12, 3])
        self.assertIsNone(li._poll_votes(["45%", "55%"]))


class SignsTest(unittest.TestCase):
    def raw(self, path="/feed/", text="", me="/in/sam-kim/", **extra):
        out = {"host": "www.linkedin.com", "path": path, "text": text, "meHref": me, "meName": "Sam Kim", "login": False, "codeField": False, "premium": True}
        out.update(extra)
        return out

    def test_signed_in_and_signed_out(self):
        signs = li._judge(self.raw())
        self.assertEqual((signs["checked"], signs["slug"], signs["blocked"], signs["premium"]), (True, "sam-kim", False, True))
        out = li._judge(self.raw(path="/login", me="", login=True))
        self.assertEqual((out["checked"], out["slug"], out["signedOut"]), (True, None, True))

    def test_every_restriction_and_check_page_stops_the_account(self):
        for words in ["Your account has been restricted", "Your account is temporarily restricted.", "Let’s do a quick security check",
                      "Help us verify your identity", "We've restricted your account"]:
            signs = li._judge(self.raw(text="LinkedIn\n%s\nThis is to protect our members." % words, me=""))
            self.assertTrue(signs["banScreen"], words)
            self.assertTrue(signs["blocked"], words)
            self.assertFalse(signs["codeAsked"], words)
        self.assertTrue(li._judge(self.raw(path="/checkpoint/challenge/abc", text="Something about your account", me=""))["banScreen"])

    def test_the_emailed_code_is_in_the_way_but_is_not_a_ban(self):
        signs = li._judge(self.raw(path="/checkpoint/challenge/x", text="Enter the code we sent to s***@gmail.com", me="", codeField=True))
        self.assertEqual((signs["codeAsked"], signs["blocked"], signs["banScreen"], signs["reason"]), (True, True, None, li.CODE_REASON))

    def test_somebody_talking_about_a_restriction_is_not_one(self):
        long = "Your account has been restricted is what my friend saw after posting forty times a day for a week straight, so slow down"
        self.assertIsNone(li._judge(self.raw(text=long))["banScreen"])

    def test_a_limit_page_limits_without_being_a_ban(self):
        signs = li._judge(self.raw(text="You've reached the commercial use limit"))
        self.assertEqual((signs["limited"], signs["blocked"], signs["banScreen"]), (True, True, None))

    def test_the_quick_look_never_moves_the_page_or_reads_another_site(self):
        page = FakePage(url="https://example.com/")
        self.assertEqual(li.linkedin_state_quick(page), li.NOT_LOOKED)
        page = FakePage()
        state = li.linkedin_state_quick(page)
        self.assertEqual(set(state), STATE_KEYS)
        self.assertEqual((state["checked"], state["slug"]), (True, ME))
        self.assertEqual(page.went, [])
        coded = li.linkedin_state_quick(FakePage(slug="", code=True, url="https://www.linkedin.com/checkpoint/challenge/1", text="Enter the code we sent"))
        self.assertEqual((coded["codeAsked"], coded["banScreen"]), (True, None))


SEARCH_URL = li._search_url("search", "hiring engineers")


class SearchTest(PatchedTest):
    def test_a_search_keeps_page_order_stops_at_max_and_counts_what_it_saw(self):
        cards = [card("72500000000000000%02d" % index) for index in range(1, 9)]
        page = FakePage({SEARCH_URL: {"cards": cards}})
        found = li.linkedin_search(page, {"kind": "search", "value": "hiring engineers", "max": 5})
        self.assertEqual([post["position"] for post in found["posts"]], [0, 1, 2, 3, 4])
        self.assertEqual(set(found["posts"][0]), POST_KEYS | {"position"})
        self.assertEqual((found["viewed"], found["limited"]), (8, False))
        self.assertIn("sortBy=%22date_posted%22", page.went[0])

    def test_linkedins_limit_status_stops_the_read_and_says_so(self):
        page = FakePage({SEARCH_URL: {"cards": [card(POST)], "statuses": [999]}})
        found = li.linkedin_search(page, {"kind": "search", "value": "hiring engineers", "max": 20})
        self.assertTrue(found["limited"])

    def test_a_watched_person_and_page_open_their_own_activity(self):
        person = li._search_url("person", "jane-doe")
        company = li._search_url("company", "acme")
        self.assertEqual(person, "https://www.linkedin.com/in/jane-doe/recent-activity/all/")
        self.assertIn("/company/acme/posts/", company)
        page = FakePage({person: {"cards": [card(POST)]}})
        self.assertEqual(len(li.linkedin_search(page, {"kind": "person", "value": "jane-doe", "max": 5})["posts"]), 1)
        with self.assertRaises(li.CommandError):
            li.linkedin_search(page, {"kind": "group", "value": "x", "max": 5})
        with self.assertRaises(li.CommandError):
            li.linkedin_search(page, {"kind": "person", "value": "../etc", "max": 5})

    def test_a_signed_out_or_restricted_search_account_is_refused(self):
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_search(FakePage({SEARCH_URL: {"cards": []}}, slug=""), {"kind": "search", "value": "hiring engineers"})
        self.assertIn("not signed in", str(caught.exception))
        banned = FakePage({SEARCH_URL: {"signsText": "Your account has been restricted"}})
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_search(banned, {"kind": "search", "value": "hiring engineers"})
        self.assertIn("restricted", str(caught.exception))


POST_URL = li._post_url(POST)


class ReadsTest(PatchedTest):
    def test_a_post_with_its_top_comments_most_reacted_first_and_the_writers_own_left_out(self):
        comments = [
            comment(POST, "7250000000000000101", reactions="2"),
            comment(POST, "7250000000000000102", slug="ana-ruiz", reactions="9"),
            comment(POST, "7250000000000000103", slug="jane-doe", reactions="50"),
            comment(POST, "7250000000000000104", slug="kim-lee", parent="7250000000000000102", reactions="80"),
        ]
        read = li.linkedin_post(FakePage({POST_URL: {"cards": [card(POST)], "comments": comments}}), {"postId": POST})
        self.assertEqual([item["id"] for item in read["comments"]], ["7250000000000000102", "7250000000000000101"])
        self.assertEqual(set(read["comments"][0]), {"id", "name", "headline", "slug", "text", "reactions"})
        self.assertEqual((read["missing"], read["viewed"], read["limited"]), (False, 1, False))

    def test_a_gone_post_is_missing_and_one_that_did_not_draw_is_never_called_gone(self):
        gone = FakePage({POST_URL: {"signsText": "This post cannot be displayed"}})
        self.assertEqual(li.linkedin_post(gone, {"postId": POST})["missing"], True)
        with self.assertRaises(li.CommandError):
            li.linkedin_post(FakePage({POST_URL: {}}), {"postId": POST})
        with self.assertRaises(li.CommandError):
            li.linkedin_check(FakePage({POST_URL: {}}), {"postId": POST, "commentId": "", "slug": ME})

    def test_a_check_on_our_comment_reads_its_reactions_and_the_replies_to_us(self):
        comments = [comment(POST, "7250000000000000201", slug=ME, text="Ours", reactions="7", replies="2 replies"),
                    comment(POST, "7250000000000000202", slug="lee-park", text="Thanks!", parent="7250000000000000201"),
                    comment(POST, "7250000000000000203", slug=ME, text="You're welcome", parent="7250000000000000201")]
        check = li.linkedin_check(FakePage({POST_URL: {"cards": [card(POST)], "comments": comments}}), {"postId": POST, "commentId": "7250000000000000201", "slug": ME})
        self.assertEqual((check["found"], check["visible"], check["reactions"], check["comments"]), (True, True, 7, 2))
        self.assertEqual([item["id"] for item in check["incoming"]], ["7250000000000000202"])
        self.assertEqual(set(check["incoming"][0]), {"id", "name", "headline", "slug", "text", "reactions", "postedSeconds"})
        missing = li.linkedin_check(FakePage({POST_URL: {"cards": [card(POST, comments="")], "comments": []}}), {"postId": POST, "commentId": "7250000000000000299", "slug": ME})
        self.assertEqual((missing["found"], missing["visible"]), (True, False))

    def test_a_comment_not_reached_before_the_presses_ran_out_is_unknown_not_gone(self):
        self.visible["load-more"] = FakeButton("more")
        check = li.linkedin_check(FakePage({POST_URL: {"cards": [card(POST)], "comments": []}}), {"postId": POST, "commentId": "7250000000000000299", "slug": ME})
        self.assertIsNone(check["visible"])

    def test_a_check_on_our_post_reads_its_numbers_poll_and_comments(self):
        page = FakePage({POST_URL: {"cards": [card(POST, slug=ME, poll=["12 votes", "4 votes"])], "comments": [comment(POST, "7250000000000000301")]}})
        check = li.linkedin_check(page, {"postId": POST, "commentId": "", "slug": ME})
        self.assertEqual((check["reactions"], check["comments"], check["reposts"], check["pollVotes"]), (12, 4, 1, [12, 4]))
        self.assertEqual(len(check["incoming"]), 1)
        self.assertEqual(set(check), {"found", "visible", "reactions", "comments", "reposts", "pollVotes", "incoming", "viewed", "limited"})

    def test_a_lookup_says_who_exists_and_leaves_out_what_it_could_not_read(self):
        plays = {
            "https://www.linkedin.com/in/jane-doe/": {"page": {"name": "Jane Doe", "headline": "Founder at Acme", "text": "Jane Doe\n2,300 followers"}},
            "https://www.linkedin.com/company/gone-co/": {"page": {"name": "", "headline": "", "text": "This page doesn't exist"}},
            "https://www.linkedin.com/in/slow-one/": RuntimeError("Timeout 45000ms exceeded"),
        }
        found = li.linkedin_lookup(FakePage(plays), {"people": ["jane-doe", "slow-one"], "companies": ["gone-co"]})
        self.assertEqual([(item["slug"], item["exists"], item["followers"]) for item in found["found"]], [("jane-doe", True, 2300), ("gone-co", False, None)])
        self.assertEqual(set(found["found"][0]), {"kind", "slug", "exists", "name", "headline", "followers"})

    def test_a_groups_rules_and_members(self):
        text = "Product Builders\n12,481 members\nAbout this group\nA place for builders.\nGroup rules\nNo selling.\nBe kind.\nAdmins\nJane"
        url = "https://www.linkedin.com/groups/1234567/about/"
        read = li.linkedin_group(FakePage({url: {"cards": [card(POST)], "page": {"name": "Product Builders", "headline": "", "text": text}}}), {"groupId": "1234567"})
        self.assertEqual((read["name"], read["members"], read["description"], read["rules"]), ("Product Builders", 12481, "A place for builders.", "No selling.\nBe kind."))

    def test_the_weekly_seen_look_says_shown_hidden_or_unknown(self):
        plays = {POST_URL: {"cards": [card(POST)], "comments": [comment(POST, "7250000000000000401", slug=ME)]}, li._post_url(OTHER): {"cards": [card(OTHER, comments="")], "comments": []}}
        read = li.linkedin_seen(FakePage(plays), {"slug": ME, "comments": [{"postId": POST, "commentId": "7250000000000000401", "text": "a"}, {"postId": OTHER, "commentId": "7250000000000000402", "text": "b"}]})
        self.assertEqual(read["results"], [{"commentId": "7250000000000000401", "shown": True}, {"commentId": "7250000000000000402", "shown": False}])

    def test_finding_where_a_phones_comment_and_post_landed(self):
        plays = {
            POST_URL: {"cards": [card(POST)], "comments": [comment(POST, "7250000000000000501", slug=ME, text="Great point, we saw the same")]},
            "https://www.linkedin.com/in/sam-kim/recent-activity/all/": {"cards": [card(OTHER, slug=ME, text="Shipping night mode today")]},
        }
        self.assertEqual(li.linkedin_find_own(FakePage(plays), {"slug": ME, "postId": POST, "text": "Great point, we saw the same"})["found"], "7250000000000000501")
        self.assertEqual(li.linkedin_find_own(FakePage(plays), {"slug": ME, "postId": "", "text": "Shipping night mode today"})["found"], OTHER)
        self.assertIsNone(li.linkedin_find_own(FakePage(plays), {"slug": ME, "postId": "", "text": "Something else"})["found"])


class WritingBase(PatchedTest):
    """A signed-in browser whose editors and buttons are fakes that write down every key and press."""

    def setUp(self):
        PatchedTest.setUp(self)
        self.visible.update({
            "ql-editor": self.box,
            "submit-button": FakeButton("post"),
            "share-actions__primary-action": FakeButton("post"),
            "react-button": FakeButton("like", pressed="false"),
            "custom-message": self.box,
            "Add a note": FakeButton("add note"),
            "Send invitation": FakeButton("send"),
            "msg-form__contenteditable": self.box,
            "msg-form__send-button": FakeButton("send"),
            "Start a post": FakeButton("start"),
        })

    def page(self, comments=None, **more):
        # A post with no comments yet, unless some are given: nothing to look under is then a real "none".
        plays = {POST_URL: {"cards": [card(POST, comments="%d comments" % len(comments or []))], "comments": comments or []}, li.FEED: {"cards": [card(OTHER)]}}
        plays.update(more)
        return FakePage(plays, record=self.record)


class CommentTest(WritingBase):
    def test_an_old_comment_of_ours_under_the_post_is_an_earlier_try_and_nothing_is_typed_or_liked(self):
        page = self.page([comment(POST, "7250000000000000601", slug=ME, text="We hit this too, a checklist fixed it.", age="3mo")])
        visit = li._new_visit()
        found = li._write_comment(page, ME, POST, "", "We hit this too, a checklist fixed it.", "", True, visit)
        self.assertEqual(found, "7250000000000000601")
        self.assertTrue(visit["alreadyThere"])
        self.assertEqual([item for item in self.record if item[0] in ("typed", "pressed")], [])

    def test_the_box_must_hold_the_words_written_before_the_press(self):
        self.box.shown = "We hit this too"
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(self.page(), ME, POST, "", "We hit this too, a checklist fixed it.", "", False)
        self.assertEqual(str(caught.exception), "comment: the words in the box did not match what was written. Nothing was posted.")
        self.assertNotIn(("pressed", "post"), self.record)

    def test_a_like_goes_first_once_and_never_on_a_post_already_liked(self):
        page = self.page()
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000602"):
            li._write_comment(page, ME, POST, "", "Nice one.", "", True, li._new_visit())
        presses = [item[1] for item in self.record if item[0] == "pressed"]
        self.assertEqual(presses.count("like"), 1)
        self.assertLess(presses.index("like"), presses.index("post"))
        del self.record[:]
        self.visible["react-button"] = FakeButton("like", pressed="true")
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000603"):
            li._write_comment(page, ME, POST, "", "Nice one again.", "", True, li._new_visit())
        self.assertNotIn(("pressed", "like"), self.record)

    def test_a_post_with_comments_turned_off_is_never_typed_into(self):
        page = FakePage({POST_URL: {"cards": [card(POST, comments_off=True, comments="")]}}, record=self.record)
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Hello", "", False)
        self.assertIn("turned comments off", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_comments_that_did_not_draw_mean_no_look_so_nothing_is_typed(self):
        page = FakePage({POST_URL: {"cards": [card(POST, comments="9 comments")], "comments": []}}, record=self.record)
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Hello", "", False)
        self.assertIn(li.NO_EARLIER_LOOK, str(caught.exception))

    def test_a_failure_after_the_press_says_it_may_already_be_on_linkedin(self):
        with mock.patch.object(li, "_comment_landed", side_effect=RuntimeError("Timeout 45000ms exceeded")), self.assertRaises(li.CommandError) as caught:
            li._write_comment(self.page(), ME, POST, "", "Nice one.", "", False)
        self.assertIn(("pressed", "post"), self.record)
        self.assertEqual(str(caught.exception), "comment: Timeout 45000ms exceeded. It may already be on LinkedIn; look before sending again.")
        del self.record[:]
        with mock.patch.object(li, "_comment_landed", return_value=None), self.assertRaises(li.CommandError) as caught:
            li._write_comment(self.page(), ME, POST, "", "Nice two.", "", False)
        self.assertIn("may already be on LinkedIn", str(caught.exception))

    def test_a_company_page_not_in_the_list_is_refused_before_typing(self):
        self.visible["Comment as"] = FakeButton("comment as")
        page = self.page()
        page.plays[POST_URL]["pages"] = [{"text": "Acme", "urn": "urn:li:fsd_company:111", "href": "/company/acme/"}]
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Nice one.", "999", False)
        self.assertIn("not in LinkedIn's list", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])


class PublishTest(WritingBase):
    ACTIVITY = "https://www.linkedin.com/in/sam-kim/recent-activity/all/"

    def test_a_post_of_ours_from_since_on_is_an_earlier_try(self):
        old = card(OTHER, slug=ME, text="Night mode is out.", age="2d")
        page = self.page(**{self.ACTIVITY: {"cards": [old]}})
        found = li.linkedin_publish(page, {"text": "Night mode is out.", "since": time.time() - 3 * 86400})
        self.assertEqual(found, {"postId": OTHER, "url": li._post_url(OTHER)})
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_publish(page, {"text": "Night mode is out.", "since": "yesterday"})
        self.assertIn("since must be seconds", str(caught.exception))

    def test_an_activity_page_that_never_drew_means_no_look_so_nothing_is_typed(self):
        page = self.page()
        page.plays[self.ACTIVITY] = {"cards": []}
        with mock.patch.object(li, "_run", side_effect=lambda p, script, fallback: {"posts": 0, "empty": False} if "linkedin:ready" in script else FakePage.evaluate(p, script)):
            with self.assertRaises(li.CommandError) as caught:
                li.linkedin_publish(page, {"text": "Night mode is out."})
        self.assertIn(li.NO_EARLIER_LOOK_OWN, str(caught.exception))

    def test_tags_are_picked_and_the_box_is_read_back_as_linkedin_draws_them(self):
        page = self.page(**{self.ACTIVITY: {"cards": []}})
        tags = [{"name": "Jane Doe", "slug": "jane-doe", "kind": "person"}]
        picked = []
        with mock.patch.object(li, "_pick_tag", side_effect=lambda p, tag, step: picked.append(tag["slug"])), \
                mock.patch.object(li, "_post_landed", return_value=OTHER):
            self.box.shown = "Thanks Jane Doe for the idea"
            found = li.linkedin_publish(page, {"text": "Thanks @Jane Doe for the idea", "tags": tags})
        self.assertEqual(picked, ["jane-doe"])
        self.assertEqual(found["postId"], OTHER)
        # A picker that swapped the name for somebody else's is refused before Post.
        del self.record[:]
        self.box.shown = "Thanks Jane Doerr for the idea"
        with mock.patch.object(li, "_pick_tag"), self.assertRaises(li.CommandError):
            li.linkedin_publish(page, {"text": "Thanks @Jane Doe for the idea", "tags": tags})
        self.assertNotIn(("pressed", "post"), self.record)

    def test_a_post_carries_one_extra_at_most(self):
        with self.assertRaises(li.CommandError):
            li.linkedin_publish(self.page(), {"text": "Hi", "pictureUrl": "https://cdn.test/a.png", "poll": {"question": "Q", "choices": ["a", "b"], "days": 1}})

    def test_a_failure_after_post_says_it_may_already_be_on_linkedin(self):
        page = self.page(**{self.ACTIVITY: {"cards": []}})
        with mock.patch.object(li, "_post_landed", side_effect=RuntimeError("socket hang up")), self.assertRaises(li.CommandError) as caught:
            li.linkedin_publish(page, {"text": "Night mode is out."})
        self.assertIn(("pressed", "post"), self.record)
        self.assertIn("may already be on LinkedIn", str(caught.exception))


class ConnectTest(WritingBase):
    PROFILE = "https://www.linkedin.com/in/jane-doe/"

    def actions(self, labels, degree="2nd"):
        return {"found": True, "name": "Jane Doe", "labels": labels, "degree": degree}

    def setUp(self):
        WritingBase.setUp(self)
        self.visible["pv-top-card"] = FakeButton("actions")

    def test_already_connected_or_asked_presses_nothing(self):
        for actions in [self.actions(["Message"], degree="1st"), self.actions(["Pending, click to withdraw invitation sent to Jane Doe"])]:
            page = self.page(**{self.PROFILE: {"actions": actions}})
            self.assertEqual(li.linkedin_connect(page, {"slug": "jane-doe", "note": ""}), {"done": False, "already": True})
        self.assertEqual([item for item in self.record if item[0] == "pressed"], [])

    def test_pending_anywhere_but_the_profiles_own_buttons_is_not_pending(self):
        page = self.page(**{self.PROFILE: {"actions": self.actions(["Invite Jane Doe to connect", "Pending, click to withdraw invitation sent to Kim Lee"]),
                                           "page": {"text": "Jane Doe\nPeople also viewed\nKim Lee Pending"}}})
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        self.visible["Send invitation"] = FakeButton("send")
        with mock.patch.object(li, "_after_press", return_value=True):
            self.assertEqual(li.linkedin_connect(page, {"slug": "jane-doe", "note": ""}), {"done": True, "already": False})
        self.assertIn(("pressed", "connect"), self.record)

    def test_a_connect_button_for_somebody_else_is_never_pressed(self):
        page = self.page(**{self.PROFILE: {"actions": self.actions(["Invite Jane Doe to connect"])}})
        self.visible["to connect"] = FakeButton("connect", label="Invite Kim Lee to connect")
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_connect(page, {"slug": "jane-doe", "note": ""})
        self.assertIn("Nothing was sent", str(caught.exception))
        self.assertNotIn(("pressed", "connect"), self.record)

    def test_buttons_that_did_not_draw_send_nothing(self):
        with self.assertRaises(li.CommandError):
            li.linkedin_connect(self.page(**{self.PROFILE: {}}), {"slug": "jane-doe", "note": ""})
        self.assertEqual([item for item in self.record if item[0] == "pressed"], [])

    def test_the_note_is_read_back_before_send(self):
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        page = self.page(**{self.PROFILE: {"actions": self.actions(["Invite Jane Doe to connect"])}})
        self.box.shown = "Loved your post on hiring!!"
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_connect(page, {"slug": "jane-doe", "note": "Loved your post on hiring"})
        self.assertIn("did not match", str(caught.exception))
        self.assertNotIn(("pressed", "send"), self.record)

    def test_send_with_no_pending_after_says_it_may_already_be_on_linkedin(self):
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        self.visible["Send invitation"] = FakeButton("send")
        page = self.page(**{self.PROFILE: {"actions": self.actions(["Invite Jane Doe to connect"])}})
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_connect(page, {"slug": "jane-doe", "note": ""})
        self.assertIn(("pressed", "send"), self.record)
        self.assertIn("may already be on LinkedIn", str(caught.exception))

    def test_the_weekly_limit_is_linkedins_refusal_and_says_nothing_was_sent(self):
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        page = self.page(**{self.PROFILE: {"actions": self.actions(["Invite Jane Doe to connect"]),
                                           "page": {"text": "You've reached the weekly invitation limit"}}})
        with self.assertRaises(li._Refused) as caught:
            li.linkedin_connect(page, {"slug": "jane-doe", "note": ""})
        self.assertNotIn("may already be on LinkedIn", str(caught.exception))


class AcceptTest(WritingBase):
    MANAGER = "https://www.linkedin.com/mynetwork/invitation-manager/received/"

    def test_accept_with_the_request_still_there_after_says_it_may_already_be_on_linkedin(self):
        card_link = FakeLocator([types.SimpleNamespace(get_attribute=lambda name: "/in/ana-ruiz/", count=lambda: 1)])
        invite = types.SimpleNamespace(locator=lambda selector: card_link)
        page = self.page(**{self.MANAGER: {"people": [{"href": "/in/ana-ruiz/", "lines": ["Ana Ruiz", "CMO"]}]}})
        page.locator = lambda selector: FakeLocator([invite]) if "invitation" in selector else FakeLocator()
        self.visible["Accept"] = FakeButton("accept")
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_accept(page, {"slug": "ana-ruiz"})
        self.assertIn(("pressed", "accept"), self.record)
        self.assertIn("may already be on LinkedIn", str(caught.exception))


class MessageTest(WritingBase):
    THREAD = "https://www.linkedin.com/messaging/thread/2-abcDEF123/"

    def test_a_conversation_with_somebody_else_is_never_typed_into(self):
        page = self.page(**{self.THREAD: {"messages": {"header": "/in/someone-else/", "messages": []}}})
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_message(page, {"conversationId": "2-abcDEF123", "slug": "jane-doe", "text": "Thanks!"})
        self.assertIn("not with jane-doe", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_our_answer_sent_in_the_last_hour_is_not_sent_again(self):
        messages = {"header": "/in/jane-doe/", "messages": [{"urn": "m1", "name": "Sam Kim", "href": "/in/sam-kim/", "time": "5m", "text": "Thanks!"}]}
        page = self.page(**{self.THREAD: {"messages": messages}})
        self.assertEqual(li.linkedin_message(page, {"conversationId": "2-abcDEF123", "slug": "jane-doe", "text": "Thanks!"}), {"done": True})
        self.assertEqual([item for item in self.record if item[0] in ("typed", "pressed")], [])

    def test_messages_from_others_only(self):
        raw = {"messages": [{"urn": "m1", "name": "Jane", "href": "/in/jane-doe/", "time": "2h", "text": "Hi Sam"},
                            {"urn": "m2", "name": "Sam", "href": "/in/sam-kim/", "time": "1h", "text": "Hi Jane"}]}
        out = li._messages_from(raw, ME, "2-abc", now=10_000)
        self.assertEqual([(item["id"], item["slug"]) for item in out], [("m1", "jane-doe")])
        self.assertEqual(set(out[0]), {"id", "conversationId", "name", "slug", "text", "sentSeconds"})


class WarmUpTest(PatchedTest):
    def test_a_warm_up_reads_and_never_likes_comments_or_posts(self):
        like = FakeButton("like", pressed="false")
        self.visible.update({"react-button": like, "submit-button": FakeButton("post"), "Start a post": FakeButton("start"), "search-global-typeahead": FakeBox(self.record)})
        page = FakePage({li.FEED: {"cards": [card(POST), card(OTHER)]}}, record=self.record)
        done = li.linkedin_warm_up(page, {"words": ["hiring"]})
        self.assertEqual(set(done), {"postsRead", "problems"})
        self.assertEqual(done["postsRead"], 2)
        pressed = [item[1] for item in self.record if item[0] == "pressed"]
        for button in ("like", "post", "start"):
            self.assertNotIn(button, pressed)


class PeopleTest(PatchedTest):
    def test_waiting_requests_and_viewers_in_the_apps_shape(self):
        people = [{"href": "/in/ana-ruiz/", "lines": ["Ana Ruiz", "Head of Marketing at Beta", "“Loved your talk on onboarding, would be great to connect”", "Ignore", "Accept"]},
                  {"href": "/in/ana-ruiz/", "lines": ["Ana Ruiz", "dup"]},
                  {"href": "/company/acme/", "lines": ["Acme"]}]
        page = FakePage({"https://www.linkedin.com/mynetwork/invitation-manager/received/": {"people": people}})
        invites = li.linkedin_invites(page, {"max": 10})["invites"]
        self.assertEqual(invites, [{"slug": "ana-ruiz", "name": "Ana Ruiz", "headline": "Head of Marketing at Beta", "note": "Loved your talk on onboarding, would be great to connect"}])
        viewers_page = FakePage({"https://www.linkedin.com/me/profile-views/": {
            "people": [{"href": "/in/lee-park/", "lines": ["Lee Park", "CTO", "Viewed 2d ago"]}],
            "page": {"name": "", "headline": "", "text": "34 profile viewers in the past 90 days\nTry Premium to see all"},
        }})
        read = li.linkedin_viewers(viewers_page, {"max": 10})
        self.assertEqual((read["total"], read["premiumNeeded"], read["viewers"][0]["slug"]), (34, True, "lee-park"))
        self.assertEqual(set(read["viewers"][0]), {"slug", "name", "headline", "viewedSeconds"})

    def test_the_accounts_own_numbers_and_none_for_what_linkedin_hid(self):
        page = FakePage({
            "https://www.linkedin.com/dashboard/": {"page": {"text": "1,204\nPost impressions\n312 followers\nProfile viewers\nUnlock with Premium"}},
            "https://www.linkedin.com/in/sam-kim/": {"page": {"text": "Sam Kim\n500+ connections"}},
        })
        self.assertEqual(li.linkedin_numbers(page), {"followers": 312, "connections": 500, "profileViews": None, "impressions": 1204})


class MediaTest(unittest.TestCase):
    def test_a_file_must_be_https(self):
        for url in ["http://cdn.test/a.png", "file:///etc/passwd", "ftp://cdn.test/a.mp4", "https:///nohost.png", ""]:
            with self.assertRaises(li.CommandError, msg=url):
                li._picture_file(url, "publish")
            with self.assertRaises(li.CommandError, msg=url):
                li._video_file(url, "publish")

    def test_an_address_inside_the_network_is_refused(self):
        with mock.patch.object(li.socket, "getaddrinfo", return_value=[(0, 0, 0, "", ("10.0.0.5", 443))]):
            with self.assertRaises(li.CommandError) as caught:
                li._picture_file("https://cdn.test/a.png", "publish")
        self.assertIn("not out on the internet", str(caught.exception))


class ClickedSelectorsTest(unittest.TestCase):
    def test_nothing_clicked_is_matched_by_its_words_on_a_wrapper(self):
        # `:has-text` matches every element holding the words, the page's outer
        # boxes included, and the first one on screen is the outermost. Only a
        # button, a link or an element with its own role may be found by its words.
        for key, value in li.SELECTORS.items():
            for part in value.split(","):
                part = part.strip()
                if ":has-text" not in part:
                    continue
                target = part.split(":has-text")[0].split(" ")[-1]
                self.assertTrue(re.match(r"^(button|a|\[role='[a-z]+'\])", target), "%s: %s" % (key, part))


class IdsAfterAPressTest(PatchedTest):
    def test_only_the_presss_own_answers_count(self):
        net = li._Net(FakePage())
        net.writes = ['{"urn":"urn:li:activity:7250000000000000077"}']
        net.begin()
        self.assertEqual(net.created(), ([], []))

    def test_ids_that_were_there_before_and_the_post_reposted_never_count(self):
        body = '{"a":"urn:li:activity:%s","b":"urn:li:activity:7250000000000000009"}' % POST
        self.assertEqual(li._created_ids([body], exclude={POST}), ([], ["7250000000000000009"]))
        self.assertIsNone(li._only(["1", "2"]))
        self.assertEqual(li._only(["1"]), "1")

    def test_a_reposts_answer_naming_only_the_original_falls_back_to_the_page(self):
        net = li._Net(FakePage())
        net.writes = ['{"urn":"urn:li:activity:%s"}' % POST]
        activity = "https://www.linkedin.com/in/sam-kim/recent-activity/all/"
        page = FakePage({activity: {"cards": [card(OTHER, slug=ME, text="My take on this")]}})
        with mock.patch.object(li, "LANDED_WAIT_SECONDS", 0):
            found = li._post_landed(page, net, ME, "", "My take on this", None, {POST}, "publish")
        self.assertEqual(found, OTHER)

    def test_a_replys_answer_naming_the_parent_comment_is_not_the_reply(self):
        parent = "7250000000000000111"
        net = li._Net(FakePage())
        net.writes = ['{"urn":"urn:li:comment:(activity:%s,%s)"}' % (POST, parent)]
        page = FakePage({POST_URL: {"cards": [card(POST)], "comments": [comment(POST, parent), comment(POST, "7250000000000000112", slug=ME, text="Agreed", parent=parent)]}})
        page.url = POST_URL
        with mock.patch.object(li, "LANDED_WAIT_SECONDS", 0):
            self.assertEqual(li._comment_landed(page, net, ME, POST, parent, "Agreed", {parent}), "7250000000000000112")


class PagePostTest(WritingBase):
    COMPANY = "https://www.linkedin.com/company/111/posts/?feedView=all&sortBy=recent"

    def test_a_post_as_a_page_looks_on_the_pages_own_posts_first(self):
        page = self.page(**{self.COMPANY: {"cards": [card(OTHER, kind="company", slug="acme", text="Night mode is out.", age="10m")]}})
        found = li.linkedin_publish(page, {"text": "Night mode is out.", "asPageId": "111"})
        self.assertEqual(found["postId"], OTHER)
        self.assertIn(self.COMPANY, page.went)
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_where_a_page_post_landed_is_looked_for_on_the_page(self):
        net = li._Net(FakePage())
        page = FakePage({self.COMPANY: {"cards": [card(OTHER, kind="company", slug="acme", text="Night mode is out.")]}})
        with mock.patch.object(li, "LANDED_WAIT_SECONDS", 0):
            self.assertEqual(li._post_landed(page, net, ME, "111", "Night mode is out.", None, set(), "publish"), OTHER)


class NewsletterLookTest(WritingBase):
    ARTICLES = "https://www.linkedin.com/in/sam-kim/recent-activity/articles/"

    def test_an_article_shared_with_no_words_is_found_by_its_title(self):
        shared = card(OTHER, slug=ME, text="", age="20m")
        shared["articleTitle"] = "Why onboarding emails fail"
        page = self.page(**{self.ARTICLES: {"cards": [shared]}})
        found = li.linkedin_newsletter(page, {"title": "Why onboarding emails fail", "body": "One.\n\nTwo."})
        self.assertEqual(found["postId"], OTHER)
        self.assertEqual([item for item in self.record if item[0] in ("typed", "inserted")], [])


class CommentListTest(WritingBase):
    def test_a_list_not_opened_to_its_end_means_no_look_so_nothing_is_typed(self):
        self.visible["load-more"] = FakeButton("more")
        page = self.page([comment(POST, "7250000000000000201")])
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Hello", "", False)
        self.assertIn(li.NO_EARLIER_LOOK, str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_a_count_linkedin_drew_but_promo_could_not_read_is_unknown_not_zero(self):
        self.assertIsNone(li._shown_count("Comments"))
        self.assertEqual(li._shown_count(""), 0)
        page = FakePage({POST_URL: {"cards": [card(POST, comments="Comments")], "comments": []}}, record=self.record)
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Hello", "", False)
        self.assertIn(li.NO_EARLIER_LOOK, str(caught.exception))


class ActorTest(WritingBase):
    def test_a_switch_that_names_somebody_else_sends_nothing(self):
        self.visible["Comment as"] = FakeButton("comment as")
        page = self.page()
        page.plays[POST_URL]["actor"] = "Comment as Kim Lee"
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Nice one.", "", False, li._new_visit(), "Sam Kim")
        self.assertIn("Nothing was sent", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_a_page_picked_but_not_shown_on_the_switch_sends_nothing(self):
        self.visible["Comment as"] = FakeButton("comment as")
        page = self.page()
        page.plays[POST_URL]["pages"] = [{"text": "Acme", "urn": "urn:li:fsd_company:111", "href": "/company/acme/"}]
        page.plays[POST_URL]["actor"] = "Comment as Sam Kim"
        drawn = page.locator
        page.locator = lambda selector: FakeLocator([FakeOption("urn:li:fsd_company:111")]) if "radio" in selector else drawn(selector)
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Nice one.", "111", True, li._new_visit())
        self.assertIn("not Acme", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] == "typed"], [])

    def test_a_comment_as_a_page_is_never_liked_and_the_like_comes_after_the_switch(self):
        self.visible["Comment as"] = FakeButton("comment as")
        page = self.page()
        page.plays[POST_URL]["pages"] = [{"text": "Acme", "urn": "urn:li:fsd_company:111", "href": "/company/acme/"}]
        page.plays[POST_URL]["actor"] = "Comment as Acme"
        drawn = page.locator
        page.locator = lambda selector: FakeLocator([FakeOption("urn:li:fsd_company:111")]) if "radio" in selector else drawn(selector)
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000301"):
            li._write_comment(page, ME, POST, "", "Nice one.", "111", True, li._new_visit())
        self.assertNotIn(("pressed", "like"), self.record)
        del self.record[:]
        page.plays[POST_URL]["actor"] = "Comment as Sam Kim"
        check = li._check_actor
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000302"), \
                mock.patch.object(li, "_check_actor", side_effect=lambda *args: (self.record.append(("actor checked",)), check(*args))):
            li._write_comment(page, ME, POST, "", "Nice two.", "", True, li._new_visit(), "Sam Kim")
        order = [item[0] if item[0] != "pressed" else item[1] for item in self.record]
        self.assertLess(order.index("actor checked"), order.index("like"))
        self.assertLess(order.index("like"), order.index("typed"))


class FakeOption(object):
    name = "option"

    def __init__(self, urn):
        self.urn = urn

    def get_attribute(self, name):
        return self.urn if name == "data-urn" else None


class LateReadBackTest(WritingBase):
    ACTIVITY = "https://www.linkedin.com/in/sam-kim/recent-activity/all/"

    def test_the_words_are_read_back_after_the_poll_is_added(self):
        page = self.page(**{self.ACTIVITY: {"cards": []}})
        poll = {"question": "Which?", "choices": ["Tabs", "Spaces"], "days": 3}

        def poll_changed_the_words(*_args):
            self.box.shown = "Which way do you"

        with mock.patch.object(li, "_attach_poll", side_effect=poll_changed_the_words), self.assertRaises(li.CommandError) as caught:
            li.linkedin_publish(page, {"text": "Which way do you indent?", "poll": poll})
        self.assertIn("did not match", str(caught.exception))
        self.assertNotIn(("pressed", "post"), self.record)

    def test_a_poll_missing_an_answer_in_the_composer_sends_nothing(self):
        page = self.page(**{self.ACTIVITY: {"cards": []}})
        page.plays[li.FEED]["poll"] = "Which?\nTabs"
        poll = {"question": "Which?", "choices": ["Tabs", "Spaces"], "days": 3}
        with mock.patch.object(li, "_attach_poll"), self.assertRaises(li.CommandError) as caught:
            li.linkedin_publish(page, {"text": "Which way do you indent?", "poll": poll})
        self.assertIn("poll in the composer did not match", str(caught.exception))
        self.assertNotIn(("pressed", "post"), self.record)


class MessageTimesTest(WritingBase):
    THREAD = "https://www.linkedin.com/messaging/thread/2-abcDEF123/"

    def test_linkedins_time_forms(self):
        # 15:00 UTC on 22 Oct 2026.
        now = 1792681200.0
        self.assertEqual(li._message_seconds("2:30 PM", now, 0), now - 30 * 60)
        self.assertEqual(li._message_seconds("4:00 PM", now, 0), now + 3600 - 86400)
        self.assertEqual(li._message_seconds("14:30", now, 0), now - 30 * 60)
        self.assertEqual(li._message_seconds("5m", now, 0), now - 300)
        for text in ["Yesterday", "Mon", "Oct 21", "Oct 21, 2025", "sometime", ""]:
            self.assertIsNone(li._message_seconds(text, now, 0), text)
        # A clock time with the page's zone not known is not read.
        self.assertIsNone(li._message_seconds("2:30 PM", now, None))

    def test_a_clock_time_is_read_in_the_pages_zone_not_the_containers(self):
        now = 1792681200.0
        # The page is in New York (UTC-4 in October): its 10:30 AM is 14:30 UTC, half an hour ago.
        self.assertEqual(li._message_seconds("10:30 AM", now, -4 * 3600), now - 30 * 60)
        # In Berlin (UTC+2) the same words are 08:30 UTC, six and a half hours ago.
        self.assertEqual(li._message_seconds("10:30 AM", now, 2 * 3600), now - 6.5 * 3600)
        with mock.patch.dict(os.environ, {"TZ": "Asia/Tokyo"}):
            time.tzset()
            try:
                self.assertEqual(li._message_seconds("10:30 AM", now, -4 * 3600), now - 30 * 60)
            finally:
                os.environ.pop("TZ", None)
        time.tzset()
        page = FakePage({self.THREAD: {"clock": {"now": now, "offset": -4 * 3600}}})
        page.url = self.THREAD
        self.assertEqual(li._page_clock(page), (now, -4 * 3600))

    def test_the_same_words_from_an_older_day_are_sent_again(self):
        messages = {"header": "/in/jane-doe/", "messages": [{"urn": "m1", "name": "Sam Kim", "href": "/in/sam-kim/", "time": "Mon", "text": "Thanks!"}]}
        page = self.page(**{self.THREAD: {"messages": messages}})
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_message(page, {"conversationId": "2-abcDEF123", "slug": "jane-doe", "text": "Thanks!"})
        # Not found in time on the fake page after Send, but it was typed and sent.
        self.assertIn(("pressed", "send"), self.record)
        self.assertIn("may already be on LinkedIn", str(caught.exception))


class ReadTimesTest(PatchedTest):
    def test_the_feeds_time_starts_before_the_walk_to_the_feed(self):
        clock = [1000.0]
        seen = {}

        def walk(page, step):
            clock[0] += 500
            return {"slug": ME, "name": "Sam Kim"}

        def collect(page, net, want, deadline):
            seen["deadline"] = deadline
            return [], set()

        with mock.patch.object(li.time, "monotonic", side_effect=lambda: clock[0]), mock.patch.object(li, "_signed_in_feed", side_effect=walk), \
                mock.patch.object(li, "_collect", side_effect=collect), mock.patch.object(li, "_settle"):
            li.linkedin_feed(FakePage(), {"max": 5})
        self.assertEqual(seen["deadline"], 1000.0 + li.READ_BUDGET_SECONDS)

    def test_the_inbox_stops_opening_conversations_when_its_time_is_up(self):
        clock = [0.0]
        threads = [{"href": "/messaging/thread/2-thread%02d/" % index, "lines": []} for index in range(8)]
        page = FakePage({"https://www.linkedin.com/messaging/": {"threads": threads}})
        real_goto = page.goto

        def slow_goto(url, wait_until=None, timeout=None):
            clock[0] += 30
            real_goto(url, wait_until, timeout)

        page.goto = slow_goto
        with mock.patch.object(li.time, "monotonic", side_effect=lambda: clock[0]), mock.patch.object(li, "_signed_in_feed", return_value={"slug": ME, "name": ""}), \
                mock.patch.object(li, "_settle"):
            li.linkedin_inbox(page)
        opened = [url for url in page.went if "/messaging/thread/" in url]
        self.assertLess(len(opened), 8)


class ScopedWritingTest(WritingBase):
    """Where the box, the switch and Post are looked for: inside the card written under, never page-wide."""

    PARENT = "7250000000000000501"

    def scopes(self):
        asked = []
        plain = li._first_visible

        def visible(scope, selectors, timeout_ms):
            asked.append((getattr(scope, "name", "page"), " ".join(selectors if isinstance(selectors, list) else [selectors])))
            return plain(scope, selectors, timeout_ms)

        li._first_visible = visible
        return asked

    def test_a_reply_whose_comment_is_not_drawn_sends_nothing(self):
        page = self.page([comment(POST, "7250000000000000502")])
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, self.PARENT, "Agreed", "", False)
        self.assertIn("comment to answer is not on the page. Nothing was sent", str(caught.exception))
        self.assertEqual([item for item in self.record if item[0] in ("typed", "pressed")], [])

    def test_a_replys_box_and_post_are_found_inside_the_comment_answered(self):
        self.visible["reply-action"] = FakeButton("reply")
        page = self.page([comment(POST, self.PARENT)])
        asked = self.scopes()
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000503"):
            li._write_comment(page, ME, POST, self.PARENT, "Agreed", "", False)
        for word in ("ql-editor", "submit-button"):
            places = {where for where, joined in asked if word in joined}
            self.assertEqual(places, {"comment %s" % self.PARENT}, word)

    def test_a_comments_box_and_post_are_found_inside_the_posts_own_card(self):
        page = self.page()
        asked = self.scopes()
        with mock.patch.object(li, "_comment_landed", return_value="7250000000000000504"):
            li._write_comment(page, ME, POST, "", "Nice one.", "", False)
        for word in ("ql-editor", "submit-button"):
            self.assertEqual({where for where, joined in asked if word in joined}, {"post %s" % POST}, word)


class LineBreakTest(WritingBase):
    def test_a_line_break_is_shift_enter_never_enter(self):
        li._type_into(FakePage(record=self.record), self.box, "First line\nSecond line", "comment")
        self.assertIn(("key", "Shift+Enter"), self.record)
        self.assertNotIn(("typed", "\n"), self.record)
        self.assertNotIn(("key", "Enter"), self.record)
        self.assertTrue(li._box_matches("First line\nSecond line", self.box.inner_text()))

    def test_a_connection_note_breaks_its_lines_the_same_way(self):
        self.visible["pv-top-card"] = FakeButton("actions")
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        profile = "https://www.linkedin.com/in/jane-doe/"
        page = self.page(**{profile: {"actions": {"found": True, "name": "Jane Doe", "labels": ["Invite Jane Doe to connect"], "degree": "2nd"}}})
        with mock.patch.object(li, "_after_press", return_value=True):
            li.linkedin_connect(page, {"slug": "jane-doe", "note": "Hi Jane\nLoved the post"})
        self.assertIn(("key", "Shift+Enter"), self.record)
        self.assertNotIn(("typed", "\n"), self.record)


class AllOpenTest(WritingBase):
    def test_fewer_comments_drawn_than_linkedin_counts_is_not_all_open(self):
        post = {"_commentCount": 9}
        self.assertFalse(li._all_open(True, post, [{"id": "1"}]))
        self.assertTrue(li._all_open(True, {"_commentCount": 1}, [{"id": "1"}]))
        page = FakePage({POST_URL: {"cards": [card(POST, comments="9 comments")], "comments": [comment(POST, "7250000000000000601")]}}, record=self.record)
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(page, ME, POST, "", "Hello", "", False)
        self.assertIn(li.NO_EARLIER_LOOK, str(caught.exception))


class PressClockTest(WritingBase):
    def tearDown(self):
        li._press_by = None
        WritingBase.tearDown(self)

    def test_the_launchers_limit_is_read_for_the_routine(self):
        with mock.patch.object(li.time, "monotonic", return_value=1000.0):
            self.assertEqual(li._begin_write("comment", "comment"), 1000.0 + 900 - li.PRESS_MARGIN_SECONDS)
            self.assertEqual(li._begin_write("nothing_listed", "x"), 1000.0 + 90 - li.PRESS_MARGIN_SECONDS)
        with mock.patch.object(li, "LAUNCHER", "/no/such/launch.py"), self.assertRaises(li.CommandError) as caught:
            li._begin_write("comment", "comment")
        self.assertIn("Nothing was sent", str(caught.exception))

    def test_no_press_within_a_minute_of_the_launchers_limit(self):
        li._press_by = time.monotonic() - 1
        with self.assertRaises(li.CommandError) as caught:
            li._write_comment(self.page(), ME, POST, "", "Nice one.", "", False)
        self.assertIn("Nothing was sent", str(caught.exception))
        self.assertNotIn(("pressed", "post"), self.record)

    def test_a_slow_video_download_leaves_no_time_to_post(self):
        page = self.page(**{"https://www.linkedin.com/in/sam-kim/recent-activity/all/": {"cards": []}})
        clock = [0.0]

        def slow_video(url, step):
            clock[0] += li.VISIT_BUDGET_SECONDS
            return None

        with mock.patch.object(li.time, "monotonic", side_effect=lambda: clock[0]), mock.patch.object(li, "_video_file", side_effect=slow_video), \
                mock.patch.object(li, "_signed_in_feed", return_value={"slug": ME, "name": "Sam Kim"}), mock.patch.object(li, "_settle"):
            with self.assertRaises(li.CommandError) as caught:
                li.linkedin_publish(page, {"text": "Watch this", "videoUrl": "https://cdn.test/a.mp4"})
        self.assertIn("too long to download", str(caught.exception))
        self.assertNotIn(("pressed", "post"), self.record)


class SecondAuditTest(WritingBase):
    PROFILE = "https://www.linkedin.com/in/jane-doe/"

    def connect_page(self, actions_after=None):
        before = {"found": True, "name": "Jane Doe", "labels": ["Invite Jane Doe to connect"], "degree": "2nd"}
        page = self.page(**{self.PROFILE: {"actions": before}})
        if actions_after is not None:
            real = li.human.click

            def click(locator, timeout=None):
                real(locator, timeout)
                if getattr(locator, "name", "") == "connect":
                    page.plays[self.PROFILE]["actions"] = actions_after

            li.human.click = click
        return page

    def test_a_connect_click_that_sent_by_itself_is_done_not_nothing_sent(self):
        self.visible["pv-top-card"] = FakeButton("actions")
        self.visible["to connect"] = FakeButton("connect", label="Invite Jane Doe to connect")
        pending = {"found": True, "name": "Jane Doe", "labels": ["Pending, click to withdraw invitation sent to Jane Doe"], "degree": "2nd"}
        self.visible.pop("Send invitation")
        self.assertEqual(li.linkedin_connect(self.connect_page(pending), {"slug": "jane-doe", "note": ""}), {"done": True, "already": False})
        # With a note wanted, the dialog to add it never came, because the request already went.
        self.visible.pop("Add a note")
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_connect(self.connect_page(pending), {"slug": "jane-doe", "note": "Hi"})
        self.assertIn("may already be on LinkedIn", str(caught.exception))
        self.assertNotIn("Nothing was sent", str(caught.exception))

    def test_an_edits_save_is_found_inside_the_comment_or_the_dialog(self):
        asked = []
        plain = li._first_visible

        def visible(scope, selectors, timeout_ms):
            joined = " ".join(selectors if isinstance(selectors, list) else [selectors])
            if "Save" in joined:
                asked.append((getattr(scope, "name", "page"), joined))
                return FakeButton("save")
            return plain(scope, selectors, timeout_ms)

        li._first_visible = visible
        ours = "7250000000000000701"
        page = self.page([comment(POST, ours, slug=ME, text="Old words")])
        self.visible["comment-options"] = FakeButton("menu")
        self.visible["menuitem"] = FakeButton("edit item")
        with mock.patch.object(li, "_after_press", return_value=True):
            li.linkedin_edit(page, {"postId": POST, "commentId": ours, "text": "New words"})
        self.assertEqual(asked[-1][0], "comment %s" % ours)
        asked.clear()
        del self.record[:]
        page = self.page()
        page.plays[POST_URL]["cards"] = [card(POST, slug=ME, text="Old post words")]
        self.visible["control-menu"] = FakeButton("menu")
        with mock.patch.object(li, "_after_press", return_value=True):
            li.linkedin_edit(page, {"postId": POST, "commentId": "", "text": "New post words"})
        self.assertTrue(all(part.strip().startswith("[role='dialog']") for part in asked[-1][1].split(",") if "Save" in part))

    def test_a_post_delete_counts_only_on_linkedins_own_words(self):
        page = self.page()
        page.plays[POST_URL]["cards"] = [card(POST, slug=ME)]
        self.visible["control-menu"] = FakeButton("menu")
        self.visible["menuitem"] = FakeButton("delete item")
        self.visible["alertdialog"] = FakeButton("confirm")

        def blank_after_press(locator, timeout=None):
            self.record.append(("pressed", getattr(locator, "name", "")))
            if getattr(locator, "name", "") == "confirm":
                page.plays[POST_URL] = {}

        li.human.click = blank_after_press
        with self.assertRaises(li.CommandError) as caught:
            li.linkedin_delete(page, {"postId": POST, "commentId": ""})
        self.assertIn("may already be on LinkedIn", str(caught.exception))

    def test_an_accepted_card_saying_now_connected_is_accepted(self):
        card_link = FakeLocator([types.SimpleNamespace(get_attribute=lambda name: "/in/ana-ruiz/", count=lambda: 1)])
        invite = types.SimpleNamespace(locator=lambda selector: card_link, name="invite card")
        manager = "https://www.linkedin.com/mynetwork/invitation-manager/received/"
        page = self.page(**{manager: {"people": [{"href": "/in/ana-ruiz/", "lines": ["Ana Ruiz", "You're now connected"]}]}})
        page.locator = lambda selector: FakeLocator([invite]) if "invitation" in selector else FakeLocator()
        accept = FakeButton("accept", on_press=lambda: self.visible.pop("Accept", None))
        self.visible["Accept"] = accept
        self.assertEqual(li.linkedin_accept(page, {"slug": "ana-ruiz"}), {"done": True})

    def test_a_newsletter_title_only_mentioned_in_words_is_not_the_issue(self):
        mention = card(OTHER, slug=ME, text="Next week: Why onboarding emails fail, my new issue", age="20m")
        page_posts = li._posts_on_page(FakePage({li.FEED: {"cards": [mention]}}))
        self.assertIsNone(li._mine_article(page_posts, "Why onboarding emails fail"))


class LauncherTimesTest(unittest.TestCase):
    def limits(self):
        with open(os.path.join(HERE, "launch.py"), encoding="utf-8") as source:
            tree = ast.parse(source.read())
        return next(ast.literal_eval(node.value) for node in ast.walk(tree) if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "ROUTINE_TIMEOUT_SECONDS")

    def test_every_linkedin_routine_answers_before_the_app_stops_waiting(self):
        # Read out of calls.ts and command.ts, so the launcher and the app never drift apart.
        root = os.path.join(HERE, "..", "..", "src", "server")
        with open(os.path.join(root, "social", "linkedin", "calls.ts"), encoding="utf-8") as source:
            calls = source.read()
        with open(os.path.join(root, "browser", "command.ts"), encoding="utf-8") as source:
            default_ms = int(re.search(r"const DEFAULT_TIMEOUT_MS = ([\d_]+)", source.read()).group(1).replace("_", ""))
        constants = {name: int(value.replace("_", "")) for name, value in re.findall(r"const (\w+_TIMEOUT_MS) = ([\d_]+)", calls)}
        limits = self.limits()
        with open(os.path.join(HERE, "launch.py"), encoding="utf-8") as source:
            default_s = int(re.search(r"^WORK_TIMEOUT_SECONDS = (\d+)", source.read(), re.M).group(1))
        found = re.findall(r'call\(target, "linkedin/(\w+)", [^)]*?(?:, (\w+_TIMEOUT_MS))?\)\n', calls)
        self.assertEqual({name for name, _ in found}, set(li.ROUTINES))
        for name, constant in found:
            app_ms = constants[constant] if constant else default_ms
            launcher_s = limits.get("linkedin." + name, default_s)
            self.assertLess(launcher_s * 1000, app_ms, name)
        self.assertEqual(limits["linkedin.quick_state"], 50)

    def test_each_linkedin_routine_gets_the_time_the_app_waits_for(self):
        limits = self.limits()
        self.assertEqual([limits["linkedin." + name] for name in ("comment", "publish", "warm_up")], [900, 900, 900])
        self.assertEqual(limits["linkedin.newsletter"], 1800)
        self.assertEqual([limits["linkedin." + name] for name in ("edit", "message")], [600, 600])
        self.assertEqual([limits["linkedin." + name] for name in ("delete", "connect", "accept")], [240, 240, 240])
        self.assertEqual([limits["linkedin." + name] for name in ("check", "lookup", "seen", "find_own", "numbers", "feed", "inbox")], [120] * 7)


if __name__ == "__main__":
    unittest.main()
