"""Tests for X's reads in routines/x.py. Run from apps/promo:

    python3 -m unittest discover -s docker/browser -p "test_*.py"

No browser is needed. The answers below have the shapes X's web app
receives from its own GraphQL and message addresses, written from how X puts
them together, with the words cut down to a line. None of them was measured
on the live site yet: a real search account on the real site is the only
proof a read works; these prove the parsing and the stopping rules around it.
"""

import ast
import email.message
import os
import sys
import time
import types
import unittest
from datetime import datetime, timezone
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The person-pace helpers are replaced below, so nothing waits.
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import x  # noqa: E402

CREATED = "Wed Oct 21 09:30:00 +0000 2026"
CREATED_SECONDS = datetime(2026, 10, 21, 9, 30, tzinfo=timezone.utc).timestamp()
# A post that went up a minute ago, in X's way and as a drawn post's time.
JUST_NOW = time.strftime("%a %b %d %H:%M:%S +0000 %Y", time.gmtime(time.time() - 60))
JUST_NOW_ISO = time.strftime("%Y-%m-%dT%H:%M:%S.000Z", time.gmtime(time.time() - 60))


def tweet(post_id, handle="levelsio", user_id="11", text="Shipping a new thing today", likes=3, replies=1, reposts=2, views="1234",
          followers=5000, reply_to=None, reply_to_user=None, limited=False, retweet=False, quoted=None, card=None, urls=None, wrapped=False, created=CREATED):
    legacy = {
        "full_text": text,
        "created_at": created,
        "favorite_count": likes,
        "reply_count": replies,
        "retweet_count": reposts,
        "user_id_str": user_id,
        "entities": {"urls": urls or []},
    }
    if reply_to:
        legacy["in_reply_to_status_id_str"] = reply_to
        legacy["in_reply_to_user_id_str"] = reply_to_user or "99"
    if retweet:
        legacy["retweeted_status_result"] = {"result": {"rest_id": "1"}}
    if quoted:
        legacy["quoted_status_id_str"] = quoted
    result = {
        "__typename": "Tweet",
        "rest_id": post_id,
        "core": {"user_results": {"result": {
            "__typename": "User",
            "rest_id": user_id,
            "core": {"screen_name": handle, "name": handle.title(), "created_at": "Tue Mar 03 10:00:00 +0000 2015"},
            "legacy": {"followers_count": followers},
        }}},
        "views": {"count": views, "state": "EnabledWithCount"},
        "legacy": legacy,
    }
    if limited:
        result["limitedActionResults"] = {"limited_actions": [{"action": "Reply", "prompt": {}}]}
    if card:
        result["card"] = card
    if wrapped:
        return {"__typename": "TweetWithVisibilityResults", "tweet": result}
    return result


def entry(result, entry_id=None, promoted=False, pin=False):
    content = {"itemType": "TimelineTweet", "tweet_results": {"result": result}}
    if promoted:
        content["promotedMetadata"] = {"advertiser_results": {}}
    if pin:
        content["socialContext"] = {"contextType": "Pin"}
    post_id = (result.get("tweet") or result).get("rest_id", "0")
    return {"entryId": entry_id or "tweet-%s" % post_id, "content": {"entryType": "TimelineTimelineItem", "itemContent": content}}


def module(entry_id, results):
    return {"entryId": entry_id, "content": {"entryType": "TimelineTimelineModule", "items": [
        {"entryId": "%s-tweet-%s" % (entry_id, result["rest_id"]), "item": {"itemContent": {"itemType": "TimelineTweet", "tweet_results": {"result": result}}}}
        for result in results
    ]}}


def search_answer(entries):
    return {"data": {"search_by_raw_query": {"search_timeline": {"timeline": {"instructions": [{"type": "TimelineAddEntries", "entries": entries}]}}}}}


def user_tweets_answer(entries, pinned=None):
    instructions = [{"type": "TimelineAddEntries", "entries": entries}]
    if pinned:
        instructions.insert(0, {"type": "TimelinePinEntry", "entry": pinned})
    return {"data": {"user": {"result": {"timeline": {"timeline": {"instructions": instructions}}}}}}


def detail_answer(entries):
    return {"data": {"threaded_conversation_with_injections_v2": {"instructions": [{"type": "TimelineAddEntries", "entries": entries}]}}}


GRAPHQL = "https://x.com/i/api/graphql/abc123/%s?variables=%%7B%%7D"


class FakeResponse(object):
    def __init__(self, url, body, status=200):
        self.url = url
        self.status = status
        self._body = body

    def json(self):
        if self._body is None:
            raise ValueError("no body")
        return self._body


class FakeLocator(object):
    def count(self):
        return 0


class FakePage(object):
    """The parts of Playwright's page the reads use. A visit to an address plays X's answers for it."""

    def __init__(self, loads, handle="searcher", url="https://x.com/home", cards=None, text=""):
        self.loads = loads
        self.handle = handle
        self.url = url
        self.cards = cards or []
        self.text = text
        self.went = []
        self.listeners = []

    def on(self, event, handler):
        self.listeners.append(handler)

    def remove_listener(self, event, handler):
        self.listeners.remove(handler)

    def goto(self, url, wait_until=None, timeout=None):
        self.went.append(url)
        self.url = url
        for op, body, status in self.loads.get(url, []):
            for handler in list(self.listeners):
                handler(FakeResponse(GRAPHQL % op if "/" not in op else op, body, status))

    def wait_for_timeout(self, ms):
        pass

    def locator(self, selector):
        return FakeLocator()

    def evaluate(self, script, arg=None):
        parsed = x.urllib.parse.urlparse(self.url)
        if "x:signs" in script:
            return {"url": self.url, "host": parsed.hostname, "path": parsed.path, "text": self.text,
                    "profileHref": "/%s" % self.handle if self.handle else "", "login": not self.handle,
                    "codeField": False, "arkose": False, "initial": {}}
        if "x:ready" in script:
            return {"articles": len(self.cards), "cells": 0, "empty": True, "error": False, "login": False}
        if "x:cards" in script:
            return self.cards
        if "x:profile" in script or "x:trends" in script or "x:community" in script:
            return {} if "x:trends" not in script else []
        raise AssertionError("unexpected script: %s" % script[:80])


class FakeHuman(object):
    """Scrolls that move and clicks that do nothing, so the stopping rules can be watched."""

    scrolls = 0

    def scroll_once(self, page, direction=1, limit=None):
        FakeHuman.scrolls += 1
        return 300

    def click(self, locator, timeout=None):
        pass


class PatchedTest(unittest.TestCase):
    def setUp(self):
        self.saved = (x.human, x._first_visible)
        x.human = FakeHuman()
        FakeHuman.scrolls = 0
        x._first_visible = lambda scope, selectors, timeout_ms: None

    def tearDown(self):
        x.human, x._first_visible = self.saved


class SmallReadersTest(unittest.TestCase):
    def test_numbers_as_x_writes_them(self):
        self.assertEqual(x._number("1.2K"), 1200)
        self.assertEqual(x._number("3.4M"), 3_400_000)
        self.assertEqual(x._number("2.5B"), 2_500_000_000)
        self.assertEqual(x._number("1,234"), 1234)
        self.assertEqual(x._number(" 12 "), 12)
        self.assertIsNone(x._number(""))
        self.assertIsNone(x._number("twelve"))
        self.assertEqual(x._count("5321"), 5321)
        self.assertEqual(x._count(7), 7)
        self.assertIsNone(x._count(None))
        self.assertIsNone(x._count(True))

    def test_handles_out_of_names_addresses_and_paths(self):
        for value in ["@sam_k", "sam_k", "x.com/sam_k", "https://twitter.com/sam_k/status/1", "https://www.x.com/sam_k?s=20", "/sam_k"]:
            self.assertEqual(x._handle(value), "sam_k", value)
        for value in ["", "sam k", "far_too_long_a_name", "https://evil.test/sam_k", "@"]:
            self.assertEqual(x._handle(value), "", value)
        with self.assertRaises(x.CommandError):
            x._handle_arg("not a handle!", "follow")

    def test_post_ids_out_of_addresses_and_only_digits_as_an_argument(self):
        self.assertEqual(x._post_from_path("/sam_k/status/1849000000000000001"), ("sam_k", "1849000000000000001"))
        self.assertEqual(x._post_from_path("https://x.com/sam_k/status/1849000000000000001/analytics"), ("sam_k", "1849000000000000001"))
        self.assertIsNone(x._post_from_path("/sam_k/likes"))
        self.assertEqual(x._post_id(" 1849000000000000001 ", "post"), "1849000000000000001")
        for value in ["", "abc", "123", "1849/../1", None]:
            with self.assertRaises(x.CommandError, msg=value):
                x._post_id(value, "post")
        self.assertEqual(x._conversation_id("123-456", "message"), "123-456")
        with self.assertRaises(x.CommandError):
            x._conversation_id("123-456/../x", "message")

    def test_times_x_writes(self):
        self.assertEqual(x._x_time(CREATED), CREATED_SECONDS)
        self.assertEqual(x._x_time("Wed Oct 21 11:30:00 +0200 2026"), CREATED_SECONDS)
        self.assertIsNone(x._x_time("yesterday"))
        self.assertIsNone(x._x_time(None))
        self.assertEqual(x._iso_time("2026-10-21T09:30:00.000Z"), CREATED_SECONDS)
        self.assertIsNone(x._iso_time("2026-10-21"))
        self.assertEqual(x._joined_words("Joined March 2015"), datetime(2015, 3, 1, tzinfo=timezone.utc).timestamp())
        self.assertIsNone(x._joined_words("Born March 2015"))

    def test_the_action_rows_counts_in_words(self):
        self.assertEqual(
            x._counts_from_label("12 replies, 4 reposts, 1,203 likes, 3 bookmarks, 5321 views"),
            {"replies": 12, "reposts": 4, "likes": 1203, "bookmarks": 3, "views": 5321},
        )
        self.assertEqual(x._counts_from_label("1 reply, 1 like"), {"replies": 1, "likes": 1})
        self.assertEqual(x._counts_from_label(""), {})

    def test_rate_limits_by_status_and_by_xs_own_code(self):
        self.assertTrue(x._rate_limited(429, None))
        self.assertTrue(x._rate_limited(200, {"errors": [{"code": 88, "message": "Rate limit exceeded"}]}))
        self.assertTrue(x._rate_limited(403, {"errors": [{"message": "Rate limit exceeded."}]}))
        self.assertFalse(x._rate_limited(200, {"data": {}}))
        self.assertFalse(x._rate_limited(404, {"errors": [{"code": 144}]}))

    def test_which_answer_an_address_is(self):
        self.assertEqual(x._operation("https://x.com/i/api/graphql/Aa1_-b/SearchTimeline?variables=%7B%7D"), "SearchTimeline")
        self.assertEqual(x._operation("https://api.x.com/graphql/Aa1/TweetDetail?variables=1"), "TweetDetail")
        self.assertEqual(x._operation("https://x.com/i/api/1.1/dm/inbox_initial_state.json?x=1"), "dm/inbox_initial_state")
        self.assertEqual(x._operation("https://x.com/i/api/1.1/dm/conversation/123-456.json"), "dm/conversation")
        self.assertEqual(x._operation("https://x.com/i/api/2/guide.json"), "guide")
        self.assertEqual(x._operation("https://evil.test/i/api/graphql/a/SearchTimeline"), "")
        self.assertEqual(x._operation("https://abs.twimg.com/responsive-web/client-web/main.js"), "")

    def test_a_polls_length_in_xs_three_boxes(self):
        self.assertEqual(x._poll_length(90), (0, 1, 30))
        self.assertEqual(x._poll_length(1440), (1, 0, 0))
        self.assertEqual(x._poll_length(10080), (7, 0, 0))
        self.assertEqual(x._poll_length(2), (0, 0, 5))
        self.assertEqual(x._poll_arg({"choices": ["Yes", "No"], "minutes": 60}, "publish"), (["Yes", "No"], 60))
        for poll in [{"choices": ["Only"], "minutes": 60}, {"choices": ["a", "b", "c", "d", "e"], "minutes": 60},
                     {"choices": ["a" * 26, "b"], "minutes": 60}, {"choices": ["a", "b"], "minutes": 3}, {"choices": ["a", "b"]}]:
            with self.assertRaises(x.CommandError, msg=str(poll)):
                x._poll_arg(poll, "publish")

    def test_a_distinctive_phrase_to_search_for(self):
        self.assertEqual(x._phrase("Try @sam's idea, #buildinpublic too"), "Try s idea too")
        long = "I had the same problem with onboarding emails until we rewrote everything around one clear question https://x.test"
        phrase = x._phrase(long)
        self.assertEqual(len(phrase.split()), 7)
        self.assertIn(phrase, long)
        self.assertNotIn("http", phrase)

    def test_words_compare_though_x_made_them_curly_and_put_names_in_front(self):
        self.assertTrue(x._same_words("I've used it for years - honestly.", "@sam @kim I\u2019ve used it for years \u2014 honestly."))
        self.assertTrue(x._same_words("Read this https://example.com/a first", "Read this https://t.co/xyz first"))
        self.assertFalse(x._same_words("Something else entirely", "I've used it for years"))
        self.assertFalse(x._same_words("", "anything"))

    def test_a_picture_must_be_https(self):
        for url in ["http://cdn.test/a.png", "file:///etc/passwd", "ftp://cdn.test/a.png", "https:///nohost.png", ""]:
            with self.assertRaises(x.CommandError, msg=url):
                x._picture_file(url, "publish")

    def test_what_x_answers_to_a_new_post(self):
        made = {"data": {"create_tweet": {"tweet_results": {"result": {"rest_id": "1849000000000000009", "legacy": {}}}}}}
        self.assertEqual(x._created_id(made), ("1849000000000000009", ""))
        long = {"data": {"notetweet_create": {"tweet_results": {"result": {"rest_id": "1849000000000000010"}}}}}
        self.assertEqual(x._created_id(long), ("1849000000000000010", ""))
        refused = {"errors": [{"code": 187, "message": "Status is a duplicate. (187)"}], "data": {}}
        self.assertEqual(x._created_id(refused), ("", "Status is a duplicate. (187)"))
        self.assertEqual(x._created_id(None), ("", ""))

    def test_a_polls_votes_per_choice(self):
        card = {"legacy": {"name": "poll3choice_text_only", "binding_values": [
            {"key": "choice1_label", "value": {"string_value": "A"}}, {"key": "choice1_count", "value": {"string_value": "12"}},
            {"key": "choice2_label", "value": {"string_value": "B"}}, {"key": "choice2_count", "value": {"string_value": "0"}},
            {"key": "choice3_label", "value": {"string_value": "C"}}, {"key": "choice3_count", "value": {"string_value": "5"}},
        ]}}
        self.assertEqual(x._poll_votes(tweet("1849000000000000001", card=card)), [12, 0, 5])
        self.assertIsNone(x._poll_votes(tweet("1849000000000000001")))
        self.assertIsNone(x._poll_votes(tweet("1849000000000000001", card={"legacy": {"name": "summary_large_image"}})))

    def test_the_twid_cookie_names_the_signed_in_account(self):
        self.assertEqual(x._twid_user("u%3D1234567890"), "1234567890")
        self.assertEqual(x._twid_user("u=42"), "42")
        self.assertEqual(x._twid_user(""), "")


class SignsTest(unittest.TestCase):
    def raw(self, path="/home", text="", profile="/sam_k", **extra):
        out = {"host": "x.com", "path": path, "text": text, "profileHref": profile, "login": False, "codeField": False, "arkose": False, "initial": {}}
        out.update(extra)
        return out

    def test_signed_in_and_signed_out(self):
        signs = x._judge(self.raw())
        self.assertEqual((signs["checked"], signs["handle"], signs["blocked"]), (True, "sam_k", False))
        out = x._judge(self.raw(path="/i/flow/login", profile="", login=True))
        self.assertEqual((out["checked"], out["handle"], out["signedOut"]), (True, None, True))
        # A page that said nothing either way is not written down as signed out.
        self.assertFalse(x._judge(self.raw(profile=""))["checked"])
        self.assertFalse(x._judge(dict(self.raw(), host="example.test"))["checked"])

    def test_xs_own_words_on_a_lock_or_limit_screen(self):
        limited = x._judge(self.raw(text="Home\nWe\u2019ve temporarily limited some of your account features\nWhile in this state, you can still browse X."))
        self.assertTrue(limited["blocked"])
        self.assertTrue(limited["banScreen"].startswith("We\u2019ve temporarily limited some of your account features While in this state"))
        suspended = x._judge(self.raw(text="Your account is suspended\nAfter careful review, we determined your account broke the X Rules."))
        self.assertIn("Your account is suspended", suspended["banScreen"])
        locked = x._judge(self.raw(path="/account/access", profile="", text="Your account has been locked.\nWe've detected some unusual activity."))
        self.assertIn("Your account has been locked.", locked["banScreen"])
        access = x._judge(self.raw(path="/account/access", profile="", text="Help us keep X safe"))
        self.assertTrue(access["banScreen"])
        self.assertIsNone(x._judge(self.raw(text="Home\nFor you\nFollowing"))["banScreen"])

    def test_a_sign_in_code_a_puzzle_and_a_rate_limit_are_in_the_way_but_are_not_bans(self):
        code = x._judge(self.raw(path="/i/flow/login", profile="", codeField=True, text="Enter your verification code\nUse your code generator app"))
        self.assertEqual((code["blocked"], code["reason"], code["banScreen"]), (True, x.CODE_REASON, None))
        who = x._judge(self.raw(path="/i/flow/login", profile="", codeField=True, text="There was unusual login activity on your account."))
        self.assertNotEqual(who["reason"], x.CODE_REASON)
        self.assertTrue(who["blocked"])
        puzzle = x._judge(self.raw(arkose=True))
        self.assertEqual(puzzle["reason"], "X is asking the browser to prove it is a person")
        limit = x._judge(self.raw(text="Something went wrong. Try reloading.\nRate limit exceeded"))
        self.assertTrue(limit["limited"])
        self.assertIsNone(limit["banScreen"])

    def test_a_posts_page_saying_it_is_gone(self):
        self.assertTrue(x._judge(self.raw(text="Hmm...this page doesn\u2019t exist. Try searching for something else."))["gonePage"])
        self.assertFalse(x._judge(self.raw(text="Post\nReply"))["gonePage"])

    def test_the_quick_look_never_reads_another_site(self):
        page = FakePage({}, url="https://example.test/")
        state = x.x_state_quick(page)
        self.assertFalse(state["checked"])
        self.assertEqual(set(state), {"checked", "handle", "blocked", "reason", "banScreen", "joinedSeconds", "followers"})
        self.assertEqual(x.x_state_quick(FakePage({}))["handle"], "searcher")


class TrendsTest(unittest.TestCase):
    def test_trends_out_of_xs_data_and_where_they_are_for(self):
        answer = {"name": "GenericTimelineById", "data": {"data": {"timeline": {"timeline": {"instructions": [{"type": "TimelineAddEntries", "entries": [
            {"entryId": "trend-1", "content": {"itemContent": {"itemType": "TimelineTrend", "name": "#Arsenal", "trend_metadata": {"domain_context": "Trending in United Kingdom", "meta_description": "52.1K posts"}}}},
            {"entryId": "trend-2", "content": {"itemContent": {"itemType": "TimelineTrend", "name": "Budget", "trend_metadata": {"domain_context": "Politics \u00b7 Trending"}}}},
            {"entryId": "trend-3", "content": {"itemContent": {"itemType": "TimelineTrend", "name": "#arsenal", "trend_metadata": {}}}},
            {"entryId": "trend-4", "content": {"itemContent": {"itemType": "TimelineTrend", "name": "Rain", "trend_metadata": {"domain_context": "Trending in United Kingdom", "meta_description": "5,021 Tweets"}}}},
        ]}]}}}}}
        trends = x._trends_in([answer])
        self.assertEqual([(trend["name"], trend["posts"]) for trend in trends], [("#Arsenal", 52100), ("Budget", None), ("Rain", 5021)])
        self.assertEqual(x._place(trends), "Trending in United Kingdom")
        old = {"name": "guide", "data": {"timeline": {"instructions": [{"addEntries": {"entries": [{"content": {"timelineModule": {"items": [
            {"item": {"content": {"trend": {"name": "Coffee", "trendMetadata": {"metaDescription": "1.2K posts", "domainContext": "Trending in Germany"}}}}},
        ]}}}]}}]}}}
        self.assertEqual(x._trends_in([old]), [{"name": "Coffee", "posts": 1200, "context": "Trending in Germany"}])

    def test_a_drawn_trends_lines(self):
        self.assertEqual(x._trend_from_lines(["1", "\u00b7", "Trending in United Kingdom", "#Arsenal", "52.1K posts"]),
                         {"name": "#Arsenal", "posts": 52100, "context": "Trending in United Kingdom"})
        self.assertEqual(x._trend_from_lines(["Sports \u00b7 Trending", "Arsenal", "Trending with Saka, Odegaard"]),
                         {"name": "Arsenal", "posts": None, "context": "Sports \u00b7 Trending"})
        self.assertIsNone(x._trend_from_lines(["3", "\u00b7"]))
        self.assertEqual(x._place([{"context": "Politics \u00b7 Trending"}]), "")


class SearchTest(PatchedTest):
    URL = "https://x.com/search?q=project%20tools&src=typed_query&f=live"

    def test_a_search_keeps_page_order_skips_adverts_and_stops_at_max(self):
        entries = [
            entry(tweet("1849000000000000001", text="Which tools &amp; boards do you use? https://t.co/a", urls=[{"url": "https://t.co/a", "expanded_url": "https://example.com/post"}])),
            entry(tweet("1849000000000000002", handle="brand"), entry_id="promoted-tweet-1849000000000000002", promoted=True),
            entry(tweet("1849000000000000003", handle="kim", user_id="12", limited=True, reply_to="1848", reply_to_user="13", text="@ann @bo I just use a list", wrapped=True)),
            entry(tweet("1849000000000000004", handle="lee", user_id="14")),
        ]
        page = FakePage({self.URL: [("SearchTimeline", search_answer(entries), 200)]})
        found = x.x_search(page, {"kind": "search", "value": "project tools", "max": 2})
        self.assertEqual([post["postId"] for post in found["posts"]], ["1849000000000000001", "1849000000000000003"])
        self.assertEqual([post["position"] for post in found["posts"]], [0, 1])
        # Every post X sent counts against the account's day, the advert and the one past max included.
        self.assertEqual((found["viewed"], found["limited"]), (4, False))
        self.assertEqual(FakeHuman.scrolls, 0)
        first, second = found["posts"]
        self.assertEqual(first["text"], "Which tools & boards do you use? https://example.com/post")
        self.assertEqual(first["link"], "https://example.com/post")
        self.assertEqual((first["authorId"], first["authorHandle"], first["authorName"], first["authorFollowers"]), ("11", "levelsio", "Levelsio", 5000))
        self.assertEqual((first["views"], first["likes"], first["replies"], first["reposts"]), (1234, 3, 1, 2))
        self.assertEqual(first["postedSeconds"], CREATED_SECONDS)
        self.assertEqual(first["url"], "https://x.com/levelsio/status/1849000000000000001")
        self.assertTrue(first["repliesOpen"])
        self.assertFalse(first["isReply"])
        self.assertEqual(second["text"], "I just use a list")
        self.assertFalse(second["repliesOpen"])
        self.assertTrue(second["isReply"])
        keys = {"postId", "url", "text", "authorId", "authorHandle", "authorName", "authorFollowers", "postedSeconds", "views", "likes", "replies", "reposts", "repliesOpen", "isReply", "link", "position"}
        self.assertEqual(set(first), keys)

    def test_a_short_page_is_scrolled_until_nothing_new_comes(self):
        page = FakePage({self.URL: [("SearchTimeline", search_answer([entry(tweet("1849000000000000001"))]), 200)]})
        found = x.x_search(page, {"kind": "search", "value": "project tools", "max": 20})
        self.assertEqual(len(found["posts"]), 1)
        self.assertGreater(FakeHuman.scrolls, 0)
        self.assertLessEqual(FakeHuman.scrolls, x.STALE_SCROLLS * 4)

    def test_xs_rate_limit_stops_the_read_and_says_so(self):
        page = FakePage({self.URL: [("SearchTimeline", {"errors": [{"code": 88, "message": "Rate limit exceeded"}]}, 429)]})
        found = x.x_search(page, {"kind": "search", "value": "project tools", "max": 20})
        self.assertEqual((found["posts"], found["viewed"], found["limited"]), ([], 0, True))
        self.assertEqual(FakeHuman.scrolls, 0)

    def test_a_watched_account_gives_its_own_newest_posts_only(self):
        url = "https://x.com/levelsio"
        answer = user_tweets_answer(
            [
                entry(tweet("1849000000000000005", retweet=True)),
                entry(tweet("1849000000000000006")),
                module("profile-conversation-1", [tweet("1849000000000000007", reply_to="1849000000000000006", reply_to_user="11")]),
                entry(tweet("1849000000000000008", reply_to="1848", reply_to_user="99")),
            ],
            pinned=entry(tweet("1849000000000000004"), pin=True),
        )
        page = FakePage({url: [("UserTweets", answer, 200)]})
        found = x.x_search(page, {"kind": "account", "value": "@levelsio", "max": 10})
        # The pinned post, the repost and the reply to somebody else are left out; a thread's own piece stays.
        self.assertEqual([post["postId"] for post in found["posts"]], ["1849000000000000006", "1849000000000000007"])
        self.assertEqual(found["viewed"], 5)

    def test_a_hashtag_goes_to_the_latest_tab_and_bad_kinds_are_refused(self):
        url = "https://x.com/search?q=%23buildinpublic&src=hashtag_click&f=live"
        page = FakePage({url: [("SearchTimeline", search_answer([entry(tweet("1849000000000000001"))]), 200)]})
        found = x.x_search(page, {"kind": "hashtag", "value": "#buildinpublic", "max": 1})
        self.assertEqual(len(found["posts"]), 1)
        self.assertEqual(page.went, [url])
        for args in [{"kind": "subreddit", "value": "a", "max": 5}, {"kind": "hashtag", "value": "two words", "max": 5}, {"kind": "search", "value": "", "max": 5}, {"kind": "account", "value": "../admin", "max": 5}]:
            with self.assertRaises(x.CommandError, msg=str(args)):
                x.x_search(FakePage({}), args)

    def test_the_drawn_page_stands_in_when_xs_data_never_came(self):
        cards = [
            {"href": "/kim/status/1849000000000000011", "time": "2026-10-21T09:30:00.000Z", "names": "Kim Lee\n@kim\n\u00b7\n2h", "text": "Any tools for this?",
             "counts": "3 replies, 1 repost, 10 likes, 900 views", "social": "", "link": "", "replying": False},
            {"href": "/sam/status/1849000000000000012", "time": "", "names": "Sam\n@sam", "text": "Pinned one", "counts": "", "social": "Pinned", "link": "", "replying": False},
            {"href": "", "names": "An advert", "text": "Buy"},
        ]
        page = FakePage({self.URL: []}, cards=cards)
        found = x.x_search(page, {"kind": "search", "value": "project tools", "max": 1})
        post = found["posts"][0]
        self.assertEqual((post["postId"], post["authorHandle"], post["authorName"], post["likes"], post["views"], post["replies"]), ("1849000000000000011", "kim", "Kim Lee", 10, 900, 3))
        self.assertEqual(post["postedSeconds"], CREATED_SECONDS)
        self.assertIsNone(post["authorFollowers"])
        self.assertEqual(found["viewed"], 2)

    def test_a_signed_out_search_account_is_refused(self):
        page = FakePage({self.URL: [("SearchTimeline", search_answer([]), 200)]}, handle=None)
        with self.assertRaises(x.CommandError):
            x.x_search(page, {"kind": "search", "value": "project tools", "max": 5})

    def test_mentions_leave_out_the_accounts_own_posts(self):
        url = "https://x.com/search?q=%40sam_k%20-from%3Asam_k&src=typed_query&f=live"
        entries = [entry(tweet("1849000000000000021", handle="kim", user_id="12", text="@sam_k this is great")), entry(tweet("1849000000000000022", handle="sam_k"))]
        found = x.x_mentions(FakePage({url: [("SearchTimeline", search_answer(entries), 200)]}), {"handle": "@sam_k", "max": 10})
        self.assertEqual(found["incoming"], [{"id": "1849000000000000021", "handle": "kim", "name": "Kim", "text": "@sam_k this is great", "likes": 3, "postedSeconds": CREATED_SECONDS}])
        self.assertEqual(found["viewed"], 2)


class PostTest(PatchedTest):
    POST = "1849000000000000001"
    URL = "https://x.com/i/status/1849000000000000001"

    def conversation(self):
        return detail_answer([
            entry(tweet(self.POST, handle="levelsio", user_id="11")),
            module("conversationthread-1", [tweet("1849000000000000002", handle="kim", user_id="12", likes=4, reply_to=self.POST, reply_to_user="11", text="@levelsio Low likes")]),
            module("conversationthread-2", [tweet("1849000000000000003", handle="ann", user_id="13", likes=40, reply_to=self.POST, reply_to_user="11", text="@levelsio Most liked")]),
            module("conversationthread-3", [tweet("1849000000000000004", handle="levelsio", user_id="11", likes=99, reply_to=self.POST, reply_to_user="11", text="2/ thread")]),
            module("conversationthread-4", [tweet("1849000000000000005", handle="bo", user_id="15", reply_to="1849000000000000003", reply_to_user="13")]),
            {"entryId": "cursor-showmorethreads-1", "content": {"itemContent": {"itemType": "TimelineTimelineCursor", "cursorType": "ShowMoreThreads"}}},
        ])

    def test_a_post_with_its_top_replies_most_liked_first_and_the_posters_own_left_out(self):
        page = FakePage({self.URL: [("TweetDetail", self.conversation(), 200)]})
        read = x.x_post(page, {"postId": self.POST})
        self.assertEqual(read["post"]["postId"], self.POST)
        self.assertFalse(read["missing"])
        self.assertEqual(read["replies"], [
            {"id": "1849000000000000003", "handle": "ann", "name": "Ann", "text": "Most liked", "likes": 40},
            {"id": "1849000000000000002", "handle": "kim", "name": "Kim", "text": "Low likes", "likes": 4},
        ])
        self.assertEqual((read["viewed"], read["limited"]), (5, False))

    def test_a_deleted_post_is_missing(self):
        gone = detail_answer([entry({"__typename": "TweetTombstone", "tombstone": {"text": {"text": "This Post was deleted by the Post author."}}}, entry_id="tweet-" + self.POST)])
        read = x.x_post(FakePage({self.URL: [("TweetDetail", gone, 200)]}), {"postId": self.POST})
        self.assertEqual((read["post"], read["missing"], read["replies"]), (None, True, []))
        never = {"errors": [{"code": 144, "message": "_Missing: No status found with that ID."}], "data": {}}
        read = x.x_post(FakePage({self.URL: [("TweetDetail", never, 200)]}), {"postId": self.POST})
        self.assertTrue(read["missing"])

    def test_a_check_reads_our_numbers_the_replies_to_us_and_where_we_sit_under_the_post(self):
        ours = "1849000000000000031"
        mine = detail_answer([
            entry(tweet(self.POST, handle="levelsio", user_id="11")),
            entry(tweet(ours, handle="sam_k", user_id="20", likes=7, views="300", reply_to=self.POST, reply_to_user="11", text="@levelsio We built one")),
            module("conversationthread-1", [tweet("1849000000000000032", handle="kim", user_id="12", reply_to=ours, reply_to_user="20", text="@sam_k Link?")]),
            module("conversationthread-2", [tweet("1849000000000000033", handle="sam_k", user_id="20", reply_to=ours, reply_to_user="20", text="more")]),
        ])
        parent = self.conversation()
        parent["data"]["threaded_conversation_with_injections_v2"]["instructions"][0]["entries"].insert(1, entry(tweet(ours, handle="sam_k", user_id="20", reply_to=self.POST, reply_to_user="11")))
        loads = {"https://x.com/i/status/" + ours: [("TweetDetail", mine, 200)], self.URL: [("TweetDetail", parent, 200)]}
        read = x.x_check(FakePage(loads), {"postId": ours, "handle": "sam_k"})
        self.assertEqual((read["found"], read["visible"], read["views"], read["likes"]), (True, True, 300, 7))
        self.assertEqual([item["id"] for item in read["incoming"]], ["1849000000000000032"])
        self.assertEqual(read["incoming"][0]["text"], "Link?")
        self.assertIsNone(read["pollVotes"])
        # Our reply, the post above it and the replies under both, each counted once.
        self.assertEqual(read["viewed"], 8)

        # Not among the replies shown, and no "Show probable spam" to press: missing, so not visible.
        loads[self.URL] = [("TweetDetail", self.conversation(), 200)]
        read = x.x_check(FakePage(loads), {"postId": ours, "handle": "sam_k"})
        self.assertFalse(read["visible"])

    def test_a_check_on_a_gone_post_finds_nothing(self):
        never = {"errors": [{"code": 144, "message": "_Missing: No status found with that ID."}], "data": {}}
        read = x.x_check(FakePage({self.URL: [("TweetDetail", never, 200)]}), {"postId": self.POST, "handle": "sam_k"})
        self.assertEqual((read["found"], read["visible"], read["incoming"]), (False, False, []))

    def test_an_earlier_reply_is_found_by_its_account_and_words(self):
        items = x._posts_in([{"data": self.conversation()}])
        self.assertEqual(x._mine_in(items, "ann", "Most liked.", parent_id=self.POST), "1849000000000000003")
        self.assertIsNone(x._mine_in(items, "ann", "Something else", parent_id=self.POST))
        self.assertIsNone(x._mine_in(items, "ann", "Most liked", parent_id="1849000000000000099"))
        quoting = [{"tweet": tweet("1849000000000000041", handle="sam_k", quoted=self.POST, text="Worth reading")}]
        self.assertEqual(x._mine_in(quoting, "sam_k", "Worth reading", quoted_id=self.POST), "1849000000000000041")
        self.assertIsNone(x._mine_in(quoting, "sam_k", "Worth reading"))


class LookupTest(PatchedTest):
    def test_accounts_that_exist_do_not_and_were_suspended(self):
        found = {"data": {"user": {"result": {"__typename": "User", "rest_id": "11", "core": {"screen_name": "levelsio", "name": "Pieter", "created_at": CREATED}, "legacy": {"followers_count": 600000}}}}}
        loads = {
            "https://x.com/levelsio": [("UserByScreenName", found, 200), ("UserTweets", user_tweets_answer([entry(tweet("1849000000000000001"))]), 200)],
            "https://x.com/nobody_here": [("UserByScreenName", {"data": {}}, 200)],
            "https://x.com/banned": [("UserByScreenName", {"data": {"user": {"result": {"__typename": "UserUnavailable", "reason": "Suspended"}}}}, 200)],
        }
        read = x.x_lookup(FakePage(loads), {"handles": ["@levelsio", "nobody_here", "banned", "not a handle"]})
        self.assertEqual(read["accounts"], [
            {"handle": "levelsio", "exists": True, "name": "Pieter", "followers": 600000, "joinedSeconds": CREATED_SECONDS},
            {"handle": "nobody_here", "exists": False, "name": "", "followers": None, "joinedSeconds": None},
            {"handle": "banned", "exists": False, "name": "", "followers": None, "joinedSeconds": None},
            {"handle": "not a handle", "exists": False, "name": "", "followers": None, "joinedSeconds": None},
        ])
        self.assertEqual((read["viewed"], read["limited"]), (1, False))
        with self.assertRaises(x.CommandError):
            x.x_lookup(FakePage({}), {"handles": ["a%d" % index for index in range(x.LOOKUP_LIMIT + 1)]})

    def test_a_drawn_profile_stands_in(self):
        self.assertEqual(x._profile_from_dom({"name": "Pieter\n@levelsio", "followers": "600.1K Followers", "joined": "Joined March 2015", "text": ""}, "levelsio"),
                         {"handle": "levelsio", "exists": True, "name": "Pieter", "followers": 600100, "joinedSeconds": datetime(2015, 3, 1, tzinfo=timezone.utc).timestamp()})
        self.assertFalse(x._profile_from_dom({"text": "This account doesn\u2019t exist\nTry searching for another."}, "gone")["exists"])
        self.assertIsNone(x._profile_from_dom({"text": "Loading"}, "slow"))


class CommunityTest(unittest.TestCase):
    def test_a_communitys_rules_and_members(self):
        answer = {"data": {"data": {"communityResults": {"result": {
            "__typename": "Community", "rest_id": "1500000000000000001", "name": "Build in Public", "description": "Makers sharing progress",
            "member_count": 48210, "role": "NonMember",
            "rules": [{"name": "Be kind", "description": "No insults."}, {"name": "No spam"}],
        }}}}}
        read = x._community_from([answer], "1500000000000000001")
        self.assertEqual(read, {"name": "Build in Public", "description": "Makers sharing progress", "rules": "1. Be kind: No insults.\n2. No spam", "members": 48210, "role": "NonMember"})
        self.assertIsNone(x._community_from([answer], "1500000000000000002"))
        drawn = x._community_from_dom({"title": "Build in Public / X", "heading": "", "text": "Build in Public\n48.2K Members\nRules\n1. Be kind"})
        self.assertEqual((drawn["name"], drawn["members"], drawn["rules"]), ("Build in Public", 48200, "1. Be kind"))


class MessagesTest(unittest.TestCase):
    def test_messages_from_others_newest_first_and_never_a_group(self):
        inbox = {"name": "dm/inbox_initial_state", "data": {"inbox_initial_state": {
            "entries": [
                {"message": {"id": "m1", "conversation_id": "20-30", "message_data": {"id": "m1", "time": "1792000000000", "sender_id": "30", "text": "Hi &amp; hello https://t.co/q", "entities": {"urls": [{"url": "https://t.co/q", "expanded_url": "https://example.com"}]}}}},
                {"message": {"id": "m2", "conversation_id": "20-30", "message_data": {"id": "m2", "time": "1792000500000", "sender_id": "20", "text": "Our answer"}}},
                {"message": {"id": "m3", "conversation_id": "20-40", "message_data": {"id": "m3", "time": "1792000900000", "sender_id": "40", "text": "Newer"}}},
                {"message": {"id": "m4", "conversation_id": "777", "message_data": {"id": "m4", "time": "1792001000000", "sender_id": "50", "text": "Group"}}},
            ],
            "users": {"30": {"screen_name": "kim", "name": "Kim"}, "40": {"screen_name": "ann", "name": "Ann"}},
            "conversations": {"777": {"type": "GROUP_DM"}, "20-30": {"type": "ONE_TO_ONE"}},
        }}}
        read = x._messages_from_data([inbox], "20")
        self.assertEqual([item["id"] for item in read], ["m3", "m1"])
        self.assertEqual(read[1], {"id": "m1", "conversationId": "20-30", "handle": "kim", "name": "Kim", "text": "Hi & hello https://example.com", "sentSeconds": 1792000000.0})
        self.assertEqual([item[0] for item in x._own_messages([inbox], "20", "20-30")], ["m2"])

    def test_only_the_open_conversations_own_messages_are_ours(self):
        inbox = {"name": "dm/inbox_initial_state", "data": {"inbox_initial_state": {"entries": [
            {"message": {"id": "m1", "conversation_id": "20-30", "message_data": {"id": "m1", "time": "1792000000000", "sender_id": "20", "text": "To Kim"}}},
            {"message": {"id": "m2", "conversation_id": "20-40", "message_data": {"id": "m2", "time": "1792000500000", "sender_id": "20", "text": "To Ann"}}},
        ]}}}
        self.assertEqual([item[0] for item in x._own_messages([inbox], "20", "20-40")], ["m2"])
        # With no conversation known, no message is anybody's.
        self.assertEqual(x._own_messages([inbox], "20", ""), [])

    def test_which_conversation_is_open(self):
        self.assertEqual(x._conversation_in("https://x.com/messages/20-30"), "20-30")
        self.assertEqual(x._conversation_in("https://x.com/messages/20-30?x=1"), "20-30")
        self.assertEqual(x._conversation_in("https://x.com/i/api/1.1/dm/conversation/20-40.json?count=50"), "20-40")
        self.assertEqual(x._conversation_in("https://x.com/messages/compose"), "")
        loaded = [{"name": "dm/conversation", "url": "https://x.com/i/api/1.1/dm/conversation/20-40.json", "data": {}}]
        self.assertEqual(x._open_conversation("https://x.com/messages/compose", loaded), "20-40")
        self.assertEqual(x._open_conversation("https://x.com/messages/20-30", loaded), "20-30")
        self.assertEqual(x._open_conversation("https://x.com/messages/compose", []), "")


class SameWordsTest(unittest.TestCase):
    """An earlier try is ours only when all its words are ours, and, for a post of our own or a message, only from the look-back stretch."""

    def test_a_short_answer_is_not_found_inside_a_longer_post(self):
        self.assertFalse(x._same_words("Yes", "Yes, the free plan covers that."))
        self.assertFalse(x._same_words("Yes, the free plan covers that and more.", "Yes, the free plan covers that."))
        self.assertTrue(x._same_words("Yes, the free plan covers that", "Yes, the free plan covers that."))

    def test_two_posts_from_one_template_differ_by_their_link(self):
        self.assertFalse(x._same_words("Our guide for this: https://promo.test/notion", "Our guide for this: https://promo.test/airtable"))
        self.assertTrue(x._same_words("Our guide for this: https://promo.test/notion", "Our guide for this: https://promo.test/notion/"))
        # A drawn post shows the link without https:// and cut short.
        self.assertTrue(x._same_words("Read this https://example.com/a-long-guide first", "Read this example.com/a-long-gu… first"))

    def test_only_xs_own_cut_off_of_a_long_post_may_end_it_early(self):
        long = "We had the same trouble with onboarding emails, and the fix was to ask one clear question in the first one. " * 3
        self.assertTrue(x._same_words(long, long[:120] + "…"))
        self.assertFalse(x._same_words(long, long[:120]))
        self.assertFalse(x._same_words("Yes, the free plan covers that.", "Yes…"))

    def test_a_drawn_message_is_found_among_its_time_and_sent_lines(self):
        self.assertTrue(x._same_words_in("Yes, offline too.", "Yes, offline too.\n2:31 PM\nSent"))
        self.assertFalse(x._same_words_in("Yes", "Yes, offline too.\n2:31 PM"))

    def test_only_a_post_from_the_last_hour_counts_as_an_earlier_try(self):
        items = [{"tweet": tweet("1849000000000000051", handle="sam_k", reply_to="1849000000000000001", text="Thanks, that fixed it.")}]
        self.assertIsNone(x._mine_in(items, "sam_k", "Thanks, that fixed it.", parent_id="1849000000000000001", since=CREATED_SECONDS + 3600))
        self.assertEqual(x._mine_in(items, "sam_k", "Thanks, that fixed it.", parent_id="1849000000000000001", since=CREATED_SECONDS - 60), "1849000000000000051")

    def test_only_a_message_from_the_last_hour_counts_as_sent(self):
        now = time.time() * 1000
        self.assertTrue(x._said_lately([("m1", "Yes, offline too.", now - 60_000)], "Yes, offline too."))
        self.assertFalse(x._said_lately([("m1", "Yes, offline too.", now - 2 * 3600_000)], "Yes, offline too."))
        self.assertFalse(x._said_lately([("m1", "Yes, offline too.", now - 60_000)], "Yes"))
        self.assertFalse(x._said_lately([], "Yes"))


class LookBeforeWritingTest(PatchedTest):
    """A write looks for an earlier try first, and types nothing when there was nothing to look in."""

    POST = "1849000000000000001"
    URL = "https://x.com/i/status/1849000000000000001"

    def test_a_reply_is_refused_when_neither_xs_data_nor_a_drawn_post_came(self):
        with self.assertRaises(x.CommandError) as caught:
            x._write_under(FakePage({self.URL: []}), "sam_k", self.POST, "Thanks, that fixed it.", "reply")
        self.assertEqual(str(caught.exception), "reply: " + x.NO_EARLIER_LOOK)

    def test_a_drawn_reply_of_ours_from_the_last_hour_counts_when_the_data_never_came(self):
        cards = [
            {"href": "/levelsio/status/%s" % self.POST, "time": JUST_NOW_ISO, "names": "Pieter\n@levelsio", "text": "Shipping a new thing today"},
            {"href": "/sam_k/status/1849000000000000061", "time": JUST_NOW_ISO, "names": "Sam\n@sam_k", "text": "Thanks, that fixed it."},
        ]
        self.assertEqual(x._write_under(FakePage({self.URL: []}, cards=cards), "sam_k", self.POST, "Thanks, that fixed it.", "reply"), "1849000000000000061")

    def test_a_reply_of_ours_in_xs_data_from_the_last_hour_is_returned_without_typing(self):
        answer = detail_answer([
            entry(tweet(self.POST)),
            entry(tweet("1849000000000000062", handle="sam_k", user_id="20", reply_to=self.POST, reply_to_user="11", text="@levelsio Thanks, that fixed it.", created=JUST_NOW)),
        ])
        self.assertEqual(x._write_under(FakePage({self.URL: [("TweetDetail", answer, 200)]}), "sam_k", self.POST, "Thanks, that fixed it.", "reply"), "1849000000000000062")

    def test_a_post_and_a_quote_are_refused_when_the_accounts_page_never_loaded(self):
        for routine, args in ((x.x_publish, {"text": "Night mode is out."}), (x.x_quote, {"postId": self.POST, "text": "Worth reading."})):
            with self.assertRaises(x.CommandError) as caught:
                routine(FakePage({}), args)
            self.assertIn("could not look for an earlier try. Nothing was typed.", str(caught.exception))

    def test_a_message_is_refused_when_neither_xs_data_nor_a_drawn_conversation_came(self):
        class Opened:
            answers = []

            def __exit__(self, *_):
                return None

        class Drawn:
            def all_inner_texts(self):
                return []

        class Page:
            url = "https://x.com/messages/20-30"

            def locator(self, _selector):
                return Drawn()

        with mock.patch.object(x, "_conversation_with", return_value=Opened()), mock.patch.object(x, "_own_id", return_value="20"):
            with self.assertRaises(x.CommandError) as caught:
                x.x_message(Page(), {"handle": "lee", "text": "Yes, there is."})
        self.assertIn("could not look for an earlier answer. Nothing was typed.", str(caught.exception))

    def message(self, answers, address="https://x.com/messages/20-30"):
        """x_message on a conversation that opened with these answers and nothing drawn."""
        class Opened:
            def __init__(self):
                self.answers = answers

            def drain(self):
                return []

            def __exit__(self, *_):
                return None

        class Drawn:
            def all_inner_texts(self):
                return []

        class Page:
            url = address

            def locator(self, _selector):
                return Drawn()

        with mock.patch.object(x, "_conversation_with", return_value=Opened()), mock.patch.object(x, "_own_id", return_value="20"):
            return x.x_message(Page(), {"handle": "kim", "text": "Yes, offline too."})

    def test_a_badge_poll_is_not_a_look_at_the_conversation(self):
        badge = {"name": "dm/user_updates", "url": "https://x.com/i/api/1.1/dm/user_updates.json", "data": {"user_events": {"cursor": "1"}}}
        with self.assertRaises(x.CommandError) as caught:
            self.message([badge])
        self.assertEqual(str(caught.exception), "message: X's messages did not load, so Promo could not look for an earlier answer. Nothing was typed.")

    def test_the_same_words_in_another_conversation_are_not_an_earlier_answer(self):
        now = str(int(time.time() * 1000) - 60_000)
        inbox = {"name": "dm/inbox_initial_state", "url": "", "data": {"inbox_initial_state": {"entries": [
            {"message": {"id": "m1", "conversation_id": "20-30", "message_data": {"id": "m1", "time": now, "sender_id": "30", "text": "Does it work offline?"}}},
            {"message": {"id": "m2", "conversation_id": "20-40", "message_data": {"id": "m2", "time": now, "sender_id": "20", "text": "Yes, offline too."}}},
        ]}}}
        # Not taken as sent: it goes on to look for the message box (none here).
        with self.assertRaises(x.CommandError) as caught:
            self.message([inbox])
        self.assertIn("there is no message box", str(caught.exception))
        # The same words in this conversation are.
        self.assertEqual(self.message([inbox], address="https://x.com/messages/20-40"), {"done": True})

    def test_the_accounts_own_page_answers_even_when_it_has_no_posts(self):
        url = "https://x.com/sam_k"
        self.assertEqual(x._own_page_look(FakePage({url: [("UserTweets", user_tweets_answer([]), 200)]}), "sam_k", "Hello"), (None, True))
        fresh = user_tweets_answer([entry(tweet("1849000000000000071", handle="sam_k", text="Hello", created=JUST_NOW))])
        self.assertEqual(x._own_page_look(FakePage({url: [("UserTweets", fresh, 200)]}), "sam_k", "Hello"), ("1849000000000000071", True))
        old = user_tweets_answer([entry(tweet("1849000000000000072", handle="sam_k", text="Hello"))])
        self.assertEqual(x._own_page_look(FakePage({url: [("UserTweets", old, 200)]}), "sam_k", "Hello", since=time.time() - 3600), (None, True))
        self.assertEqual(x._own_page_look(FakePage({url: []}), "sam_k", "Hello"), (None, False))


# A post's time from long before any look-back hour.
LONG_AGO = "Wed Oct 01 09:30:00 +0000 2025"
LONG_AGO_SECONDS = datetime(2025, 10, 1, 9, 30, tzinfo=timezone.utc).timestamp()


class FakeKeyboard(object):
    def __init__(self, record):
        self.record = record

    def press(self, key):
        self.record.append(("key", key))


class FakeBox(object):
    """A composer that keeps what was typed, and reads back `shown` when set (X's suggestion having swapped a word)."""

    def __init__(self, record, shown=None):
        self.record = record
        self.shown = shown

    def input_value(self, timeout=None):
        raise RuntimeError("Not an input element")

    def inner_text(self, timeout=None):
        if self.shown is not None:
            return self.shown
        return "".join(text for kind, text in self.record if kind == "typed")


class FakeButton(object):
    def __init__(self, name):
        self.name = name

    def get_attribute(self, _name):
        return None


class TypingHuman(FakeHuman):
    """Types into a FakeBox and records each press, so the order of keys can be checked."""

    def __init__(self, record):
        self.record = record

    def click(self, locator, timeout=None):
        if isinstance(locator, FakeButton):
            self.record.append(("pressed", locator.name))

    def type_text(self, field, text):
        self.record.append(("typed", text))
        return [0.1] * max(len(text) - 1, 0)

    def pause_before_submit(self, page):
        pass

    def read_page(self, page, length, sizes=None):
        pass


class Listbox(object):
    def __init__(self, showing):
        self.showing = showing

    def count(self):
        return 1 if self.showing else 0

    def nth(self, _index):
        return self

    def is_visible(self):
        return self.showing


class VisitsPage(FakePage):
    """A page whose answers change from one visit to the next, the last repeated; a visit given as an error raises."""

    def __init__(self, visits, record=None, listbox=False, **kwargs):
        FakePage.__init__(self, {}, **kwargs)
        self.visits = visits
        self.count = {}
        self.record = record if record is not None else []
        self.keyboard = FakeKeyboard(self.record)
        self.listbox = listbox

    def goto(self, url, wait_until=None, timeout=None):
        plays = self.visits.get(url, [[]])
        index = self.count.get(url, 0)
        self.count[url] = index + 1
        play = plays[min(index, len(plays) - 1)]
        if isinstance(play, Exception):
            raise play
        self.loads = {url: play}
        FakePage.goto(self, url, wait_until, timeout)

    def locator(self, selector):
        if selector == x.SUGGESTIONS:
            return Listbox(self.listbox)
        return FakeLocator()


class WritingBase(PatchedTest):
    """A signed-in browser whose composer and send button are fakes that record every key and press."""

    POST = "1849000000000000001"
    URL = "https://x.com/i/status/1849000000000000001"

    def setUp(self):
        PatchedTest.setUp(self)
        self.record = []
        x.human = TypingHuman(self.record)
        self.box = FakeBox(self.record)

        def visible(scope, selectors, timeout_ms):
            joined = " ".join(selectors)
            if "tweetTextarea" in joined or "dmComposerTextInput" in joined:
                return self.box
            if "tweetButton" in joined:
                return FakeButton("send")
            return None

        x._first_visible = visible

    def parent(self, *more):
        return [("TweetDetail", detail_answer([entry(tweet(self.POST))] + list(more)), 200)]


class WritingTest(WritingBase):
    """What a write does around the press: the look before, the words read back, and the warning after."""

    def test_an_old_reply_of_ours_under_the_post_is_an_earlier_try_however_long_ago(self):
        old = entry(tweet("1849000000000000081", handle="sam_k", user_id="20", reply_to=self.POST, reply_to_user="11", text="Thanks, that fixed it.", created=LONG_AGO))
        page = VisitsPage({self.URL: [self.parent(old)]}, self.record)
        self.assertEqual(x._write_under(page, "sam_k", self.POST, "Thanks, that fixed it.", "reply"), "1849000000000000081")
        self.assertEqual(self.record, [])

    def test_an_old_quote_of_the_post_is_an_earlier_try_however_long_ago(self):
        quote = user_tweets_answer([entry(tweet("1849000000000000082", handle="searcher", quoted=self.POST, text="Worth reading.", created=LONG_AGO))])
        page = VisitsPage({"https://x.com/searcher": [[("UserTweets", quote, 200)]]}, self.record)
        self.assertEqual(x.x_quote(page, {"postId": self.POST, "text": "Worth reading."})["postId"], "1849000000000000082")

    def test_a_post_of_our_own_looks_back_from_the_apps_since_or_an_hour(self):
        old = user_tweets_answer([entry(tweet("1849000000000000083", handle="searcher", text="Night mode is out.", created=LONG_AGO))])
        visits = {"https://x.com/searcher": [[("UserTweets", old, 200)]]}
        found = x.x_publish(VisitsPage(visits, self.record), {"text": "Night mode is out.", "since": LONG_AGO_SECONDS - 60})
        self.assertEqual(found["postId"], "1849000000000000083")
        # Without `since`, a post from last year is another post: it goes on to X's composer (none here).
        with self.assertRaises(x.CommandError) as caught:
            x.x_publish(VisitsPage(visits, self.record), {"text": "Night mode is out."})
        self.assertIn("no Post button", str(caught.exception))
        with self.assertRaises(x.CommandError) as caught:
            x.x_publish(VisitsPage(visits, self.record), {"text": "Night mode is out.", "since": "yesterday"})
        self.assertIn("since must be seconds", str(caught.exception))

    def test_a_line_break_after_an_at_name_closes_xs_suggestions_first(self):
        page = VisitsPage({}, self.record, listbox=True)
        x._type_into(page, self.box, "Ask @sam\nabout it", "reply")
        self.assertEqual(self.record, [("typed", "Ask @sam"), ("key", "Escape"), ("typed", "\n"), ("typed", "about it")])
        # With no list showing, Escape is never pressed: it would close a pop-up composer.
        del self.record[:]
        x._type_into(VisitsPage({}, self.record), self.box, "One\ntwo", "reply")
        self.assertNotIn(("key", "Escape"), self.record)

    def test_the_box_must_hold_the_words_written_before_the_press(self):
        self.assertTrue(x._box_matches("I\u2019ve used it\nfor years", "I've used it for years\u200b"))
        # `_same_words` would pass this one, since it leaves out the @names at the start.
        self.assertFalse(x._box_matches("@sam\nthanks", "@samantha_k\nthanks"))
        self.box.shown = "@samantha_k\nthanks"
        with self.assertRaises(x.CommandError) as caught:
            x._write_under(VisitsPage({self.URL: [self.parent()]}, self.record), "sam_k", self.POST, "@sam\nthanks", "reply")
        self.assertEqual(str(caught.exception), "reply: the words in the box did not match what was written. Nothing was posted.")
        self.assertNotIn(("pressed", "send"), self.record)

    def test_a_failure_after_the_press_says_it_may_already_be_on_x(self):
        page = VisitsPage({self.URL: [self.parent(), RuntimeError("Timeout 45000ms exceeded")]}, self.record)
        with mock.patch.object(x, "_created", return_value=None), self.assertRaises(x.CommandError) as caught:
            x._write_under(page, "sam_k", self.POST, "Thanks, that fixed it.", "reply")
        self.assertIn(("pressed", "send"), self.record)
        self.assertEqual(str(caught.exception), "reply: Timeout 45000ms exceeded. It may already be on X; look before sending again.")
        # X's own refusal means nothing went up, so it says only that.
        del self.record[:]
        refused = x._Refused("reply: X refused it: Status is a duplicate. (187)")
        with mock.patch.object(x, "_created", side_effect=refused), self.assertRaises(x.CommandError) as caught:
            x._write_under(VisitsPage({self.URL: [self.parent()]}, self.record), "sam_k", self.POST, "Thanks, that fixed it.", "reply")
        self.assertEqual(str(caught.exception), "reply: X refused it: Status is a duplicate. (187)")


class EditTest(WritingBase):
    """An edit gives a post a new id, and the routine follows it there."""

    OLD = "1849000000000000091"
    NEW = "1849000000000000092"

    def version(self, post_id, text, ids):
        result = tweet(post_id, handle="searcher", text=text, created=JUST_NOW)
        result["edit_control"] = {"edit_tweet_ids": ids} if ids[0] == post_id else {"initial_tweet_id": ids[0], "edit_control_initial": {"edit_tweet_ids": ids}}
        return result

    def page(self, *old_visits, new=None):
        visits = {"https://x.com/i/status/" + self.OLD: [[("TweetDetail", detail_answer([entry(item)]), 200)] for item in old_visits]}
        if new is not None:
            visits["https://x.com/i/status/" + self.NEW] = [[("TweetDetail", detail_answer([entry(new)]), 200)]]
        return VisitsPage(visits, self.record)

    def test_the_newest_version_of_a_post(self):
        self.assertEqual(x._newest_id(self.version(self.OLD, "a", [self.OLD, self.NEW])), self.NEW)
        self.assertEqual(x._newest_id(self.version(self.NEW, "b", [self.OLD, self.NEW])), self.NEW)
        self.assertEqual(x._newest_id(tweet(self.OLD)), self.OLD)

    def test_a_missed_answer_to_update_is_judged_on_the_newest_version(self):
        before = self.version(self.OLD, "Old words.", [self.OLD])
        after = self.version(self.OLD, "Old words.", [self.OLD, self.NEW])
        newest = self.version(self.NEW, "New words.", [self.OLD, self.NEW])
        page = self.page(before, after, new=newest)
        with mock.patch.object(x, "_post_menu", return_value=True), mock.patch.object(x, "_created", return_value=None):
            self.assertEqual(x.x_edit(page, {"postId": self.OLD, "text": "New words."}), {"done": True, "postId": self.NEW})
        self.assertIn(("pressed", "send"), self.record)

    def test_a_second_try_finds_the_words_on_the_newest_version_and_presses_nothing(self):
        page = self.page(self.version(self.OLD, "Old words.", [self.OLD, self.NEW]), new=self.version(self.NEW, "New words.", [self.OLD, self.NEW]))
        self.assertEqual(x.x_edit(page, {"postId": self.OLD, "text": "New words."}), {"done": True, "postId": self.NEW})
        self.assertEqual(self.record, [])

    def test_xs_answer_to_update_gives_the_new_id(self):
        page = self.page(self.version(self.OLD, "Old words.", [self.OLD]))
        with mock.patch.object(x, "_post_menu", return_value=True), mock.patch.object(x, "_created", return_value=self.NEW):
            self.assertEqual(x.x_edit(page, {"postId": self.OLD, "text": "New words."}), {"done": True, "postId": self.NEW})


class ScrollingPage(FakePage):
    """A post's page that sends one more reply under the post with every scroll, as a long thread does."""

    def __init__(self, loads, parent_url, parent_id, **kwargs):
        FakePage.__init__(self, loads, **kwargs)
        self.parent_url, self.parent_id, self.sent = parent_url, parent_id, 0

    def scrolled(self):
        if self.url != self.parent_url:
            return
        self.sent += 1
        reply = tweet("18490000000001%05d" % self.sent, handle="kim", user_id="12", reply_to=self.parent_id, reply_to_user="11")
        for handler in list(self.listeners):
            handler(FakeResponse(GRAPHQL % "TweetDetail", detail_answer([entry(reply)]), 200))


class ScrollingHuman(FakeHuman):
    def scroll_once(self, page, direction=1, limit=None):
        FakeHuman.scroll_once(self, page)
        page.scrolled()
        return 300


class UnderThePostTest(PatchedTest):
    """Running out of scrolls while replies still come is no reading."""

    POST = "1849000000000000001"
    OURS = "1849000000000000031"

    def setUp(self):
        PatchedTest.setUp(self)
        x.human = ScrollingHuman()

    def page(self, loads=None):
        parent_url = "https://x.com/i/status/" + self.POST
        mine = detail_answer([entry(tweet(self.POST)), entry(tweet(self.OURS, handle="sam_k", user_id="20", reply_to=self.POST, reply_to_user="11", text="We built one for exactly this"))])
        base = {"https://x.com/i/status/" + self.OURS: [("TweetDetail", mine, 200)], parent_url: [("TweetDetail", detail_answer([entry(tweet(self.POST))]), 200)]}
        base.update(loads or {})
        return ScrollingPage(base, parent_url, self.POST)

    def test_replies_still_coming_when_the_scrolls_run_out_is_unknown(self):
        where, limited = x._where_under(self.page(), self.POST, self.OURS, time.monotonic() + 60, set(), "check")
        self.assertEqual((where, limited), ("unknown", False))
        # And a check says it cannot tell, rather than not visible.
        self.assertIsNone(x.x_check(self.page(), {"postId": self.OURS, "handle": "sam_k"})["visible"])

    def test_a_reach_that_could_not_tell_writes_nothing(self):
        search = "https://x.com/search?q=%22We%20built%20one%20for%20exactly%20this%22%20from%3Asam_k&src=typed_query&f=live"
        loads = {search: [("SearchTimeline", search_answer([entry(tweet(self.OURS, handle="sam_k", user_id="20", reply_to=self.POST, reply_to_user="11"))]), 200)]}
        with self.assertRaises(x.CommandError) as caught:
            x.x_reach(self.page(loads), {"handle": "sam_k", "postId": self.OURS, "parentId": self.POST, "text": "We built one for exactly this"})
        self.assertIn("no reading was taken", str(caught.exception))


class DrawnCheckTest(PatchedTest):
    def test_a_check_with_only_the_drawn_page_guesses_nothing(self):
        ours = "1849000000000000031"
        cards = [
            {"href": "/levelsio/status/1849000000000000001", "time": "", "names": "Pieter\n@levelsio", "text": "Shipping", "counts": "9 replies, 50 likes"},
            {"href": "/sam_k/status/%s" % ours, "time": "", "names": "Sam\n@sam_k", "text": "We built one", "counts": "2 likes, 40 views"},
            {"href": "/kim/status/1849000000000000032", "time": "", "names": "Kim\n@kim", "text": "Link?", "counts": ""},
        ]
        read = x.x_check(FakePage({}, cards=cards), {"postId": ours, "handle": "sam_k"})
        self.assertEqual((read["found"], read["visible"]), (True, None))
        self.assertEqual((read["views"], read["likes"], read["replies"], read["reposts"]), (40, 2, None, None))
        # The post drawn above ours is the one it answers, not a reply to it.
        self.assertEqual([item["id"] for item in read["incoming"]], ["1849000000000000032"])


class BanWordsTest(unittest.TestCase):
    """A ban screen is X's own short line, never somebody's words about one."""

    def raw(self, text, path="/home"):
        return {"host": "x.com", "path": path, "text": text, "profileHref": "/sam_k", "login": False, "codeField": False, "arkose": False, "initial": {}}

    def test_somebody_talking_about_a_ban_is_not_one(self):
        self.assertIsNone(x._judge(self.raw("Home\nSomeone said your account is suspended if you post links, is that true?"))["banScreen"])
        self.assertIsNone(x._judge(self.raw("Home\nYour account is suspended for a week if you post links more than twice a day, so read the rules before you start"))["banScreen"])
        self.assertTrue(x._judge(self.raw("Your account is suspended."))["banScreen"])
        self.assertTrue(x._judge(self.raw("Your account is suspended and is not able to post"))["banScreen"])

    def test_names_profile_headers_empty_pages_and_a_communitys_about_are_left_out(self):
        for shape in ('[data-testid="emptyState"]', '[data-testid="UserName"]', '[data-testid="UserProfileHeader_Items"]', '[data-testid="sidebarColumn"]'):
            self.assertIn(shape, x.SIGNS_SCRIPT)
        self.assertIn("/i/communities/", x.SIGNS_SCRIPT)


class FailedAnswersTest(PatchedTest):
    def test_a_rate_limited_or_failed_lookup_is_left_out_not_written_down_as_missing(self):
        found = {"data": {"user": {"result": {"__typename": "User", "rest_id": "11", "core": {"screen_name": "levelsio", "name": "Pieter", "created_at": CREATED}, "legacy": {"followers_count": 600000}}}}}
        loads = {
            "https://x.com/levelsio": [("UserByScreenName", found, 200)],
            "https://x.com/busy": [("UserByScreenName", {"errors": [{"code": 88, "message": "Rate limit exceeded"}]}, 429)],
            "https://x.com/broken": [("UserByScreenName", {"errors": [{"message": "Internal error"}], "data": {}}, 200)],
        }
        read = x.x_lookup(FakePage(loads), {"handles": ["broken", "levelsio", "busy"]})
        self.assertEqual([account["handle"] for account in read["accounts"]], ["levelsio"])
        self.assertTrue(read["limited"])
        read = x.x_lookup(FakePage(loads), {"handles": ["broken"]})
        self.assertEqual((read["accounts"], read["limited"]), ([], False))

    def test_a_check_that_ran_out_of_time_under_the_post_cannot_tell(self):
        ours = "1849000000000000031"
        post = "1849000000000000001"
        mine = detail_answer([entry(tweet(post)), entry(tweet(ours, handle="sam_k", user_id="20", reply_to=post, reply_to_user="11"))])
        parent = detail_answer([entry(tweet(post))])
        loads = {"https://x.com/i/status/" + ours: [("TweetDetail", mine, 200)], "https://x.com/i/status/" + post: [("TweetDetail", parent, 200)]}
        with mock.patch.object(x, "READ_BUDGET_SECONDS", 0):
            read = x.x_check(FakePage(loads), {"postId": ours, "handle": "sam_k"})
        self.assertIsNone(read["visible"])
        # With time to look, missing under the post is not visible.
        self.assertFalse(x.x_check(FakePage(loads), {"postId": ours, "handle": "sam_k"})["visible"])


class FakePictureAnswer(object):
    def __init__(self, status, kind, body):
        self.status = status
        self.headers = email.message.Message()
        self.headers["Content-Type"] = kind
        self.body = body

    def read(self, size):
        chunk, self.body = self.body[:size], self.body[size:]
        return chunk


class FakePictureConnection(object):
    answer = None
    made = []

    def __init__(self, host, address, port, timeout):
        self.host, self.address, self.pinned = host, address, None
        FakePictureConnection.made.append(self)

    def request(self, method, path, headers=None):
        self.path = path

    def getresponse(self):
        return FakePictureConnection.answer

    def close(self):
        pass


class PictureTest(unittest.TestCase):
    """A post's picture is fetched from a public address only, with no redirect followed, within a minute and 5 MB."""

    def resolves_to(self, *addresses):
        return mock.patch.object(x.socket, "getaddrinfo", lambda host, port, type=0: [(x.socket.AF_INET, x.socket.SOCK_STREAM, 6, "", (address, port)) for address in addresses])

    def fetch(self, answer, address="93.184.216.34"):
        FakePictureConnection.answer = answer
        FakePictureConnection.made = []
        with self.resolves_to(address), mock.patch.object(x, "_PinnedHTTPS", FakePictureConnection):
            return x._picture_file("https://cdn.example/a.png?size=large", "publish")

    def test_an_address_inside_the_network_is_refused(self):
        for address in ("127.0.0.1", "10.0.0.5", "192.168.1.2", "169.254.169.254", "::1", "fe80::1", "100.64.0.1"):
            with self.resolves_to(address), mock.patch.object(x, "_PinnedHTTPS", FakePictureConnection):
                FakePictureConnection.made = []
                with self.assertRaises(x.CommandError, msg=address) as caught:
                    x._picture_file("https://cdn.example/a.png", "publish")
                self.assertIn("not out on the internet", str(caught.exception))
                self.assertEqual(FakePictureConnection.made, [])

    def test_a_redirect_is_never_followed(self):
        with self.assertRaises(x.CommandError) as caught:
            self.fetch(FakePictureAnswer(302, "text/html", b""))
        self.assertIn("does not follow", str(caught.exception))

    def test_a_picture_past_5_mb_or_a_minute_is_refused(self):
        with self.assertRaises(x.CommandError) as caught:
            self.fetch(FakePictureAnswer(200, "image/png", b"x" * (x.PICTURE_MAX_BYTES + 1)))
        self.assertIn("bigger than the 5 MB", str(caught.exception))
        with mock.patch.object(x, "PICTURE_SECONDS", 0), self.assertRaises(x.CommandError) as caught:
            self.fetch(FakePictureAnswer(200, "image/png", b"png"))
        self.assertIn("took longer than", str(caught.exception))

    def test_a_picture_is_fetched_from_the_address_checked(self):
        path = self.fetch(FakePictureAnswer(200, "image/png", b"png bytes"))
        try:
            with open(path, "rb") as saved:
                self.assertEqual(saved.read(), b"png bytes")
            self.assertTrue(path.endswith(".png"))
            made = FakePictureConnection.made[0]
            self.assertEqual((made.host, made.address, made.path), ("cdn.example", "93.184.216.34", "/a.png?size=large"))
        finally:
            os.remove(path)


class LauncherTimesTest(unittest.TestCase):
    def limits(self):
        with open(os.path.join(HERE, "launch.py"), encoding="utf-8") as source:
            tree = ast.parse(source.read())
        return next(ast.literal_eval(node.value) for node in ast.walk(tree) if isinstance(node, ast.Assign) and getattr(node.targets[0], "id", "") == "ROUTINE_TIMEOUT_SECONDS")

    def test_an_edit_and_a_message_get_the_time_to_type_at_a_persons_pace(self):
        limits = self.limits()
        # The app waits 630 seconds for both (TYPED_TIMEOUT_MS in calls.ts), a little longer than the browser.
        self.assertEqual((limits["x.edit"], limits["x.message"]), (600, 600))

    def test_a_check_a_reach_and_a_lookup_get_the_seconds_the_app_waits(self):
        limits = self.limits()
        # PAGE_THEN_READ_TIMEOUT_MS in calls.ts is 120 seconds; 90 does not cover their page loads.
        self.assertEqual((limits["x.check"], limits["x.reach"], limits["x.lookup"]), (120, 120, 120))


class LeftOverTest(unittest.TestCase):
    def test_nothing_is_kept_that_nothing_reads(self):
        raw = {"host": "x.com", "path": "/home", "text": "", "profileHref": "/sam_k", "initial": {"id": "20"}}
        self.assertNotIn("userId", x._judge(raw))
        graph = x._Graph(FakePage({}))
        self.assertFalse(hasattr(graph, "failed") or hasattr(graph, "phase"))
        self.assertNotIn("phase", x._posts_in([{"data": user_tweets_answer([entry(tweet("1849000000000000001"))])}])[0])
        # The account's own page is read for its posts only; nothing asked for its replies.
        self.assertFalse(hasattr(x, "_own_page_items"))
        with open(x.__file__, encoding="utf-8") as source:
            self.assertNotIn("UserTweetsAndReplies", source.read())


class ListsPage(FakePage):
    def __init__(self, loads, lists):
        FakePage.__init__(self, loads)
        self.lists = lists

    def evaluate(self, script, arg=None):
        if "x:lists" in script:
            return self.lists
        return FakePage.evaluate(self, script, arg)


class ListAddTest(PatchedTest):
    """A list is looked for on the account's own lists page before one is made, so a retry never makes two."""

    def setUp(self):
        PatchedTest.setUp(self)
        self.made = []
        self.saved_list = (x._lists_dialog, x._list_row, x._make_list, x._close_dialog)
        x._lists_dialog = lambda page, step: None
        x._list_row = lambda page, name: None
        x._make_list = lambda page, name, step: self.made.append(name)
        x._close_dialog = lambda page: None

    def tearDown(self):
        x._lists_dialog, x._list_row, x._make_list, x._close_dialog = self.saved_list
        PatchedTest.tearDown(self)

    def test_a_list_already_made_is_never_made_again(self):
        with self.assertRaises(x.CommandError) as caught:
            x.x_list_add(ListsPage({}, {"lists": [["Tools we like", "@searcher", "12 members"]], "empty": False}), {"list": "Tools we like", "handle": "kim"})
        self.assertEqual(self.made, [])
        self.assertIn("does not offer it for @kim yet", str(caught.exception))

    def test_a_lists_page_that_never_loaded_makes_nothing(self):
        # The page is given no time to load, since nothing would come.
        with mock.patch.object(x, "SETTLE_MS", 0), self.assertRaises(x.CommandError) as caught:
            x.x_list_add(ListsPage({}, {"lists": [], "empty": False}), {"list": "Tools we like", "handle": "kim"})
        self.assertEqual(self.made, [])
        self.assertIn("No list was made", str(caught.exception))

    def test_an_account_with_no_such_list_makes_it_once(self):
        with self.assertRaises(x.CommandError):
            x.x_list_add(ListsPage({}, {"lists": [], "empty": True}), {"list": "Tools we like", "handle": "kim"})
        self.assertEqual(self.made, ["Tools we like"])

    def test_a_list_in_xs_data_counts_only_when_this_account_owns_it(self):
        def answer(owner):
            return {"name": "ListsManagementPageTimeline", "status": 200, "data": {"data": {"viewer": {"list_management_timeline": {"timeline": {"instructions": [{"type": "TimelineAddEntries", "entries": [
                {"entryId": "list-1", "content": {"itemContent": {"itemType": "TimelineTwitterList", "list": {
                    "id_str": "1500", "name": "Tools we like", "mode": "Public", "user_results": {"result": {"core": {"screen_name": owner}}}}}}},
            ]}]}}}}}}
        self.assertEqual(x._list_named([answer("searcher")], {}, "tools we like", "searcher"), (True, True))
        self.assertEqual(x._list_named([answer("someone")], {}, "Tools we like", "searcher"), (False, True))
        self.assertEqual(x._list_named([], {}, "Tools we like", "searcher"), (False, False))


if __name__ == "__main__":
    unittest.main()
