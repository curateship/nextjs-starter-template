"""Tests for Medium's reads in routines/medium.py. Run from apps/promo:

    python3 -m unittest discover -s docker/browser -p "test_*.py"

No browser is needed. The answers below have the shapes Medium's own data
addresses gave on 21 Oct 2026, measured in a real browser, with the words
cut down to a line. A real browser on the real site is the only proof a
read works; these prove the parsing around it.
"""

import json
import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The person-pace helpers are not needed by the reads.
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import medium  # noqa: E402

GUARD = "])}while(1);</x>"

FEED = """<?xml version="1.0" encoding="UTF-8"?><rss version="2.0"><channel>
<item><title><![CDATA[One]]></title><guid isPermaLink="false">https://medium.com/p/4bad19bc09ae</guid></item>
<item><title><![CDATA[Two]]></title><guid isPermaLink="false">https://medium.com/p/58c894109dd5</guid></item>
<item><title><![CDATA[One again]]></title><guid isPermaLink="false">https://medium.com/p/4bad19bc09ae</guid></item>
</channel></rss>"""


def story_payload(story_id, locked=False, collection=""):
    return {
        "value": {
            "id": story_id,
            "creatorId": "u1",
            "homeCollectionId": collection,
            "title": "Steering by Value",
            "firstPublishedAt": 1792593115680,
            "mediumUrl": "https://medium.com/@__bbak/steering-%s" % story_id,
            "allowResponses": True,
            "isSubscriptionLocked": locked,
            "deletedAt": 0,
            "virtuals": {
                "totalClapCount": 210,
                "responsesCreatedCount": 9,
                "subtitle": "A single feature is easy to govern.",
                "isLockedPreviewOnly": locked,
                "tags": [{"slug": "product-management"}, {"slug": "strategy"}],
            },
            "content": {
                "bodyModel": {
                    "paragraphs": [
                        {"type": 3, "text": "Steering by Value"},
                        {"type": 4, "text": ""},
                        {"type": 1, "text": "A single feature is easy to govern."},
                        {"type": 1, "text": "The candidate the field reaches for."},
                    ]
                }
            },
        },
        "references": {
            "User": {"u1": {"username": "__bbak", "name": "Bruno"}},
            "SocialStats": {"u1": {"usersFollowedByCount": 421}},
            "Collection": {"c1": {"slug": "data-science-collective", "name": "Data Science Collective"}},
        },
    }


RESPONSES = {
    "value": [
        {
            "id": "ba5e67a98c47",
            "creatorId": "w1",
            "firstPublishedAt": 1783175061819,
            "virtuals": {"totalClapCount": 1, "responsesCreatedCount": 1},
            "previewContent": {"bodyModel": {"paragraphs": [{"type": 1, "text": "We obsess over governing single features."}]}},
            "responseHiddenOnParentPostAt": 0,
            "deletedAt": 0,
        },
        {
            "id": "0f47ea6bab3c",
            "creatorId": "w2",
            "firstPublishedAt": 1783175061819,
            "virtuals": {"totalClapCount": 5, "responsesCreatedCount": 0},
            "previewContent": {"bodyModel": {"paragraphs": [{"type": 1, "text": "Hidden by the writer."}]}},
            "responseHiddenOnParentPostAt": 1783175061999,
            "deletedAt": 0,
        },
    ],
    "references": {"User": {"w1": {"username": "hireanywherehub"}, "w2": {"username": "sage"}}},
}

USER = {
    "user": {"userId": "u1", "username": "__bbak", "createdAt": 1420670177158},
    "references": {"SocialStats": {"u1": {"usersFollowedByCount": 421}}},
}

PUBLICATION = {
    "collection": {
        "slug": "data-science-collective",
        "name": "Data Science Collective",
        "description": "Advice, insights, and ideas from the Medium data science community",
        "virtuals": {"permissions": {"canPublish": False, "canSubmit": True}},
        "navItems": [
            {"title": "About", "postId": "c2da52f08a07"},
            {"title": "Submission guidelines", "url": "https://medium.com/data-science-collective/submissions-guidelines-1fa4fa358ec3"},
        ],
    }
}


class FakePage(object):
    """The parts of Playwright's page the reads use, answering from the data above."""

    def __init__(self, answers, viewer=None, url="https://medium.com/"):
        self.answers = answers
        self.viewer = viewer
        self.url = url
        self.went = []

    def goto(self, url, wait_until=None, timeout=None):
        self.went.append(url)
        self.url = url

    def wait_for_timeout(self, ms):
        pass

    def evaluate(self, script, arg=None):
        if "fetch(target" in script:
            path = arg[0]
            body = self.answers.get(path)
            if body is None:
                return {"ok": False, "status": 404, "body": ""}
            text = body if isinstance(body, str) else GUARD + json.dumps({"success": True, "payload": body})
            return {"ok": True, "status": 200, "body": text}
        if "__APOLLO_STATE__" in script:
            if self.viewer is None:
                return {"checked": True, "handle": None, "id": None}
            return {"checked": True, "handle": self.viewer[0], "id": self.viewer[1]}
        if "attention required" in script:
            return {"turnstile": False, "refused": False, "checking": False, "url": self.url, "host": "medium.com"}
        raise AssertionError("unexpected script: %s" % script[:80])


class MediumReadsTest(unittest.TestCase):
    def test_a_tag_search_reads_its_feed_once_per_story_and_keeps_the_order(self):
        page = FakePage({
            "/feed/tag/project-management": FEED,
            "/p/4bad19bc09ae?format=json": story_payload("4bad19bc09ae"),
            "/p/58c894109dd5?format=json": story_payload("58c894109dd5", locked=True, collection="c1"),
        })
        found = medium.medium_search(page, {"kind": "tag", "value": "project-management"})
        self.assertEqual([story["storyId"] for story in found["stories"]], ["4bad19bc09ae", "58c894109dd5"])
        self.assertEqual([story["position"] for story in found["stories"]], [0, 1])
        first, second = found["stories"]
        self.assertEqual(first["writerHandle"], "__bbak")
        self.assertEqual(first["writerFollowers"], 421)
        self.assertEqual(first["claps"], 210)
        self.assertEqual(first["responseCount"], 9)
        self.assertEqual(first["tags"], ["product-management", "strategy"])
        # The title is kept once, as the title, and a picture is left out of the words.
        self.assertEqual(first["text"], "A single feature is easy to govern.\n\nThe candidate the field reaches for.")
        self.assertTrue(second["membersOnly"])
        self.assertEqual(second["publicationName"], "Data Science Collective")

    def test_a_story_whose_data_does_not_answer_is_counted_not_listed(self):
        page = FakePage({"/feed/tag/x": FEED, "/p/4bad19bc09ae?format=json": story_payload("4bad19bc09ae")})
        found = medium.medium_search(page, {"kind": "tag", "value": "x"})
        self.assertEqual(found["unread"], 1)

    def test_a_writer_and_a_publication_are_read_off_their_own_feeds(self):
        page = FakePage({"/feed/@__bbak": FEED, "/feed/better-programming": FEED, "/p/58c894109dd5?format=json": story_payload("58c894109dd5")})
        by_writer = medium.medium_search(page, {"kind": "writer", "value": "@__bbak"})
        by_publication = medium.medium_search(page, {"kind": "publication", "value": "better-programming"})
        self.assertEqual([story["storyId"] for story in by_writer["stories"]], ["58c894109dd5"])
        self.assertEqual([story["storyId"] for story in by_publication["stories"]], ["58c894109dd5"])
        with self.assertRaises(medium.CommandError):
            medium.medium_search(page, {"kind": "tag", "value": "../../admin"})

    def test_a_story_read_keeps_its_top_shown_responses_most_clapped_first(self):
        page = FakePage({"/p/a69bdb2ab96c?format=json": story_payload("a69bdb2ab96c"), "/p/a69bdb2ab96c/responses": RESPONSES})
        story = medium.medium_story(page, {"storyId": "a69bdb2ab96c"})
        self.assertEqual(story["responses"], [{"id": "ba5e67a98c47", "writer": "hireanywherehub", "text": "We obsess over governing single features.", "claps": 1}])
        with self.assertRaises(medium.CommandError):
            medium.medium_story(page, {"storyId": "not-an-id"})

    def test_a_check_says_a_hidden_response_is_gone(self):
        page = FakePage({
            "/p/a69bdb2ab96c/responses": RESPONSES,
            "/p/0f47ea6bab3c?format=json": story_payload("0f47ea6bab3c"),
            "/p/0f47ea6bab3c/responses": {"value": [], "references": {}},
        })
        read = medium.medium_check(page, {"storyId": "a69bdb2ab96c", "responseId": "0f47ea6bab3c"})
        self.assertTrue(read["found"])
        self.assertFalse(read["visible"])
        self.assertEqual(read["claps"], 5)

    def test_the_quick_look_reads_the_signed_in_account_and_its_page(self):
        page = FakePage({"/@sam?format=json": dict(USER, user={"userId": "u1", "username": "sam", "createdAt": 1420670177158})}, viewer=("sam", "u1"))
        state = medium.medium_state_quick(page)
        self.assertEqual(state["handle"], "sam")
        self.assertEqual(state["followers"], 421)
        self.assertAlmostEqual(state["joinedSeconds"], 1420670177.158)
        signed_out = medium.medium_state_quick(FakePage({}))
        self.assertEqual((signed_out["checked"], signed_out["handle"]), (True, None))
        elsewhere = medium.medium_state_quick(FakePage({}, url="https://example.test/"))
        self.assertFalse(elsewhere["checked"])

    def test_a_publication_says_whether_the_account_may_write_there_and_reads_its_guidelines(self):
        page = FakePage({
            "/data-science-collective?format=json": PUBLICATION,
            "/p/1fa4fa358ec3?format=json": story_payload("1fa4fa358ec3"),
        }, viewer=("sam", "u1"))
        read = medium.medium_publication(page, {"slug": "data-science-collective"})
        self.assertTrue(read["writes"])
        self.assertTrue(read["signedIn"])
        self.assertTrue(read["rules"].startswith("A single feature"))

    def test_a_phone_response_is_found_by_the_accounts_name_and_opening_words(self):
        page = FakePage({"/p/a69bdb2ab96c/responses": RESPONSES})
        found = medium.medium_find_response(page, {"storyId": "a69bdb2ab96c", "writer": "@HireAnywhereHub", "text": "We obsess over governing single features and more"})
        self.assertEqual(found, {"responseId": "ba5e67a98c47"})
        missing = medium.medium_find_response(page, {"storyId": "a69bdb2ab96c", "writer": "nobody", "text": "We obsess"})
        self.assertEqual(missing, {"responseId": ""})

    def test_a_sign_in_link_must_be_on_medium(self):
        for link in ["https://evil.test/m/callback", "http://medium.com/m/callback", "https://medium.com.evil.test/m/callback", "https://medium.com@evil.test/m/callback", ""]:
            with self.assertRaises(medium.CommandError, msg=link):
                medium.medium_sign_in(FakePage({}), {"url": link})

    def test_a_link_that_will_not_open_never_names_the_link_in_the_error(self):
        class Broken(FakePage):
            def goto(self, url, wait_until=None, timeout=None):
                raise RuntimeError("Timeout 30000ms exceeded navigating to %s" % url)

        link = "https://medium.com/m/callback/email?token=secret123"
        with self.assertRaises(medium.CommandError) as raised:
            medium.medium_sign_in(Broken({}), {"url": link})
        self.assertNotIn("secret123", str(raised.exception))


class MediumWritesTest(unittest.TestCase):
    """The looks a write takes before and after it, so nothing is ever sent twice."""

    def test_an_earlier_response_is_found_though_medium_made_its_quotes_curly(self):
        curly = {"value": [{"id": "ab12cd34ef56", "creatorId": "me", "previewContent": {"bodyModel": {"paragraphs": [{"type": 1, "text": "I\u2019ve used it for years and it\u2019s fine \u2014 honestly."}]}}}], "references": {}}
        page = FakePage({"/p/a69bdb2ab96c/responses": curly})
        found = medium._landed(page, "a69bdb2ab96c", "me", "I've used it for years and it's fine - honestly.", wait_seconds=0, must_read=True)
        self.assertEqual(found, "ab12cd34ef56")

    def test_responses_that_will_not_load_stop_a_second_try_from_typing(self):
        with self.assertRaises(medium.CommandError):
            medium._landed(FakePage({}), "a69bdb2ab96c", "me", "Hello", wait_seconds=0, must_read=True)
        # After Respond is pressed, not loading yet is only "not there yet".
        self.assertIsNone(medium._landed(FakePage({}), "a69bdb2ab96c", "me", "Hello", wait_seconds=0))

    def test_an_article_published_already_is_found_by_its_title(self):
        page = FakePage({"/feed/@sam": FEED})
        self.assertEqual(medium._published_with_title(page, "sam", "Two"), "58c894109dd5")
        self.assertIsNone(medium._published_with_title(page, "sam", "Three"))
        with self.assertRaises(medium.CommandError):
            medium._published_with_title(FakePage({}), "sam", "Two")

    def test_a_delete_counts_only_when_medium_says_it_went(self):
        self.assertTrue(medium._gone(FakePage({}), "a69bdb2ab96c"))
        kept = story_payload("a69bdb2ab96c")
        self.assertFalse(medium._gone(FakePage({"/p/a69bdb2ab96c?format=json": kept}), "a69bdb2ab96c"))
        deleted = story_payload("a69bdb2ab96c")
        deleted["value"]["deletedAt"] = 1792593115680
        self.assertTrue(medium._gone(FakePage({"/p/a69bdb2ab96c?format=json": deleted}), "a69bdb2ab96c"))


if __name__ == "__main__":
    unittest.main()
