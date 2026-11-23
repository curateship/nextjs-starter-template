"""Reddit's submit step with a picture or a link (part 7 of the 18 Nov 2026 features task).

Only the checks made before any page opens are tested here: what a post may
be, and that a picture is fetched from a public https address only, with no
redirect followed. Run with `python3 -m unittest docker/browser/test_reddit_submit.py`.
"""

import os
import sys
import types
import unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
# The person-pace helpers are not used by these checks.
sys.modules.setdefault("human", types.ModuleType("human"))

from routines import reddit  # noqa: E402


class FakeAnswer:
    def __init__(self, status, kind, body):
        self.status = status
        self.headers = types.SimpleNamespace(get_content_type=lambda: kind)
        self._body = body

    def read(self, size):
        chunk, self._body = self._body[:size], self._body[size:]
        return chunk


class FakeConnection:
    answer = None
    made = []

    def __init__(self, host, address, port, timeout):
        FakeConnection.made.append(address)
        self.pinned = None

    def request(self, method, path, headers=None):
        pass

    def getresponse(self):
        return FakeConnection.answer

    def close(self):
        pass


class SubmitArgsTest(unittest.TestCase):
    """What a post may be is refused before the browser opens anything."""

    def submit(self, **args):
        with self.assertRaises(reddit.CommandError) as caught:
            reddit.reddit_submit(None, {"subreddit": "SaaS", "title": "I built a board", **args})
        return str(caught.exception)

    def test_a_post_is_text_a_picture_or_a_link(self):
        self.assertIn("text, a picture or a link", self.submit(kind="video"))

    def test_a_picture_post_needs_its_picture(self):
        self.assertIn("needs its picture", self.submit(kind="picture"))

    def test_a_link_post_needs_an_https_address(self):
        self.assertIn("starting with https://", self.submit(kind="link", linkUrl="http://example.com"))


class PictureTest(unittest.TestCase):
    """A picture is fetched from a public address only, with no redirect followed."""

    def resolves_to(self, address):
        return mock.patch.object(
            reddit.socket,
            "getaddrinfo",
            lambda host, port, type=0: [(reddit.socket.AF_INET, reddit.socket.SOCK_STREAM, 6, "", (address, port))],
        )

    def test_a_picture_must_be_https(self):
        for url in ["http://cdn.test/a.png", "file:///etc/passwd", "https:///nohost.png", ""]:
            with self.assertRaises(reddit.CommandError, msg=url):
                reddit._picture_file(url, "submit")

    def test_an_address_inside_the_network_is_refused(self):
        for address in ("127.0.0.1", "10.0.0.5", "169.254.169.254", "::1"):
            FakeConnection.made = []
            with self.resolves_to(address), mock.patch.object(reddit, "_PinnedHTTPS", FakeConnection):
                with self.assertRaises(reddit.CommandError) as caught:
                    reddit._picture_file("https://cdn.example/a.png", "submit")
            self.assertIn("not out on the internet", str(caught.exception))
            self.assertEqual(FakeConnection.made, [])

    def test_a_redirect_is_never_followed_and_a_kind_reddit_does_not_take_is_refused(self):
        with self.resolves_to("93.184.216.34"), mock.patch.object(reddit, "_PinnedHTTPS", FakeConnection):
            FakeConnection.answer = FakeAnswer(302, "text/html", b"")
            with self.assertRaises(reddit.CommandError) as caught:
                reddit._picture_file("https://cdn.example/a.png", "submit")
            self.assertIn("does not follow", str(caught.exception))
            FakeConnection.answer = FakeAnswer(200, "image/svg+xml", b"<svg/>")
            with self.assertRaises(reddit.CommandError) as caught:
                reddit._picture_file("https://cdn.example/a.svg", "submit")
            self.assertIn("which Reddit does not take", str(caught.exception))

    def test_a_picture_reddit_takes_is_kept_in_a_file_of_its_own(self):
        with self.resolves_to("93.184.216.34"), mock.patch.object(reddit, "_PinnedHTTPS", FakeConnection):
            FakeConnection.answer = FakeAnswer(200, "image/png", b"png bytes")
            path = reddit._picture_file("https://cdn.example/a.png", "submit")
        try:
            self.assertTrue(path.endswith(".png"))
            with open(path, "rb") as kept:
                self.assertEqual(kept.read(), b"png bytes")
        finally:
            os.unlink(path)


if __name__ == "__main__":
    unittest.main()
