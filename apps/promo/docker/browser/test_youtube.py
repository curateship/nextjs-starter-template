"""Tests for YouTube's readers in routines/youtube.py. Run from apps/promo:

    python3 -m unittest discover -s docker/browser -p "test_*.py"

No browser is needed. The page signs below have the shapes YouTube's pages
give, written from how YouTube puts them together, with the words cut down
to a line. None of them was measured on the live site yet: a real signed-in
channel on the real site is the only proof a routine works; these prove the
reading and the refusals around it.
"""

import os
import sys
import types
import unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The person-pace helpers are not needed by anything tested here.
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import youtube  # noqa: E402


def signs(**overrides):
    raw = {"host": "www.youtube.com", "path": "/", "loggedIn": None, "signInButton": False, "text": "", "ownHandleHref": ""}
    raw.update(overrides)
    return youtube._judge(raw)


class JudgeTests(unittest.TestCase):
    def test_a_page_off_youtube_is_never_read_as_signed_out(self):
        self.assertEqual(signs(host="accounts.google.com", loggedIn=False)["checked"], False)

    def test_signed_out_says_so(self):
        out = signs(loggedIn=False)
        self.assertTrue(out["checked"])
        self.assertIsNone(out["handle"])
        out = signs(loggedIn=None, signInButton=True)
        self.assertTrue(out["checked"])

    def test_signed_in_on_the_channel_page_reads_the_handle(self):
        out = signs(loggedIn=True, path="/@pomoder", ownHandleHref="/@pomoder")
        self.assertEqual(out, {"checked": True, "handle": "pomoder", "blocked": False, "reason": "", "banScreen": None})

    def test_signed_in_without_a_handle_on_screen_writes_nothing_down(self):
        self.assertFalse(signs(loggedIn=True)["checked"])

    def test_a_terminated_channel_stops_it_with_youtubes_own_words(self):
        out = signs(loggedIn=True, text="This channel was terminated\nbecause it broke YouTube's Community Guidelines.")
        self.assertTrue(out["blocked"])
        self.assertEqual(out["banScreen"], "This channel was terminated because it broke YouTube's Community Guidelines.")

    def test_a_strike_and_verify_its_you_stop_it_too(self):
        self.assertTrue(signs(text="Community guidelines strike")["banScreen"])
        self.assertTrue(signs(text="Verify it’s you")["banScreen"])

    def test_somebody_talking_about_a_ban_is_not_a_ban(self):
        long_line = "In this video I explain how this channel was terminated last year and what I learned from rebuilding it from nothing at all"
        self.assertIsNone(youtube._ban_words(long_line))


class ReaderTests(unittest.TestCase):
    def test_counts_as_youtube_writes_them(self):
        self.assertEqual(youtube._number("1,234"), 1234)
        self.assertEqual(youtube._number("1.2K"), 1200)
        self.assertEqual(youtube._number("3M"), 3_000_000)
        self.assertEqual(youtube._number("No"), 0)
        self.assertIsNone(youtube._number("views"))

    def test_subscribers_and_videos_off_the_channel_page(self):
        text = "Pomoder\n@pomoder • 1.2K subscribers • 48 videos"
        self.assertEqual(youtube._count_before(text, "subscribers?"), 1200)
        self.assertEqual(youtube._count_before(text, "videos?"), 48)

    def test_likes_off_the_like_buttons_label(self):
        self.assertEqual(youtube._likes_from_label("like this video along with 1,234 other people"), 1234)
        self.assertIsNone(youtube._likes_from_label("Like"))

    def test_handle_from_the_channels_address(self):
        self.assertEqual(youtube._handle_from_path("/@pomoder/videos"), "pomoder")
        self.assertIsNone(youtube._handle_from_path("/watch"))

    def test_video_ids_from_every_kind_of_link(self):
        self.assertEqual(youtube._video_id("https://www.youtube.com/watch?v=abcdefghijk"), "abcdefghijk")
        self.assertEqual(youtube._video_id("https://youtube.com/shorts/abcdefghijk"), "abcdefghijk")
        self.assertEqual(youtube._video_id("https://youtu.be/abcdefghijk"), "abcdefghijk")
        self.assertIsNone(youtube._video_id("https://www.youtube.com/@pomoder"))

    def test_a_comment_from_the_channel_itself_is_left_out(self):
        self.assertIsNone(youtube._clean_comment("@Pomoder", "Thanks!", "pomoder"))
        self.assertIsNone(youtube._clean_comment("@sam", "   ", "pomoder"))
        self.assertEqual(youtube._clean_comment(" @sam ", "Does it  work offline?", "pomoder"), {"author": "@sam", "text": "Does it work offline?"})


class RefusalTests(unittest.TestCase):
    def test_a_file_off_https_is_never_downloaded(self):
        with self.assertRaises(youtube.CommandError) as caught:
            youtube._media_file("http://media.test/a.mp4", "upload", youtube.VIDEO_TYPES, 10, 10, "video")
        self.assertIn("must start with https://", str(caught.exception))

    def test_a_file_inside_the_network_is_never_downloaded(self):
        with self.assertRaises(youtube.CommandError) as caught:
            youtube._media_file("https://127.0.0.1/a.mp4", "upload", youtube.VIDEO_TYPES, 10, 10, "video")
        self.assertIn("not out on the internet", str(caught.exception))

    def test_an_answer_with_a_link_is_refused_before_anything_opens(self):
        with self.assertRaises(youtube.CommandError) as caught:
            youtube.youtube_reply(None, {"text": "see https://pomoder.app", "author": "@sam", "thread": "Study night"})
        self.assertIn("never carries a link", str(caught.exception))

    def test_youtube_has_no_messages(self):
        with self.assertRaises(youtube.CommandError):
            youtube.youtube_inbox(None, {"kind": "message"})

    def test_an_upload_without_a_title_is_refused_before_anything_downloads(self):
        with self.assertRaises(youtube.CommandError) as caught:
            youtube.youtube_upload(None, {"title": "  ", "mediaUrl": "https://media.test/a.mp4"})
        self.assertIn("no title", str(caught.exception))

    def test_a_signed_out_browser_is_refused_before_the_video_downloads(self):
        class SignInPage:
            url = "https://accounts.google.com/ServiceLogin"

            def goto(self, url, **kwargs):
                pass

            def wait_for_timeout(self, ms):
                pass

        downloads = []
        original = youtube._media_file
        youtube._media_file = lambda *args: downloads.append(args) or "/tmp/none"
        try:
            with self.assertRaises(youtube.CommandError) as caught:
                youtube.youtube_upload(SignInPage(), {"title": "Study night", "mediaUrl": "https://media.test/a.mp4"})
        finally:
            youtube._media_file = original
        self.assertIn("not signed in to YouTube", str(caught.exception))
        self.assertEqual(downloads, [])

    def test_every_routine_the_app_calls_is_registered(self):
        self.assertEqual(sorted(youtube.ROUTINES), ["health", "inbox", "quick_state", "reply", "state", "upload"])


if __name__ == "__main__":
    unittest.main()
