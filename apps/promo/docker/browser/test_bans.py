"""Tests for the ban pages Reddit and Medium show in a browser (Bans task,
part 7). Run from apps/promo:

    python3 -m unittest discover -s docker/browser -p "test_*.py"

No browser is needed. The words are the ones the rack's BAN_SCREENS uses for
the same apps; no real ban has happened yet, so the first real one is the
proof.
"""

import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import medium, reddit  # noqa: E402


class RedditBanPageTest(unittest.TestCase):
    def test_its_own_suspended_page_gives_the_words_with_the_line_after(self):
        page = "Reddit\nYour account has been suspended\nThis account violated Reddit's rules and can no longer post.\nLearn more"
        self.assertEqual(
            reddit.ban_words(page),
            "Your account has been suspended This account violated Reddit's rules and can no longer post.",
        )

    def test_a_post_title_asking_about_a_ban_is_not_one(self):
        self.assertIsNone(reddit.ban_words("Home\nr/help\nYour account has been suspended for no reason?\n12 comments"))

    def test_a_locked_page_with_a_curly_apostrophe_counts(self):
        self.assertTrue(reddit.ban_words("We’ve locked your account."))

    def test_somebody_elses_profile_or_a_post_about_a_ban_is_not_one(self):
        self.assertIsNone(reddit.ban_words("u/someone\nThis account has been suspended"))
        self.assertIsNone(reddit.ban_words("Your account has been suspended? Here's how my appeal went after three weeks of waiting for Reddit to answer me"))
        self.assertIsNone(reddit.ban_words(""))


class MediumBanPageTest(unittest.TestCase):
    def test_its_own_suspended_page_gives_the_words(self):
        self.assertEqual(medium.ban_words("Medium\nYour account has been suspended."), "Your account has been suspended.")

    def test_a_writers_page_under_investigation_is_not_this_accounts_ban(self):
        self.assertIsNone(medium.ban_words("This account is under investigation or was found in violation of the Medium Rules."))


if __name__ == "__main__":
    unittest.main()
