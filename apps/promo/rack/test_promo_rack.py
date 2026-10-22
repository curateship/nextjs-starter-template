import collections
"""Tests for the rack program and its launcher. Run from apps/promo:

    python3 -m unittest discover -s rack -p "test_*.py"

No phone, adb or Promo is needed. A real phone on the rack is the only proof
that an action works on a phone; these prove the parts around it.
"""

import json
import os
import random
import re
import subprocess
import sys
import tempfile
import time
import unittest
import xml.etree.ElementTree as ElementTree
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)

import promo_rack  # noqa: E402


class SigningTest(unittest.TestCase):
    """The same values `src/server/phones/rack.test.ts` would get from signing.ts."""

    def test_request_signature_matches_promo(self):
        self.assertEqual(
            promo_rack.request_signature("test-key", "POST", "/api/rack/next", 1700000000, "ab" * 16, b"{}"),
            "08815eaf42e11953fcb9ec0264d0caf549b9f68095d337d4983e167ef7b36866",
        )

    def test_reply_signature_matches_promo(self):
        self.assertEqual(
            promo_rack.reply_signature("test-key", 200, "ab" * 16, "1700000001", b'{"action":null}'),
            "d758e670a6a6fb1e0fe631476f8a03e58e4a3c13662209d8500511482108f5d9",
        )


class DevicesTest(unittest.TestCase):
    def test_reads_adb_device_list(self):
        output = (
            "List of devices attached\n"
            "35091FDH2000A1         device usb:1-1.2 product:akita model:Pixel_8a device:akita transport_id:3\n"
            "R58N12ABCDE            unauthorized usb:1-1.3 transport_id:4\n"
            "\n"
        )
        self.assertEqual(promo_rack.parse_devices(output), [
            {"serial": "35091FDH2000A1", "state": "device", "usb": "usb:1-1.2", "model": "Pixel 8a", "android": "", "kind": "android"},
            {"serial": "R58N12ABCDE", "state": "unauthorized", "usb": "usb:1-1.3", "model": "", "android": "", "kind": "android"},
        ])

    def test_ignores_the_daemon_starting(self):
        output = "* daemon not running; starting now at tcp:5037\n* daemon started successfully\nList of devices attached\n\n"
        self.assertEqual(promo_rack.parse_devices(output), [])


class SettingsScreenTest(unittest.TestCase):
    def test_pixel_about_phone(self):
        dump = """<hierarchy><node text="" class="android.widget.FrameLayout">
          <node text="" class="android.widget.LinearLayout">
            <node text="Model" /><node text="Pixel 8a" /></node>
          <node text="" class="android.widget.LinearLayout">
            <node text="" class="android.widget.RelativeLayout">
              <node text="Android version" /></node>
            <node text="" class="android.widget.LinearLayout"><node text="16" /></node>
          </node></node></hierarchy>"""
        self.assertEqual(promo_rack.version_beside_label(dump), "16")

    def test_samsung_software_information(self):
        dump = """<hierarchy><node text=""><node text="">
            <node text="One UI version" /><node text="7.0" /></node>
          <node text=""><node text="Android version" /><node text="15" /></node></node></hierarchy>"""
        self.assertEqual(promo_rack.version_beside_label(dump), "15")

    def test_no_label_on_screen(self):
        self.assertIsNone(promo_rack.version_beside_label('<hierarchy><node text="Settings" /></hierarchy>'))


class TextedCodeTest(unittest.TestCase):
    """Codes texted to a phone, read without a helper app (Tyler, 14 Oct 2026)."""

    def test_reads_the_newest_code_from_the_inbox(self):
        now = 1_800_000_000_000
        output = (
            "Row: 0 address=+15550100, body=Your Reddit code is 482913. Don't share it, date=%d\n"
            "Row: 1 address=+15550199, body=Lunch at 12, ok?, date=%d\n" % (now - 60_000, now - 30_000)
        )
        self.assertEqual(
            promo_rack.newest_code(promo_rack.parse_sms_rows(output), now),
            {"code": "482913", "from": "+15550100"},
        )

    def test_ignores_a_code_older_than_ten_minutes(self):
        now = 1_800_000_000_000
        output = "Row: 0 address=Reddit, body=Code 111222, date=%d\n" % (now - 11 * 60_000)
        self.assertIsNone(promo_rack.newest_code(promo_rack.parse_sms_rows(output), now))

    def test_reads_a_code_off_a_message_notification(self):
        output = """
  NotificationRecord(0x0f: pkg=com.google.android.apps.messaging user=UserHandle{0} id=0 tag=null)
      android.title=String (Reddit)
      android.text=String (123456 is your Reddit verification code)
  NotificationRecord(0x10: pkg=com.android.systemui user=UserHandle{0})
      android.text=String (Battery 15%, 999999 minutes)
"""
        messages = promo_rack.parse_notification_texts(output, 5)
        self.assertEqual(messages, [("Reddit", "123456 is your Reddit verification code", 5)])
        self.assertEqual(promo_rack.newest_code(messages, 5), {"code": "123456", "from": "Reddit"})


class ScreenInputTest(unittest.TestCase):
    def test_spells_typing_for_the_phone_shell(self):
        self.assertEqual(promo_rack.typed_text("it's a test"), "'it'\\''s%sa%stest'")

    def test_places_taps_and_swipes_in_the_phone_own_pixels(self):
        sent = []
        original = promo_rack.shell
        promo_rack.shell = lambda serial, command, timeout=30: sent.append((serial, command)) or ""
        try:
            promo_rack.apply_input("A1", {"kind": "tap", "x": 0.5, "y": 0.25}, (1080, 2400))
            promo_rack.apply_input("A1", {"kind": "swipe", "x1": 0.5, "y1": 0.8, "x2": 0.5, "y2": 0.2}, (1080, 2400))
            promo_rack.apply_input("A1", {"kind": "key", "key": "back"}, (1080, 2400))
            promo_rack.apply_input("A1", {"kind": "key", "key": "reboot"}, (1080, 2400))
        finally:
            promo_rack.shell = original
        self.assertEqual(sent, [
            ("A1", "input tap 540 600"),
            ("A1", "input swipe 540 1920 540 480 300"),
            ("A1", "input keyevent KEYCODE_BACK"),
        ])


class ScreenTurnTest(unittest.TestCase):
    def test_a_turn_survives_a_phone_with_no_picture_and_hands_taps_over(self):
        sent, applied = [], []
        originals = (promo_rack.call, promo_rack.connect_screen, promo_rack.read_texted_code, promo_rack.apply_input)

        def fake_call(config, path, payload):
            sent.append((path, payload))
            return {"wanted": ["A1"], "inputs": {"A1": [{"kind": "key", "key": "home"}]}}

        def no_screen(serial):
            raise RuntimeError("uiautomator2 is not installed on the rack.")

        promo_rack.call = fake_call
        promo_rack.connect_screen = no_screen
        promo_rack.read_texted_code = lambda serial: {"code": "123456", "from": "Reddit"}
        promo_rack.apply_input = lambda serial, item, size: applied.append((serial, item, size))
        try:
            state = {"wanted": ["A1"], "devices": {}, "sizes": {"A1": (1080, 2400)}, "texts_read_at": {}, "warned": set()}
            gap = promo_rack.screen_turn({}, state)
        finally:
            promo_rack.call, promo_rack.connect_screen, promo_rack.read_texted_code, promo_rack.apply_input = originals
        self.assertEqual(gap, promo_rack.SCREEN_GAP_SECONDS)
        self.assertEqual(sent, [("/api/rack/screen", {"frames": [], "texts": [{"code": "123456", "from": "Reddit", "serial": "A1"}]})])
        self.assertEqual(applied, [("A1", {"kind": "key", "key": "home"}, (1080, 2400))])
        self.assertEqual(state["wanted"], ["A1"])


class FakeImage(object):
    width, height = 100, 200

    def resize(self, size):
        return self

    def convert(self, mode):
        return self

    def save(self, buffer, format, quality):
        buffer.write(b"jpeg")


class FakeElement(object):
    def __init__(self, device, selector):
        self.device, self.selector = device, selector

    @property
    def label(self):
        if "text" in self.selector:
            return self.selector["text"]
        pattern = self.selector.get("textMatches") or self.selector.get("descriptionMatches")
        if pattern:
            return next((text for text in sorted(self.device.texts) if re.match(pattern, text)), "")
        return ""

    def wait(self, timeout=0):
        return self.label in self.device.texts

    @property
    def exists(self):
        return self.label in self.device.texts

    def click(self):
        self.device.pressed.append(self.label)


class FakeDevice(object):
    """A phone screen with these buttons on it, which writes down every press."""

    def __init__(self, texts, hierarchy=""):
        self.texts, self.pressed, self.hierarchy = set(texts), [], hierarchy

    def __call__(self, **selector):
        return FakeElement(self, selector)

    def screenshot(self):
        return FakeImage()

    def dump_hierarchy(self):
        return self.hierarchy

    def screen_on(self):
        pass


def comment_walk(serial, args, walk):
    """A comment's steps, the shape the Reddit app actions take in file 05."""
    walk.tap("Open the post", text="Open")
    walk.tap("Open the reply box", text="Add a reply")
    walk.final("Press Post", text="Post")
    return {}


class SelfTestTest(unittest.TestCase):
    """Part 20: the self-test walks each action to its last button and never presses it."""

    def run_self_test(self, texts):
        device = FakeDevice(texts)
        promo_rack.ACTIONS["test/comment"] = comment_walk
        originals = (promo_rack.go_home,)
        promo_rack.go_home = lambda serial: None
        try:
            walk = promo_rack.Walk("A1", connect=lambda serial: device)
            result = promo_rack.action_self_test("A1", {}, walk, rehearsals={"test/comment": {}})
        finally:
            del promo_rack.ACTIONS["test/comment"]
            (promo_rack.go_home,) = originals
        return result, device, walk

    def test_a_working_action_passes_and_post_is_found_but_never_pressed(self):
        result, device, walk = self.run_self_test(["Open", "Add a reply", "Post"])
        self.assertEqual(result, {"actions": [{"action": "test/comment", "passed": True, "step": "", "error": ""}]})
        self.assertEqual(device.pressed, ["Open", "Add a reply"])
        self.assertEqual([step for step, _ in walk.steps], ["test/comment: Press Post (found, not pressed)"])

    def test_a_moved_button_fails_its_step_with_a_picture_of_where_it_stopped(self):
        # The app renamed "Add a reply" to "Respond", the way an update moves a button.
        result, device, walk = self.run_self_test(["Open", "Respond", "Post"])
        line = result["actions"][0]
        self.assertFalse(line["passed"])
        self.assertEqual(line["step"], "Open the reply box")
        self.assertIn('"Add a reply"', line["error"])
        self.assertEqual(device.pressed, ["Open"])
        self.assertNotIn("Post", device.pressed)
        self.assertEqual(walk.steps[-1][0], "test/comment: Open the reply box")

    def test_a_real_run_presses_post_once(self):
        device = FakeDevice(["Open", "Add a reply", "Post"])
        walk = promo_rack.Walk("A1", connect=lambda serial: device)
        comment_walk("A1", {}, walk)
        self.assertEqual(device.pressed, ["Open", "Add a reply", "Post"])

    def test_a_rehearsal_that_taps_post_is_stopped_before_the_press(self):
        device = FakeDevice(["Open", "Post"])
        walk = promo_rack.Walk("A1", rehearse=True, connect=lambda serial: device)
        with self.assertRaises(RuntimeError):
            walk.tap("Press Post", text="Post")
        self.assertEqual(device.pressed, [])

    def test_too_many_steps_keep_the_first_and_where_it_stopped(self):
        steps = [("step %d" % index, b"") for index in range(40)]
        kept = promo_rack.capped(steps)
        self.assertEqual(len(kept), promo_rack.MAX_STEPS)
        self.assertEqual(kept[-1][0], "step 39")

    def test_a_cancelled_walk_presses_nothing_more(self):
        device = FakeDevice(["Open", "Add a reply", "Post"])
        walk = promo_rack.Walk("A1", connect=lambda serial: device)
        walk.cancelled.set()
        with self.assertRaises(promo_rack.Cancelled):
            comment_walk("A1", {}, walk)
        self.assertEqual(device.pressed, [])


FIXTURES = os.path.join(HERE, "fixtures", "ban-screens")


class BanScreenTest(unittest.TestCase):
    """Part 15: each saved ban screen is recognised; a feed that only mentions one is not.

    The saved screens were written from each app's known wording, not dumped
    from a real phone, because no account on the rack has hit one yet.
    """

    def read(self, name):
        with open(os.path.join(FIXTURES, name + ".xml"), encoding="utf-8") as handle:
            return handle.read()

    def test_every_saved_ban_screen_is_recognised(self):
        expected = {
            "reddit-suspended": ("reddit", "suspended"),
            "reddit-locked": ("reddit", "locked"),
            "reddit-confirm": ("reddit", "confirm"),
            "instagram-suspended": ("instagram", "suspended"),
            "instagram-locked": ("instagram", "locked"),
            "instagram-confirm": ("instagram", "confirm"),
            "tiktok-suspended": ("tiktok", "suspended"),
            "tiktok-confirm": ("tiktok", "confirm"),
        }
        for name, (app, kind) in expected.items():
            found = promo_rack.ban_screen_in(self.read(name), app)
            self.assertIsNotNone(found, name)
            self.assertEqual((found["app"], found["kind"]), (app, kind), name)
        words = promo_rack.ban_screen_in(self.read("reddit-suspended"), "reddit")["words"]
        self.assertTrue(words.startswith("Your account has been suspended This account"))
        self.assertEqual(promo_rack.ban_screen_in(self.read("reddit-confirm"), "reddit")["kind"], "confirm")
        self.assertNotIn("12:04", words)

    def test_a_feed_post_that_starts_like_one_is_not_a_ban_screen(self):
        self.assertIsNone(promo_rack.ban_screen_in(self.read("reddit-feed-not-a-ban"), "reddit"))

    def test_a_short_thread_or_another_users_profile_is_not_a_ban_screen(self):
        self.assertIsNone(promo_rack.ban_screen_in(self.read("reddit-thread-not-a-ban"), "reddit"))
        self.assertIsNone(promo_rack.ban_screen_in(self.read("reddit-other-profile-not-a-ban"), "reddit"))

    def test_another_apps_ban_screen_does_not_stop_this_one(self):
        self.assertIsNone(promo_rack.ban_screen_in(self.read("instagram-suspended"), "reddit"))

    def test_an_app_action_answer_carries_the_ban_screen(self):
        sent = []
        device = FakeDevice([], hierarchy=self.read("reddit-locked"))
        originals = (promo_rack.call, promo_rack.connect_screen)
        promo_rack.call = lambda config, path, payload: sent.append(payload) or {}
        promo_rack.connect_screen = lambda serial: device
        promo_rack.ACTIONS["reddit/test"] = lambda serial, args, walk: {"read": True}
        try:
            promo_rack.run_action({}, {"id": "a" * 36, "serial": "A1", "action": "reddit/test", "args": {}})
        finally:
            promo_rack.call, promo_rack.connect_screen = originals
            del promo_rack.ACTIONS["reddit/test"]
        self.assertEqual(sent[0]["banScreen"]["kind"], "locked")
        self.assertTrue(sent[0]["ok"])


class FreezeTest(unittest.TestCase):
    """Part 16: a frozen app is closed and opened again, a frozen phone restarted, and nothing is run twice."""

    def setUp(self):
        self.saved = dict(
            MIN_WATCH_SECONDS=promo_rack.MIN_WATCH_SECONDS,
            FREEZE_MARGIN_SECONDS=promo_rack.FREEZE_MARGIN_SECONDS,
            phone_answers=promo_rack.phone_answers,
            foreground_package=promo_rack.foreground_package,
            reopen_app=promo_rack.reopen_app,
            adb=promo_rack.adb,
        )
        promo_rack.MIN_WATCH_SECONDS = 0
        promo_rack.FREEZE_MARGIN_SECONDS = 0
        promo_rack._RESTARTED_AT.clear()
        promo_rack._RESTART_WHY.clear()
        self.reopened, self.adb_calls, self.runs = [], [], []
        promo_rack.reopen_app = lambda serial, package: self.reopened.append(package)
        promo_rack.foreground_package = lambda serial: "com.reddit.frontpage"
        promo_rack.adb = lambda args, serial=None, timeout=30: self.adb_calls.append(args) or ""

    def tearDown(self):
        for name, value in self.saved.items():
            setattr(promo_rack, name, value)
        promo_rack._RESTARTED_AT.clear()
        promo_rack._RESTART_WHY.clear()

    def frozen(self, serial, args, walk):
        self.runs.append(serial)
        time.sleep(3)
        walk.check()
        return {}

    def test_a_frozen_app_is_reopened_and_the_action_is_not_run_again(self):
        promo_rack.phone_answers = lambda serial: True
        walk = promo_rack.Walk("A1")
        ok, result, error, recovered = promo_rack.run_watched(
            self.frozen, "A1", {"id": "b" * 36, "action": "reddit/comment", "timeoutSeconds": 1}, walk
        )
        self.assertEqual((ok, result, recovered), (False, None, "app"))
        self.assertIn("closed it and opened it again", error)
        self.assertEqual(self.reopened, ["com.reddit.frontpage"])
        self.assertTrue(walk.cancelled.is_set())
        self.assertEqual(self.runs, ["A1"])

    def test_a_phone_that_stops_answering_is_restarted_once_in_half_an_hour(self):
        promo_rack.phone_answers = lambda serial: False
        action = {"id": "c" * 36, "action": "reddit/health", "timeoutSeconds": 1}
        first = promo_rack.run_watched(self.frozen, "A1", action, promo_rack.Walk("A1"))
        second = promo_rack.run_watched(self.frozen, "A1", action, promo_rack.Walk("A1"))
        self.assertEqual(first[3], "phone")
        self.assertEqual(self.adb_calls, [["reboot"]])
        self.assertEqual(second[3], "")
        self.assertIn("left it for you", second[2])
        self.assertEqual(promo_rack.restarting_as_such([]), [
            {"serial": "A1", "state": "restarting", "usb": "", "model": "", "android": ""},
        ])

    def test_reads_which_app_is_in_front(self):
        original = promo_rack.shell
        promo_rack.shell = lambda serial, command, timeout=30: "  mCurrentFocus=Window{9f1c2e u0 com.reddit.frontpage/com.reddit.launch.main.MainActivity}"
        try:
            # setUp stood a fake in for it; this is the real one.
            self.assertEqual(self.saved["foreground_package"]("A1"), "com.reddit.frontpage")
        finally:
            promo_rack.shell = original

    def test_android_not_responding_box_is_closed_and_the_app_opened_again(self):
        dump = (
            '<hierarchy><node text="Reddit isn’t responding" package="android" />'
            '<node text="Close app" package="android" /><node text="Wait" package="android" /></hierarchy>'
        )
        device = FakeDevice(["Close app", "Wait"], hierarchy=dump)
        original = promo_rack.connect_screen
        promo_rack.connect_screen = lambda serial: device
        try:
            words = promo_rack.close_not_responding("A1", "reddit/search")
        finally:
            promo_rack.connect_screen = original
        self.assertEqual(device.pressed, ["Close app"])
        self.assertEqual(self.reopened, ["com.reddit.frontpage"])
        self.assertIn("isn’t responding", words)


class ReadingsTest(unittest.TestCase):
    """Parts 14, 19 and 21: battery, heat, storage, signal and app versions off one adb call."""

    OUTPUT = (
        "Current Battery Service state:\n  AC powered: false\n  USB powered: true\n  status: 2\n"
        "  level: 82\n  scale: 100\n  temperature: 463\n@@\n"
        "Filesystem      1K-blocks    Used Available Use% Mounted on\n"
        "/dev/block/dm-8 115000000 92000000 23000000  80% /data\n@@\n"
        "93812.55 350000.10\n@@\n"
        "  mServiceState={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=1(OUT_OF_SERVICE), mChannelNumber=-1}\n"
        "  mServiceState={mVoiceRegState=0(IN_SERVICE), mDataRegState=0(IN_SERVICE), mChannelNumber=521}\n"
    )

    def test_reads_the_minute_reading(self):
        self.assertEqual(promo_rack.parse_vitals(self.OUTPUT), {
            "batteryPercent": 82,
            "temperatureC": 46.3,
            "storageUsedPercent": 80,
            "signal": "in_service",
            "upSeconds": 93812,
            "apps": None,
            "restartWhy": "",
        })

    def test_no_slot_in_service_is_no_signal_and_old_androids_are_read_too(self):
        self.assertEqual(promo_rack.service_state(["mServiceState={mVoiceRegState=1(OUT_OF_SERVICE), mDataRegState=3(POWER_OFF)}"]), "out_of_service")
        self.assertEqual(promo_rack.service_state(["  mServiceState=1 1 voice home data home null null"]), "out_of_service")
        self.assertEqual(promo_rack.service_state([]), "")

    def test_reads_app_versions_and_leaves_out_apps_not_installed(self):
        output = (
            "com.instagram.android \n"
            "com.reddit.frontpage     versionName=2025.40.0\n"
            "com.zhiliaoapp.musically     versionName=37.1.4\n"
        )
        self.assertEqual(promo_rack.parse_app_versions(output), {"reddit": "2025.40.0", "tiktok": "37.1.4"})

    def test_a_reading_promo_did_not_receive_keeps_its_restart_reason(self):
        promo_rack._VITALS.clear()
        promo_rack.keep_reading("A1", {"upSeconds": 70, "restartWhy": "It froze.", "apps": None})
        taken = promo_rack.take_reading("A1")
        promo_rack.keep_reading("A1", {"upSeconds": 130, "restartWhy": "", "apps": None})
        promo_rack.put_back_reading("A1", taken)
        self.assertEqual(promo_rack.take_reading("A1"), {"upSeconds": 130, "restartWhy": "It froze.", "apps": None})


REDDIT_FIXTURES = os.path.join(HERE, "fixtures", "reddit")
SETUP_FIXTURES = os.path.join(HERE, "fixtures", "setup")


def fixture(folder, name):
    with open(os.path.join(folder, name), "r", encoding="utf-8") as handle:
        return handle.read()


class HandsTest(unittest.TestCase):
    """Behave-like-a-person part 6 on a phone: taps, swipes and typing."""

    def test_a_hundred_taps_land_at_many_points_all_inside_the_button(self):
        rng = random.Random(7)
        bounds = (100, 900, 500, 1000)
        points = [promo_rack.tap_point(bounds, rng) for _ in range(100)]
        for x, y in points:
            self.assertTrue(100 <= x < 500 and 900 <= y < 1000, (x, y))
            # Never in the outer fifth on either side.
            self.assertTrue(180 <= x <= 420 and 920 <= y <= 980, (x, y))
        self.assertGreater(len(set(points)), 60)
        self.assertTrue(all(points.count(point) <= 5 for point in points))

    def test_swipes_bend_and_differ_run_to_run(self):
        first = promo_rack.swipe_path(540, 1800, 540, 900, random.Random(1))
        second = promo_rack.swipe_path(540, 1800, 540, 900, random.Random(2))
        self.assertEqual(first[0], (540, 1800))
        self.assertEqual(first[-1], (540, 900))
        # A straight swipe would keep x at 540 all the way.
        self.assertTrue(any(abs(x - 540) >= 3 for x, _ in first[1:-1]))
        self.assertNotEqual(first, second)
        # Points bunch at the ends: the first step is shorter than the middle one.
        steps = [abs(b[1] - a[1]) for a, b in zip(first, first[1:])]
        self.assertLess(steps[0], max(steps))

    def test_typing_gaps_vary_and_sentence_ends_wait_longer(self):
        plan = promo_rack.typing_plan("Yes it works. We use it daily.", random.Random(3))
        self.assertEqual("".join(character for character, _ in plan), "Yes it works. We use it daily.")
        gaps = [gap for _, gap in plan[:-1]]
        self.assertEqual(plan[-1][1], 0.0)
        self.assertGreater(len(set(round(gap, 3) for gap in gaps)), 10)
        after_full_stop = plan[12][1]
        self.assertEqual(plan[12][0], ".")
        self.assertGreaterEqual(after_full_stop, promo_rack.KEY_GAP_SECONDS[0] + promo_rack.SENTENCE_PAUSE_SECONDS[0])
        ordinary = [gap for character, gap in plan[:-1] if character not in ". "]
        self.assertTrue(all(gap <= promo_rack.KEY_GAP_SECONDS[1] for gap in ordinary))

    def test_each_kind_of_character_is_typed_its_own_way(self):
        sent, keys = [], []

        class Keys(object):
            def send_keys(self, text, clear=True):
                keys.append((text, clear))

        with mock.patch.object(promo_rack, "shell", lambda serial, command, timeout=30: sent.append(command) or ""):
            for character in ("a", " ", "'", "\n", "é", "🙂"):
                promo_rack.type_key("A1", Keys(), character)
        self.assertEqual(sent, ["input text 'a'", "input text '%s'", "input text ''\\'''", "input keyevent KEYCODE_ENTER"])
        self.assertEqual(keys, [("é", False), ("🙂", False)])


class LastButtonGuardTest(unittest.TestCase):
    def test_patterns_that_could_find_post_send_or_share_are_caught(self):
        self.assertTrue(promo_rack.could_be_last_button({"textMatches": "(?i)^(post|reply|comment)$"}))
        self.assertTrue(promo_rack.could_be_last_button({"descriptionMatches": "^Send$"}))
        self.assertFalse(promo_rack.could_be_last_button({"textMatches": "(?i)^(add a comment|join the conversation)$"}))
        self.assertFalse(promo_rack.could_be_last_button({"textMatches": "(?i)^(erase all data|reset)$"}))

    def test_a_rehearsal_cannot_tap_post_through_a_pattern(self):
        device = FakeDevice(["Post"])
        walk = promo_rack.Walk("A1", rehearse=True, connect=lambda serial: device)
        with self.assertRaises(RuntimeError):
            walk.tap_first("Press Post", selectors=promo_rack.REDDIT_POST_BUTTON)
        self.assertFalse(walk.final_first("Press Post", selectors=promo_rack.REDDIT_POST_BUTTON))
        self.assertEqual(device.pressed, [])

    def test_a_real_run_presses_the_first_shape_found_once(self):
        device = FakeDevice(["Reply"])
        walk = promo_rack.Walk("A1", connect=lambda serial: device)
        with mock.patch("time.sleep"):
            self.assertTrue(walk.final_first("Press Post", selectors=promo_rack.REDDIT_POST_BUTTON))
        self.assertEqual(device.pressed, ["Reply"])

    def test_a_missing_button_names_every_shape_tried(self):
        device = FakeDevice([])
        walk = promo_rack.Walk("A1", connect=lambda serial: device)
        with mock.patch("time.sleep"), self.assertRaises(promo_rack.StepFailed) as raised:
            walk.find_first("Open the comment box", timeout=0, selectors=promo_rack.REDDIT_COMMENT_BOX)
        self.assertIn("add a comment", str(raised.exception))
        self.assertEqual(raised.exception.step, "Open the comment box")


class SetupCheckTest(unittest.TestCase):
    """Part 23: what the setup check reads off a phone."""

    def test_location_is_read_from_runtime_permissions(self):
        dump = fixture(SETUP_FIXTURES, "dumpsys-package-reddit.txt")
        self.assertTrue(promo_rack.location_granted(dump))
        self.assertFalse(promo_rack.location_granted(dump.replace("COARSE_LOCATION: granted=true", "COARSE_LOCATION: granted=false")))
        # Asked for in the app's list is not the same as allowed.
        self.assertFalse(promo_rack.location_granted("requested permissions:\n  android.permission.ACCESS_FINE_LOCATION\n"))

    def test_a_time_zone_is_placed_in_its_country(self):
        with tempfile.TemporaryDirectory() as folder:
            old = os.path.join(folder, "zone.tab")
            new = os.path.join(folder, "zone1970.tab")
            with open(old, "w") as handle:
                handle.write("# comment\nCA\t+4339-07923\tAmerica/Toronto\tEastern - ON\n")
            with open(new, "w") as handle:
                handle.write("CH,DE,LI\t+4723+00832\tEurope/Zurich\n")
            self.assertEqual(promo_rack.zone_country("America/Toronto", (old, new)), "CA")
            self.assertEqual(promo_rack.zone_country("Europe/Zurich", (old, new)), "CH")
            self.assertEqual(promo_rack.zone_country("Etc/UTC", (old, new)), "")
            self.assertEqual(promo_rack.zone_country("", (old, new)), "")
        if os.path.exists("/usr/share/zoneinfo/zone.tab"):
            self.assertEqual(promo_rack.zone_country("America/Toronto"), "CA")

    def test_language_sim_and_wifi_fall_back_sensibly(self):
        self.assertEqual(promo_rack.pick_locale("", "en-CA,fr-CA", "en_US"), "en-CA")
        self.assertEqual(promo_rack.pick_locale("", "", "en_US"), "en-US")
        self.assertEqual(promo_rack.pick_locale("fr-FR", "en-CA", ""), "fr-FR")
        self.assertEqual(promo_rack.first_listed(",ca"), "ca")
        self.assertEqual(promo_rack.first_listed(""), "")
        self.assertEqual([promo_rack.wifi_on(value) for value in ("0", "1", "2", "3", "")], [False, True, True, False, None])

    def test_ipinfo_answer_is_read_off_the_browser_screen(self):
        self.assertEqual(promo_rack.outside_from_screen(fixture(SETUP_FIXTURES, "browser-ipinfo.xml")), {
            "ip": "172.56.21.9",
            "country": "CA",
            "timezone": "America/Toronto",
            "org": "AS812 Rogers Communications Canada Inc.",
        })
        self.assertEqual(promo_rack.ipinfo_from_text("This site can't be reached")["ip"], "")

    def test_the_ticked_auto_update_choice_is_read(self):
        dump = fixture(SETUP_FIXTURES, "play-auto-update.xml")
        self.assertEqual(promo_rack.checked_radio(dump), "Don't auto-update apps")
        self.assertEqual(promo_rack.auto_update_word("Don’t auto-update apps"), "off")
        self.assertEqual(promo_rack.auto_update_word("Over Wi-Fi only"), "wifi")
        self.assertEqual(promo_rack.auto_update_word("Over any network"), "any")
        moved = dump.replace('checked="true"', 'checked="false"').replace(
            'checked="false" content-desc="" bounds="[100,1050]', 'checked="true" content-desc="" bounds="[100,1050]')
        self.assertEqual(promo_rack.checked_radio(moved), "Over Wi-Fi only")

    def test_the_house_address_is_read_and_a_failure_says_why(self):
        found = promo_rack.read_home_address(fetch=lambda url: '{"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "AS1 Home"}')
        self.assertEqual(found, {"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "AS1 Home", "error": ""})

        def down(url):
            raise OSError("no route")

        failed = promo_rack.read_home_address(fetch=down)
        self.assertEqual(failed["ip"], "")
        self.assertIn("no route", failed["error"])

    def test_the_check_reads_every_part_and_one_failing_leaves_the_rest(self):
        answers = {
            "settings get global wifi_on": "1",
            "getprop persist.sys.timezone": "America/Toronto",
            "getprop persist.sys.locale": "",
            "settings get system system_locales": "en-CA",
            "getprop gsm.sim.operator.iso-country": "ca",
            "getprop gsm.sim.operator.alpha": "Rogers",
            "getprop gsm.operator.alpha": "Rogers",
            "dumpsys battery": "  status: 2\n  level: 79\n",
            "dumpsys package com.reddit.frontpage": fixture(SETUP_FIXTURES, "dumpsys-package-reddit.txt"),
        }

        def shell(serial, command, timeout=30):
            if command == promo_rack.APPS_COMMAND:
                return "com.instagram.android \ncom.reddit.frontpage     versionName=2025.40.0\n"
            if command == "getprop ro.product.locale":
                raise RuntimeError("device offline")
            return answers.get(command, "")

        outside = {"ip": "", "country": "", "timezone": "", "org": "", "error": "The phone's browser did not show ipinfo.io's answer within 15 seconds."}
        with mock.patch.object(promo_rack, "shell", shell), \
                mock.patch.object(promo_rack, "read_auto_update", lambda serial, walk: ("off", "")), \
                mock.patch.object(promo_rack, "read_outside_on_phone", lambda serial, walk: dict(outside)), \
                mock.patch.object(promo_rack, "read_home_address", lambda: {"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "", "error": ""}), \
                mock.patch.object(promo_rack, "zone_country", lambda zone: "CA"):
            result = promo_rack.action_setup_check("A1", {}, promo_rack.Walk("A1", connect=lambda serial: FakeDevice([])))
        self.assertEqual(result, {
            "wifiOn": True,
            "locationApps": {"reddit": True},
            "timezone": "America/Toronto",
            "timezoneCountry": "CA",
            "locale": "en-CA",
            "sim": {"country": "CA", "carrier": "Rogers"},
            "network": {"carrier": "Rogers"},
            "autoUpdate": "off",
            "autoUpdateError": "",
            "battery": {"percent": 79, "charging": True},
            "outside": outside,
            "home": {"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "", "error": ""},
        })


class WipeTest(unittest.TestCase):
    """Part 26: the erase is pressed once in a real run and never in a rehearsal."""

    def run_wipe(self, rehearse):
        device = FakeDevice(["Erase all data"])
        sent = []
        walk = promo_rack.Walk("A1", rehearse=rehearse, connect=lambda serial: device)
        with mock.patch.object(promo_rack, "shell", lambda serial, command, timeout=30: sent.append(command) or "Starting: Intent"), \
                mock.patch("time.sleep"):
            result = promo_rack.action_wipe("A1", {}, walk)
        return result, device, sent

    def test_a_real_wipe_presses_erase_then_confirms_once(self):
        result, device, sent = self.run_wipe(False)
        self.assertEqual(result, {"wiped": True})
        self.assertEqual(device.pressed, ["Erase all data", "Erase all data"])
        self.assertIn("FactoryResetActivity", sent[0])

    def test_a_rehearsed_wipe_never_confirms(self):
        result, device, _ = self.run_wipe(True)
        self.assertEqual(result, {"wiped": False})
        self.assertEqual(device.pressed, ["Erase all data"])

    def test_the_wipe_is_never_rehearsed(self):
        self.assertNotIn("phone/wipe", promo_rack.REHEARSALS)


class RedditScreensTest(unittest.TestCase):
    """Part 29: what the Reddit app's own screens say about the account."""

    NOW = 1_800_000_000

    def test_the_account_menu_gives_handle_karma_and_age_counted_down(self):
        reading = promo_rack.account_from_screen(fixture(REDDIT_FIXTURES, "account-menu.xml"), self.NOW)
        self.assertEqual(reading, {"handle": "quiet_maple_42", "karma": 1234, "createdSeconds": float(self.NOW - 730 * 86400)})

    def test_figures_on_one_line_are_read_too(self):
        reading = promo_rack.account_from_screen(fixture(REDDIT_FIXTURES, "account-menu-one-line.xml"), self.NOW)
        self.assertEqual(reading, {"handle": "new_fern_7", "karma": 1200, "createdSeconds": float(self.NOW - 5 * 86400)})

    def test_a_menu_offering_log_in_is_signed_out(self):
        self.assertEqual(
            promo_rack.account_from_screen(fixture(REDDIT_FIXTURES, "account-menu-signed-out.xml"), self.NOW),
            {"handle": None, "karma": None, "createdSeconds": None},
        )

    def test_karma_and_age_words(self):
        self.assertEqual([promo_rack.parse_karma(text) for text in ("1,234", "1.2k", "3M", "17", "lots")], [1234, 1200, 3000000, 17, None])
        self.assertEqual(
            [promo_rack.parse_age_days(text) for text in ("2y", "3mo", "1y 2mo", "5d", "6h", "4m", "soon")],
            [730, 90, 425, 5, 0, 0, None],
        )

    def test_the_own_profile_reads_found_or_suspended(self):
        self.assertEqual(
            promo_rack.profile_from_screen(fixture(REDDIT_FIXTURES, "profile.xml"), "quiet_maple_42"),
            {"status": 200, "found": True, "suspended": False},
        )
        self.assertEqual(
            promo_rack.profile_from_screen(fixture(REDDIT_FIXTURES, "profile-suspended.xml"), "quiet_maple_42"),
            {"status": 200, "found": True, "suspended": True},
        )
        self.assertEqual(
            promo_rack.profile_from_screen(fixture(REDDIT_FIXTURES, "account-menu-signed-out.xml"), "quiet_maple_42"),
            {"status": 0, "found": False, "suspended": False},
        )

    def test_a_new_comment_by_the_account_counts_as_landed(self):
        after = fixture(REDDIT_FIXTURES, "thread-after-post.xml")
        before = after.replace("u/quiet_maple_42 · now", "u/third_person · 1h")
        self.assertEqual(promo_rack.handle_count(before, "quiet_maple_42"), 0)
        self.assertTrue(promo_rack.comment_landed(after, "quiet_maple_42", 0))
        self.assertFalse(promo_rack.comment_landed(after, "quiet_maple_42", 1))
        self.assertTrue(promo_rack.comment_landed(before.replace("u/third_person · 1h", "Comment posted"), "quiet_maple_42", 0))

    def test_feed_titles_skip_promoted_posts_and_the_screen_edges(self):
        titles = promo_rack.feed_post_titles(fixture(REDDIT_FIXTURES, "feed.xml"), 2400)
        self.assertEqual(titles, [(40, 700, 1040, 820)])


class ScriptedRedditPhone(FakeDevice):
    """The Reddit app on a fake screen: the account menu after the avatar, the
    thread with the new comment after Post (or not, when it never landed)."""

    def __init__(self, lands=True):
        FakeDevice.__init__(self, ["Avatar", "Add a comment", "Post"])
        self.lands = lands
        self.menu_reads = 0
        self.thread = fixture(REDDIT_FIXTURES, "thread-after-post.xml")

    def dump_hierarchy(self):
        # The menu is read once after the avatar; Back then closes it.
        if self.pressed and self.pressed[-1] == "Avatar" and self.menu_reads < self.pressed.count("Avatar"):
            self.menu_reads += 1
            return fixture(REDDIT_FIXTURES, "account-menu.xml")
        if "Post" in self.pressed and self.lands:
            return self.thread
        return self.thread.replace("u/quiet_maple_42 · now", "u/third_person · 1h")


class RedditCommentTest(unittest.TestCase):
    """Part 29's comment: Post is pressed once in a real run, never in a rehearsal."""

    def run_comment(self, device, args, rehearse=False):
        sent = []
        walk = promo_rack.Walk("A1", rehearse=rehearse, connect=lambda serial: device)
        with mock.patch.object(promo_rack, "shell", lambda serial, command, timeout=30: sent.append(command) or ""), \
                mock.patch.object(promo_rack, "FEED_BEFORE_SECONDS", (0, 0)), \
                mock.patch.object(promo_rack, "FEED_AFTER_SECONDS", (0, 0)), \
                mock.patch.object(promo_rack, "READ_SECONDS", (0, 0)), \
                mock.patch.object(promo_rack, "POST_LANDED_SECONDS", 0.05), \
                mock.patch.object(promo_rack, "go_home", lambda serial: None), \
                mock.patch("time.sleep"):
            try:
                return promo_rack.action_reddit_comment("A1", args, walk), sent
            except Exception as failure:  # Handed back with what was sent.
                return failure, sent

    def test_a_real_comment_types_the_words_and_presses_post_once(self):
        device = ScriptedRedditPhone()
        result, sent = self.run_comment(device, {"permalink": "/r/smallbusiness/comments/abc/how/", "text": "Hi. Ok", "subreddit": "smallbusiness"})
        self.assertEqual(result["commentUrl"], "")
        self.assertEqual(sorted(result["visit"]), ["afterSeconds", "beforeSeconds", "postsOpened", "problems", "reachedBy", "scrolls"])
        self.assertEqual(device.pressed.count("Post"), 1)
        self.assertEqual(device.pressed[-2:], ["Add a comment", "Post"])
        self.assertTrue(any("-d 'https://www.reddit.com/r/smallbusiness/comments/abc/how/' -p com.reddit.frontpage" in command for command in sent))
        typed = [command for command in sent if command.startswith("input text")]
        self.assertEqual(len(typed), len("Hi. Ok"))

    def test_a_comment_that_never_shows_is_failed_without_a_second_press(self):
        device = ScriptedRedditPhone(lands=False)
        failure, _ = self.run_comment(device, {"permalink": "/r/x/comments/abc/t/", "text": "Hi", "subreddit": "x"})
        self.assertIn("no new comment by u/quiet_maple_42", str(failure))
        self.assertEqual(device.pressed.count("Post"), 1)

    def test_a_signed_out_app_never_opens_the_comment_box(self):
        device = ScriptedRedditPhone()
        device.dump_hierarchy = lambda: fixture(REDDIT_FIXTURES, "account-menu-signed-out.xml")
        failure, _ = self.run_comment(device, {"permalink": "/r/x/comments/abc/t/", "text": "Hi", "subreddit": "x"})
        self.assertIn("not signed in", str(failure))
        self.assertNotIn("Add a comment", device.pressed)

    def test_a_rehearsal_types_nothing_and_finds_post_without_pressing_it(self):
        device = ScriptedRedditPhone()
        result, sent = self.run_comment(device, {"permalink": "/r/x/comments/abc/t/", "text": "", "subreddit": ""}, rehearse=True)
        self.assertEqual(result, {"commentUrl": "", "visit": promo_rack.new_visit()})
        self.assertEqual(device.pressed, ["Add a comment"])
        self.assertFalse([command for command in sent if command.startswith("input text")])
        self.assertIn("input keyevent KEYCODE_BACK", sent)

    def test_the_self_test_rehearses_on_the_post_promo_sends(self):
        seen = {}
        promo_rack.ACTIONS["test/comment"] = lambda serial, args, walk: seen.update(args) or {}
        try:
            with mock.patch.object(promo_rack, "go_home", lambda serial: None):
                walk = promo_rack.Walk("A1", connect=lambda serial: FakeDevice([]))
                promo_rack.action_self_test(
                    "A1",
                    {"rehearsals": {"test/comment": {"permalink": "/r/x/comments/abc/t/"}, "test/unknown": {}}},
                    walk,
                    rehearsals={"test/comment": {"permalink": "", "text": ""}},
                )
        finally:
            del promo_rack.ACTIONS["test/comment"]
        self.assertEqual(seen, {"permalink": "/r/x/comments/abc/t/", "text": ""})

    def test_reddit_actions_are_rehearsed(self):
        for name in ("reddit/state", "reddit/health", "reddit/comment"):
            self.assertIn(name, promo_rack.REHEARSALS)
            self.assertIn(name, promo_rack.ACTIONS)
        self.assertIn("reddit/quick_state", promo_rack.ACTIONS)


INSTAGRAM_FIXTURES = os.path.join(HERE, "fixtures", "instagram")
TIKTOK_FIXTURES = os.path.join(HERE, "fixtures", "tiktok")
NOTIFICATION_FIXTURES = os.path.join(HERE, "fixtures", "notifications")


class AppScreensTest(unittest.TestCase):
    """File 06, part 32: what Instagram's and TikTok's own screens say about the account."""

    def test_the_instagram_profile_gives_handle_and_figures(self):
        self.assertEqual(
            promo_rack.app_profile_from_screen(fixture(INSTAGRAM_FIXTURES, "profile.xml"), "instagram"),
            {"handle": "quiet.maple", "followers": 1234, "following": 56, "posts": 12},
        )

    def test_the_tiktok_profile_gives_handle_and_figures_and_no_post_count(self):
        self.assertEqual(
            promo_rack.app_profile_from_screen(fixture(TIKTOK_FIXTURES, "profile.xml"), "tiktok"),
            {"handle": "quiet.maple", "followers": 12300, "following": 56, "posts": None},
        )

    def test_a_log_in_screen_is_signed_out_and_a_profile_is_not(self):
        self.assertTrue(promo_rack.signed_out(fixture(INSTAGRAM_FIXTURES, "signed-out.xml"), "instagram"))
        self.assertFalse(promo_rack.signed_out(fixture(INSTAGRAM_FIXTURES, "profile.xml"), "instagram"))

    def test_the_account_status_page_reads_hidden_clear_or_not_read(self):
        hidden = promo_rack.shadowban_from_screen(fixture(INSTAGRAM_FIXTURES, "account-status-hidden.xml"), "instagram")
        self.assertEqual((hidden["read"], hidden["hidden"]), (True, True))
        self.assertIn("can't be recommended to people who don't follow you", hidden["words"])
        clear = promo_rack.shadowban_from_screen(fixture(INSTAGRAM_FIXTURES, "account-status-clear.xml"), "instagram")
        self.assertEqual((clear["read"], clear["hidden"]), (True, False))
        # The menu's own "What can't be recommended" says nothing either way.
        menu = promo_rack.shadowban_from_screen(fixture(INSTAGRAM_FIXTURES, "account-status-menu-only.xml"), "instagram")
        self.assertEqual(menu, {"read": False, "hidden": False, "words": ""})
        tiktok = promo_rack.shadowban_from_screen(fixture(TIKTOK_FIXTURES, "account-status.xml"), "tiktok")
        self.assertEqual((tiktok["read"], tiktok["hidden"]), (True, True))

    def test_a_posts_numbers_are_read_off_its_own_screen(self):
        self.assertEqual(
            promo_rack.post_numbers_from_screen(fixture(INSTAGRAM_FIXTURES, "post.xml"), "instagram"),
            {"views": 2345, "likes": 321, "comments": 18},
        )
        self.assertEqual(
            promo_rack.post_numbers_from_screen(fixture(TIKTOK_FIXTURES, "post.xml"), "tiktok"),
            {"views": None, "likes": 1200, "comments": 45},
        )

    def test_a_conversation_has_its_name_and_whose_line_is_whose(self):
        conversation = promo_rack.conversation_from_screen(fixture(INSTAGRAM_FIXTURES, "conversation.xml"), "instagram")
        self.assertEqual(conversation["thread"], "sam.reads")
        self.assertEqual(conversation["lines"], [
            {"from": "sam.reads", "text": "hey, is the night mode free?", "mine": False},
            {"from": "", "text": "Yes, it is in the free plan.", "mine": True},
            {"from": "sam.reads", "text": "thanks! does it work offline too?", "mine": False},
        ])

    def test_a_long_android_message_taller_than_half_the_screen_is_still_a_line(self):
        long_text = "This is a long message. " * 40
        tall = (
            '<hierarchy><node text="" class="android.widget.FrameLayout" package="com.instagram.android" bounds="[0,0][1080,2400]">'
            '<node text="sam.reads" class="android.widget.TextView" package="com.instagram.android" bounds="[160,100][600,180]" />'
            '<node text="%s" class="android.widget.TextView" package="com.instagram.android" bounds="[60,400][760,1800]" />'
            '<node text="ok" class="android.widget.TextView" package="com.instagram.android" bounds="[420,1850][1040,1950]" />'
            '</node></hierarchy>'
        ) % long_text.strip()
        conversation = promo_rack.conversation_from_screen(tall, "instagram")
        self.assertEqual([line["text"] for line in conversation["lines"]], [long_text.strip(), "ok"])
        comments = (
            '<hierarchy><node text="" class="android.widget.FrameLayout" package="com.instagram.android" bounds="[0,0][1080,2400]">'
            '<node text="quiet.maple Our new night mode is out." class="android.widget.TextView" package="com.instagram.android" bounds="[60,300][900,380]" />'
            '<node text="sam.reads %s" class="android.widget.TextView" package="com.instagram.android" bounds="[60,400][900,1900]" />'
            '</node></hierarchy>'
        ) % long_text.strip()
        self.assertEqual(
            promo_rack.comments_from_screen(comments, "instagram", "quiet.maple"),
            [{"author": "sam.reads", "text": long_text.strip(), "thread": "Our new night mode is out."}],
        )
        # The same height on an iPhone is the app's own root, not a line.
        ios_tall = {"type": "XCUIElementTypeOther", "bounds": "[0,0][1170,2000]"}
        self.assertTrue(promo_rack.not_a_line(ios_tall, 2532))
        self.assertFalse(promo_rack.not_a_line({"class": "android.widget.TextView", "bounds": "[0,0][1080,2000]"}, 2400))

    def test_comments_leave_out_the_accounts_own_caption_which_names_the_post(self):
        comments = promo_rack.comments_from_screen(fixture(INSTAGRAM_FIXTURES, "comments.xml"), "instagram", "quiet.maple")
        self.assertEqual(comments, [
            {"author": "sam.reads", "text": "where do I find it?", "thread": "Our new night mode is out. #studytok"},
            {"author": "night_owl_99", "text": "love this, using it tonight", "thread": "Our new night mode is out. #studytok"},
        ])


class AppAlertsTest(unittest.TestCase):
    """File 06, parts 37 and 38: notifications say a message or a comment arrived, never what it says."""

    def test_each_apps_messages_and_comments_are_told_from_likes_and_reddit_replies(self):
        alerts = promo_rack.new_alerts(fixture(NOTIFICATION_FIXTURES, "dumpsys.txt"), collections.OrderedDict())
        self.assertEqual(alerts, [
            {"app": "instagram", "kind": "message"},
            {"app": "instagram", "kind": "comment"},
            {"app": "tiktok", "kind": "message"},
            {"app": "reddit", "kind": "message"},
        ])
        # Another phone app's texts are never read as one of these.
        self.assertNotIn("com.google.android.apps.messaging", [item["app"] for item in promo_rack.parse_app_notifications(fixture(NOTIFICATION_FIXTURES, "dumpsys.txt"))])

    def test_a_notification_is_reported_once_and_carries_no_words(self):
        seen = collections.OrderedDict()
        output = fixture(NOTIFICATION_FIXTURES, "dumpsys.txt")
        first = promo_rack.new_alerts(output, seen)
        self.assertEqual(promo_rack.new_alerts(output, seen), [])
        for alert in first:
            self.assertEqual(sorted(alert), ["app", "kind"])

    def test_a_check_in_carries_the_alerts_and_keeps_them_when_promo_did_not_hear(self):
        promo_rack.take_alerts("A1")
        promo_rack.keep_alerts("A1", [{"app": "instagram", "kind": "message"}])
        sent = []
        phones = [{"serial": "A1", "state": "device", "usb": "", "model": "", "android": ""}]

        def refuse(config, path, payload):
            sent.append(payload)
            raise promo_rack.CallFailed("down")

        with mock.patch.object(promo_rack, "list_phones", lambda: [dict(phone) for phone in phones]), \
                mock.patch.object(promo_rack, "take_reading", lambda serial: None), \
                mock.patch.object(promo_rack, "call", refuse):
            with self.assertRaises(promo_rack.CallFailed):
                promo_rack.check_in({})
        self.assertEqual(sent[0]["phones"][0]["alerts"], [{"app": "instagram", "kind": "message"}])
        self.assertEqual(promo_rack.take_alerts("A1"), [{"app": "instagram", "kind": "message"}])


def app_screen(package, texts):
    """A screen of the app's own lines, one under another."""
    nodes = "".join(
        '<node text="%s" package="%s" bounds="[60,%d][1040,%d]" />' % (text, package, 400 + index * 120, 480 + index * 120)
        for index, text in enumerate(texts)
    )
    return '<hierarchy><node text="" package="%s" bounds="[0,0][1080,2400]">%s</node></hierarchy>' % (package, nodes)


class ScriptedAppPhone(FakeDevice):
    """An app on a fake screen: one screen before the last button, another after."""

    def __init__(self, package, texts, last, after, clipboard=""):
        FakeDevice.__init__(self, texts)
        self.package, self.last, self.after, self.clipboard = package, last, after, clipboard
        self.before = sorted(texts)

    def dump_hierarchy(self):
        return app_screen(self.package, self.after if self.last in self.pressed else self.before)

    def __call__(self, **selector):
        # uiautomator2's textContains: the first line on screen holding the words.
        if "textContains" in selector:
            words = selector["textContains"]
            return FakeElement(self, {"text": next((text for text in sorted(self.texts) if words and words in text), words)})
        return FakeElement(self, selector)


class AppActionsTest(unittest.TestCase):
    """File 06, parts 33, 34, 37 and 38: the last button is pressed once in a real run and never in a rehearsal."""

    def run_action(self, handler, device, args, rehearse=False):
        sent = []
        home = tempfile.mkdtemp()
        walk = promo_rack.Walk("A1", rehearse=rehearse, connect=lambda serial: device)
        shell = lambda serial, command, timeout=30: sent.append(command) or ("Row: 0 _id=55" if "content query" in command else "")
        with mock.patch.object(promo_rack, "shell", shell), \
                mock.patch.object(promo_rack, "adb", lambda args, serial=None, timeout=30: sent.append(" ".join(args)) or ""), \
                mock.patch.object(promo_rack, "HOME", home), \
                mock.patch.object(promo_rack, "download_media", lambda url, fetch=None: (b"jpeg", ".jpg")), \
                mock.patch.object(promo_rack, "rehearsal_picture", lambda: (b"jpeg", ".jpg")), \
                mock.patch.object(promo_rack, "APP_FEED_AFTER_SECONDS", (0, 0)), \
                mock.patch.object(promo_rack, "APP_READ_FEED_SECONDS", (0, 0)), \
                mock.patch.object(promo_rack, "POST_LANDED_APP_SECONDS", 0.05), \
                mock.patch.object(promo_rack, "POST_LANDED_SECONDS", 0.05), \
                mock.patch.object(promo_rack, "go_home", lambda serial: None), \
                mock.patch("time.sleep"):
            try:
                return handler("A1", args, walk), sent
            except Exception as failure:  # Handed back with what was sent.
                return failure, sent

    def post_phone(self, after):
        return ScriptedAppPhone(
            promo_rack.INSTAGRAM,
            ["Feed", "Write a caption...", "Share", "Profile", "Photo at row 1, column 1", "More", "Copy link"],
            "Share",
            after,
            clipboard="https://www.instagram.com/p/ABC123/",
        )

    def test_a_real_post_types_the_caption_presses_share_once_and_reads_its_link(self):
        device = self.post_phone(["Your post has been shared"])
        result, sent = self.run_action(promo_rack.action_app_post("instagram"), device, {"mediaUrl": "https://media.example/a.jpg", "mediaKind": "photo", "caption": "Hi. Ok"})
        self.assertEqual(result, {"postUrl": "https://www.instagram.com/p/ABC123/"})
        self.assertEqual(device.pressed.count("Share"), 1)
        self.assertEqual(len([command for command in sent if command.startswith("input text")]), len("Hi. Ok"))
        self.assertTrue(any("android.intent.action.SEND" in command and "-p com.instagram.android" in command for command in sent))
        self.assertTrue(any(command.startswith("push ") and "/sdcard/DCIM/Camera/IMG_" in command for command in sent))

    def test_a_post_the_app_refuses_fails_without_a_second_press(self):
        device = self.post_phone(["Couldn't post. Try again."])
        failure, _ = self.run_action(promo_rack.action_app_post("instagram"), device, {"mediaUrl": "https://media.example/a.jpg", "mediaKind": "photo", "caption": "Hi"})
        self.assertIn("could not post", str(failure))
        self.assertEqual(device.pressed.count("Share"), 1)

    def test_a_post_that_never_says_posted_is_failed_and_not_pressed_again(self):
        device = self.post_phone(["Uploading"])
        failure, _ = self.run_action(promo_rack.action_app_post("instagram"), device, {"mediaUrl": "https://media.example/a.jpg", "mediaKind": "photo", "caption": "Hi"})
        self.assertIn("did not say it was posted", str(failure))
        self.assertEqual(device.pressed.count("Share"), 1)

    def test_a_rehearsed_post_finds_share_never_presses_it_and_deletes_its_picture(self):
        device = self.post_phone(["Your post has been shared"])
        result, sent = self.run_action(promo_rack.action_app_post("instagram"), device, {"mediaUrl": "", "mediaKind": "photo", "caption": ""}, rehearse=True)
        self.assertEqual(result, {"postUrl": ""})
        self.assertNotIn("Share", device.pressed)
        self.assertFalse([command for command in sent if command.startswith("input text")])
        self.assertTrue(any(command.startswith("rm -f '/sdcard/DCIM/Camera/") for command in sent))

    def test_a_reply_to_a_conversation_presses_send_once(self):
        device = ScriptedAppPhone(promo_rack.INSTAGRAM, ["Direct", "sam.reads", "Message...", "Send"], "Send", ["sam.reads", "Yes, offline too."])
        result, sent = self.run_action(
            promo_rack.action_app_reply("instagram"),
            device,
            {"kind": "message", "thread": "sam.reads", "author": "sam.reads", "quote": "does it work offline too?", "text": "Yes, offline too."},
        )
        self.assertEqual(result, {"sent": True})
        self.assertEqual(device.pressed.count("Send"), 1)
        self.assertEqual(len([command for command in sent if command.startswith("input text")]), len("Yes, offline too."))

    def test_a_conversation_is_found_by_its_whole_name(self):
        package = promo_rack.INSTAGRAM
        screen = app_screen(package, ["samantha_x", "ask sam about it", "sam", "Sam"])
        self.assertEqual(promo_rack.rows_named(screen, package, "samantha_x"), [(60, 400, 1040, 480)])
        # "sam" is two rows, so the answer goes to neither.
        self.assertEqual(len(promo_rack.rows_named(screen, package, "sam")), 2)
        self.assertEqual(promo_rack.rows_named(screen, package, "nobody"), [])

    def test_a_reply_with_two_conversations_of_one_name_sends_nothing(self):
        device = ScriptedAppPhone(promo_rack.INSTAGRAM, ["Direct", "sam", "Sam", "Message...", "Send"], "Send", ["Hi"])
        failure, sent = self.run_action(
            promo_rack.action_app_reply("instagram"),
            device,
            {"kind": "message", "thread": "sam", "author": "sam", "quote": "hey", "text": "Hi"},
        )
        self.assertIn("same name", str(failure))
        self.assertNotIn("Send", device.pressed)
        self.assertFalse([command for command in sent if command.startswith("input text")])

    def test_the_reply_pressed_is_the_one_under_the_comment(self):
        package = promo_rack.INSTAGRAM
        screen = app_screen(package, ["ana", "first comment", "Reply", "ben", "the one to answer", "Reply"])
        # Lines are 120 apart from 400: the second Reply is the sixth line.
        self.assertEqual(promo_rack.reply_under(screen, package, "the one to answer", 2400), (60, 1000, 1040, 1080))
        self.assertIsNone(promo_rack.reply_under(screen, package, "not there", 2400))
        far = app_screen(package, ["the one to answer"] + ["filler %d" % index for index in range(5)] + ["Reply"])
        self.assertIsNone(promo_rack.reply_under(far, package, "the one to answer", 2400))

    def test_words_left_in_the_box_are_not_an_answer_that_went_out(self):
        package = promo_rack.INSTAGRAM
        unsent = (
            '<hierarchy><node package="%s" text="thanks!" class="android.widget.TextView" bounds="[0,400][500,480]" />'
            '<node package="%s" text="thanks!" class="android.widget.EditText" bounds="[0,2200][1080,2300]" /></hierarchy>'
        ) % (package, package)
        sent = unsent.replace("android.widget.EditText", "android.widget.TextView")
        # "thanks!" said earlier in the chat counts once; the box never counts.
        self.assertEqual(promo_rack.times_shown(unsent, package, "thanks!"), 1)
        self.assertEqual(promo_rack.times_shown(sent, package, "thanks!"), 2)

    def test_the_notification_tapped_is_the_apps_and_of_the_kind_asked(self):
        shade = (
            '<hierarchy>'
            '<node package="com.android.systemui" text="TikTok" bounds="[0,100][1080,160]" />'
            '<node package="com.android.systemui" text="ana sent you a message" bounds="[0,160][1080,240]" />'
            '<node package="com.android.systemui" text="Instagram" bounds="[0,300][1080,360]" />'
            '<node package="com.android.systemui" text="ben liked your photo" bounds="[0,360][1080,440]" />'
            '<node package="com.android.systemui" text="cat commented: nice" bounds="[0,440][1080,520]" />'
            '<node package="com.android.systemui" text="are you open sunday?" bounds="[0,520][1080,600]" />'
            '</hierarchy>'
        )
        self.assertEqual(promo_rack.notification_for(shade, "instagram", "comment"), (0, 440, 1080, 520))
        # A direct message shows only its words: the first that is no like, follow or comment.
        self.assertEqual(promo_rack.notification_for(shade, "instagram", "message"), (0, 520, 1080, 600))
        self.assertEqual(promo_rack.notification_for(shade, "tiktok", "message"), (0, 160, 1080, 240))
        self.assertIsNone(promo_rack.notification_for(shade, "tiktok", "comment"))

    def test_the_oldest_remembered_notification_is_forgotten_first(self):
        seen = collections.OrderedDict()
        with mock.patch.object(promo_rack, "ALERT_KEEP", 2):
            for index in range(3):
                seen["mark %d" % index] = True
                promo_rack.new_alerts("", seen)
        self.assertEqual(list(seen), ["mark 1", "mark 2"])

    def test_a_rehearsed_reply_never_presses_send(self):
        device = ScriptedAppPhone(promo_rack.INSTAGRAM, ["Direct", "Message...", "Send"], "Send", [])
        result, _ = self.run_action(
            promo_rack.action_app_reply("instagram"),
            device,
            {"kind": "message", "thread": "", "author": "", "quote": "", "text": ""},
            rehearse=True,
        )
        # The fake inbox has no conversation row to open, so the rehearsal stops at the inbox.
        self.assertEqual(result, {"sent": False})
        self.assertNotIn("Send", device.pressed)

    def test_a_rehearsed_profile_change_finds_save_and_never_presses_it(self):
        device = ScriptedAppPhone(promo_rack.INSTAGRAM, ["Profile", "Edit profile", "Bio", "Done"], "Done", [])
        device.texts.add("")  # The bio's box, found by its kind rather than its words.
        device.before = ["quiet.maple"]
        with mock.patch.object(promo_rack, "profile_handle", lambda hierarchy, app: "quiet.maple"):
            result, sent = self.run_action(promo_rack.action_app_profile("instagram"), device, {}, rehearse=True)
        self.assertEqual(result, {"applied": [], "bioAfter": None})
        self.assertNotIn("Done", device.pressed)
        self.assertFalse([command for command in sent if command.startswith("input text")])

    def test_a_real_bio_change_presses_save_once_and_reads_it_back(self):
        device = ScriptedAppPhone(promo_rack.INSTAGRAM, ["Profile", "Edit profile", "Bio", "Done"], "Done", ["quiet.maple", "Night timers."])
        device.texts.add("")
        with mock.patch.object(promo_rack, "profile_handle", lambda hierarchy, app: "quiet.maple"):
            result, sent = self.run_action(
                promo_rack.action_app_profile("instagram"),
                device,
                {"displayName": None, "bio": "Night timers.", "link": None, "pictureUrl": None},
            )
        self.assertEqual(result, {"applied": ["bio"], "bioAfter": "Night timers."})
        self.assertEqual(device.pressed.count("Done"), 1)

    def test_a_file_is_only_fetched_from_https_and_only_a_photo_or_video(self):
        with self.assertRaises(RuntimeError):
            promo_rack.download_media("http://media.example/a.jpg", fetch=lambda url: b"x")
        with self.assertRaises(RuntimeError):
            promo_rack.download_media("https://media.example/a.exe", fetch=lambda url: b"x")
        with self.assertRaises(RuntimeError):
            promo_rack.download_media("https://media.example/a.mp4", fetch=lambda url: b"")
        self.assertEqual(promo_rack.download_media("https://media.example/a.MP4?v=1", fetch=lambda url: b"x"), (b"x", ".mp4"))
        self.assertTrue(promo_rack.camera_name(".mp4", 1_800_000_000).startswith("VID_"))

    def test_instagram_and_tiktok_actions_are_known_and_rehearsed(self):
        for app in ("instagram", "tiktok"):
            for step in ("health", "profile", "post", "inbox", "reply"):
                self.assertIn("%s/%s" % (app, step), promo_rack.REHEARSALS)
                self.assertIn("%s/%s" % (app, step), promo_rack.ACTIONS)
            self.assertIn("%s/quick_state" % app, promo_rack.ACTIONS)
        for name in ("reddit/inbox", "reddit/reply_message"):
            self.assertIn(name, promo_rack.ACTIONS)
            self.assertIn(name, promo_rack.REHEARSALS)


class MediumAppTest(unittest.TestCase):
    """Medium task, part 42: a response in the Medium app is typed and Respond pressed once in a real run, never in a rehearsal."""

    # The same stand-in phone and patched waits the Instagram and TikTok steps run under.
    run_action = AppActionsTest.run_action

    def medium_phone(self, after):
        return ScriptedAppPhone(promo_rack.MEDIUM, ["Home", "Responses", "What are your thoughts?", "Respond"], "Respond", after)

    def test_a_real_response_opens_the_story_types_and_presses_respond_once(self):
        device = self.medium_phone(["Responses", "Hi. Ok"])
        result, sent = self.run_action(promo_rack.action_medium_respond, device, {"storyId": "4bad19bc09ae", "text": "Hi. Ok", "line": "", "tags": []})
        self.assertEqual((result["responseId"], result["responseUrl"]), ("", ""))
        self.assertEqual(device.pressed.count("Respond"), 1)
        self.assertTrue(any("-d 'https://medium.com/p/4bad19bc09ae' -p com.medium.reader" in command for command in sent))
        self.assertEqual(len([command for command in sent if command.startswith("input text")]), len("Hi. Ok"))

    def test_a_response_that_never_shows_is_failed_without_a_second_press(self):
        device = self.medium_phone(["Responses"])
        failure, _ = self.run_action(promo_rack.action_medium_respond, device, {"storyId": "4bad19bc09ae", "text": "Hi", "line": "", "tags": []})
        self.assertIn("did not show", str(failure))
        self.assertIn("may already be on Medium", str(failure))
        self.assertEqual(device.pressed.count("Respond"), 1)

    def test_a_rehearsal_types_nothing_and_never_presses_respond(self):
        device = self.medium_phone(["Responses"])
        result, sent = self.run_action(promo_rack.action_medium_respond, device, {"storyId": "4bad19bc09ae", "text": "", "line": "", "tags": []}, rehearse=True)
        self.assertEqual(result, {"responseId": "", "responseUrl": ""})
        self.assertNotIn("Respond", device.pressed)
        self.assertFalse([command for command in sent if command.startswith("input text")])

    def test_a_highlighted_line_is_refused_before_anything_opens(self):
        device = self.medium_phone(["Responses"])
        failure, sent = self.run_action(promo_rack.action_medium_respond, device, {"storyId": "4bad19bc09ae", "text": "Hi", "line": "A line.", "tags": []})
        self.assertIn("done in a browser", str(failure))
        self.assertEqual(sent, [])

    def test_medium_actions_are_registered_and_rehearsed(self):
        for name in ("medium/state", "medium/quick_state", "medium/respond", "medium/warm_up"):
            self.assertIn(name, promo_rack.ACTIONS)
        for name in ("medium/state", "medium/respond"):
            self.assertIn(name, promo_rack.REHEARSALS)
        self.assertEqual(promo_rack.APP_PACKAGES["medium"], "com.medium.reader")


class LauncherRollbackTest(unittest.TestCase):
    """A new version that stops before checking in is rolled back by itself."""

    def test_broken_version_goes_back_to_the_last_good_one(self):
        with tempfile.TemporaryDirectory() as home:
            good = os.path.join(home, "versions", "1.0.0")
            os.makedirs(good)
            # The good version only sleeps: it stands in for a program that
            # runs and never exits on its own.
            with open(os.path.join(good, "promo_rack.py"), "w") as handle:
                handle.write('VERSION = "1.0.0"\nimport time\ntime.sleep(5)\n')
            with open(os.path.join(home, "state.json"), "w") as handle:
                json.dump({"current": "1.0.0", "checkedIn": "1.0.0"}, handle)

            environment = dict(os.environ, PROMO_RACK_HOME=home)
            launcher = os.path.join(HERE, "launcher.py")
            subprocess.run([sys.executable, launcher, "selftest-rollback"], env=environment, check=True, capture_output=True)
            with open(os.path.join(home, "state.json")) as handle:
                self.assertEqual(json.load(handle)["current"], "0.0.0-broken")

            process = subprocess.Popen(
                [sys.executable, launcher, "run"], env=environment, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL
            )
            try:
                deadline = time.time() + 20
                state = {}
                while time.time() < deadline:
                    with open(os.path.join(home, "state.json")) as handle:
                        state = json.load(handle)
                    if state.get("current") == "1.0.0":
                        break
                    time.sleep(0.5)
            finally:
                process.terminate()
                process.wait(timeout=10)

            self.assertEqual(state.get("current"), "1.0.0")
            self.assertIn("0.0.0-broken", state.get("failed", []))
            self.assertEqual(state["rolledBack"]["from"], "0.0.0-broken")
            self.assertEqual(state["rolledBack"]["to"], "1.0.0")
            self.assertIn("before it checked in", state["rolledBack"]["why"])

    def test_new_version_that_never_checks_in_is_stopped_and_rolled_back(self):
        with tempfile.TemporaryDirectory() as home:
            for version, body in (("1.0.0", "time.sleep(5)"), ("2.0.0", "time.sleep(600)")):
                folder = os.path.join(home, "versions", version)
                os.makedirs(folder)
                with open(os.path.join(folder, "promo_rack.py"), "w") as handle:
                    handle.write('VERSION = "%s"\nimport time\n%s\n' % (version, body))
            with open(os.path.join(home, "state.json"), "w") as handle:
                json.dump({
                    "current": "2.0.0",
                    "previous": "1.0.0",
                    "pending": {"version": "2.0.0", "since": time.time()},
                }, handle)

            # The two minutes, shortened to three seconds for the test only.
            script = "import sys; sys.path.insert(0, %r); import launcher; launcher.CHECK_IN_GRACE_SECONDS = 3; launcher.run()" % HERE
            process = subprocess.Popen(
                [sys.executable, "-c", script],
                env=dict(os.environ, PROMO_RACK_HOME=home),
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
            )
            try:
                deadline = time.time() + 30
                state = {}
                while time.time() < deadline:
                    with open(os.path.join(home, "state.json")) as handle:
                        state = json.load(handle)
                    if state.get("current") == "1.0.0":
                        break
                    time.sleep(0.5)
            finally:
                process.terminate()
                process.wait(timeout=10)

            self.assertEqual(state.get("current"), "1.0.0")
            self.assertEqual(state["rolledBack"]["why"], "did not check in within two minutes")
            self.assertIn("2.0.0", state["failed"])


# ---------------------------------------------------------------------------
# iPhones (phone farm file 08 and parts 57 and 61). The driver is stood in
# for; a real iPhone on the rack is the only proof the driver itself works.

import iphone  # noqa: E402

IPHONE = "00008030-000A1B2C3D4E5F67"

ABOUT_SCREEN = """<hierarchy><node text="" type="XCUIElementTypeTable" bounds="[0,0][1170,2532]">
  <node text="" type="XCUIElementTypeCell" bounds="[0,300][1170,420]">
    <node text="Name" label="Name" type="XCUIElementTypeStaticText" bounds="[40,330][300,390]" />
    <node text="Tyler's iPhone" label="Tyler's iPhone" type="XCUIElementTypeStaticText" bounds="[600,330][1130,390]" />
  </node>
  <node text="" type="XCUIElementTypeCell" bounds="[0,420][1170,540]">
    <node text="iOS Version" label="iOS Version" type="XCUIElementTypeStaticText" bounds="[40,450][400,510]" />
    <node text="17.6.1" label="17.6.1" type="XCUIElementTypeStaticText" bounds="[700,450][1130,510]" />
  </node>
  <node text="" type="XCUIElementTypeCell" bounds="[0,540][1170,660]">
    <node text="Model Name" label="Model Name" type="XCUIElementTypeStaticText" bounds="[40,570][400,630]" />
    <node text="iPhone 12" label="iPhone 12" type="XCUIElementTypeStaticText" bounds="[700,570][1130,630]" />
  </node></node></hierarchy>"""

MESSAGES_SCREEN = """<hierarchy><node text="" type="XCUIElementTypeTable" bounds="[0,0][1170,2532]">
  <node text="" type="XCUIElementTypeCell" bounds="[0,300][1170,500]">
    <node text="Reddit" label="Reddit" type="XCUIElementTypeStaticText" bounds="[40,330][300,390]" />
    <node text="Now" label="Now" type="XCUIElementTypeStaticText" bounds="[900,330][1130,390]" />
    <node text="Your Reddit code is 482913. Don't share it." label="Your Reddit code is 482913. Don't share it." type="XCUIElementTypeStaticText" bounds="[40,400][1130,480]" />
  </node>
  <node text="" type="XCUIElementTypeCell" bounds="[0,500][1170,700]">
    <node text="Mum" label="Mum" type="XCUIElementTypeStaticText" bounds="[40,530][300,590]" />
    <node text="Yesterday" label="Yesterday" type="XCUIElementTypeStaticText" bounds="[900,530][1130,590]" />
    <node text="Call me on 555123456" label="Call me on 555123456" type="XCUIElementTypeStaticText" bounds="[40,600][1130,680]" />
  </node></node></hierarchy>"""


class FakeIphoneElement(object):
    def __init__(self, screen, selector):
        self.screen, self.selector = screen, selector

    @property
    def label(self):
        return self.selector.get("text", "")

    @property
    def exists(self):
        return self.label in self.screen.texts

    @property
    def info(self):
        return {"bounds": {"left": 100, "top": 500, "right": 1000, "bottom": 620}, "text": self.label}

    def wait(self, timeout=10):
        return self.exists

    def click(self):
        self.screen.calls.append(("element_click", self.label))


class FakeIphoneScreen(object):
    """A stand-in for iphone.IphoneScreen that writes down every call."""

    def __init__(self, udid, texts=(), hierarchy=""):
        self.udid, self.texts, self.hierarchy, self.calls = udid, set(texts), hierarchy, []
        self.alive, self.front = True, ""

    def __call__(self, **selector):
        return FakeIphoneElement(self, selector)

    def answers(self):
        self.calls.append(("answers",))
        return self.alive

    def active_app(self):
        return self.front

    def click(self, x, y):
        self.calls.append(("click", x, y))

    def swipe(self, x1, y1, x2, y2, duration=0.3):
        self.calls.append(("swipe", x1, y1, x2, y2))

    def screenshot(self):
        return FakeImage()

    def dump_hierarchy(self):
        return self.hierarchy

    def window_size(self):
        return 1170, 2532

    def press(self, key):
        self.calls.append(("press", key))

    def screen_on(self):
        self.calls.append(("screen_on",))

    def app_start(self, bundle_id):
        self.calls.append(("app_start", bundle_id))

    def app_stop(self, bundle_id):
        self.calls.append(("app_stop", bundle_id))

    def open_url(self, url):
        self.calls.append(("open_url", url))

    def send_keys(self, text, clear=False):
        self.calls.append(("send_keys", text))


def no_adb(*args, **kwargs):
    raise AssertionError("adb was called for an iPhone: %r" % (args,))


IOS_FIXTURES = os.path.join(HERE, "fixtures", "ios")
IOS_SETTINGS = promo_rack.IOS_SETTINGS


def ios_tree(bundle, *items, **options):
    """An iPhone screen the way the driver converts one: the items given, one
    under another from 500 pixels down, each (type, label) or (type, label,
    value), or ("Cell", [lines]) where a line is words or a (type, label,
    value) tuple. The container is a table, or a web view with web=True."""
    from xml.sax.saxutils import quoteattr

    def node(kind, label="", value="", name="", bounds=(40, 0, 1130, 0), inner="", scrollable=False):
        name = name or (label if kind in ("NavigationBar", "Switch", "Button") else "")
        checkable = kind in ("Switch", "CheckBox", "RadioButton")
        return (
            '<node text=%s label=%s name=%s value=%s type="XCUIElementType%s" class="XCUIElementType%s" package=%s '
            'content-desc=%s checkable="%s" checked="%s" scrollable="%s" enabled="true" visible="true" bounds="[%d,%d][%d,%d]">%s</node>'
        ) % (
            quoteattr(label or value or name), quoteattr(label), quoteattr(name), quoteattr(value), kind, kind, quoteattr(bundle),
            quoteattr(label), "true" if checkable else "false",
            "true" if checkable and value in ("1", "true", "on") else "false", "true" if scrollable else "false",
            bounds[0], bounds[1], bounds[2], bounds[3], inner,
        )

    rows = []
    top = 500
    for item in items:
        kind, rest = item[0], item[1:]
        if kind == "Cell":
            lines = rest[0]
            inner = ""
            for index, line in enumerate(lines):
                line = ("StaticText", line, "") if isinstance(line, str) else line
                inner += node(line[0], line[1], line[2] if len(line) > 2 else "", bounds=(40, top + index * 45, 1130, top + index * 45 + 40))
            height = 45 * len(lines) + 10
            rows.append(node("Cell", bounds=(40, top, 1130, top + height), inner=inner))
            top += height + 20
        elif kind == "NavigationBar":
            # The title bar sits at the top of the screen, whatever its place in the list.
            rows.append(node(kind, rest[0], bounds=(0, 100, 1170, 200)))
        else:
            rows.append(node(kind, rest[0], rest[1] if len(rest) > 1 else "", bounds=(40, top, 1130, top + 100)))
            top += 120
    holder = "WebView" if options.get("web") else "Table"
    return '<hierarchy>%s</hierarchy>' % node(
        "Application", name=bundle, bounds=(0, 0, 1170, 2532),
        inner=node(holder, bounds=(0, 200, 1170, 2532), inner="".join(rows), scrollable=not options.get("web")),
    )


class TreeIphoneElement(object):
    """An element found the way the driver finds one: iphone.matches on the tree."""

    def __init__(self, screen, selector):
        self.screen, self.selector = screen, selector

    def _node(self):
        found = iphone.find_nodes(iphone.nodes_of(self.screen.hierarchy), self.selector)
        return found[0] if found else None

    @property
    def exists(self):
        return self._node() is not None

    def wait(self, timeout=10):
        return self.exists

    @property
    def info(self):
        node = self._node()
        if node is None:
            raise AssertionError("Nothing matches %r" % (self.selector,))
        return {"bounds": iphone.parse_bounds(node.get("bounds")), "text": node.get("text", "")}

    def click(self):
        bounds = self.info["bounds"]
        self.screen.click((bounds["left"] + bounds["right"]) // 2, (bounds["top"] + bounds["bottom"]) // 2)

    def clear_text(self):
        pass

    @property
    def scroll(self):
        screen = self.screen

        class Scroll(object):
            def forward(self, steps=None):
                screen.calls.append(("scroll",))

        return Scroll()


class TreeIphone(FakeIphoneScreen):
    """An iPhone whose screen is a tree read with the driver's own matcher.
    `pages` maps a word to a screen: pressing a line with that word, opening
    an app with that bundle id, opening that address, or holding a thumb
    ("hold") turns to that page."""

    def __init__(self, udid, pages, start, clipboard=""):
        FakeIphoneScreen.__init__(self, udid)
        self.pages, self.hierarchy, self.pressed, self.clipboard = pages, pages[start], [], clipboard

    def __call__(self, **selector):
        return TreeIphoneElement(self, selector)

    def _turn_to(self, key):
        if key in self.pages:
            self.hierarchy = self.pages[key]

    def click(self, x, y):
        self.calls.append(("click", x, y))
        chain = []
        for node in iphone.nodes_of(self.hierarchy):
            bounds = iphone.parse_bounds(node.get("bounds"))
            if bounds["left"] <= x < bounds["right"] and bounds["top"] <= y < bounds["bottom"]:
                chain.append(node)
        # The holders (the app, its table) are not lines a thumb pressed.
        chain = [node for node in chain if node.get("type") not in ("XCUIElementTypeApplication", "XCUIElementTypeTable", "XCUIElementTypeWebView")]
        root = ElementTree.fromstring(self.hierarchy)

        def lines_of(node):
            """The node's own words, then its lines': a tap between a cell's
            two lines still presses the cell, whose first line names it."""
            candidates = [node.get("text")]
            for element in root.iter("node"):
                if element.get("bounds") == node.get("bounds") and element.get("type") == node.get("type"):
                    candidates += [child.get("text") for child in element.iter("node") if child.get("text")]
                    break
            return [text for text in candidates if text]

        words = next((text for node in reversed(chain) for text in lines_of(node)[:1]), "")
        self.pressed.append(words)
        # The deepest line's words name the page, else its cell's first line.
        for node in reversed(chain):
            page = next((text for text in lines_of(node) if text in self.pages), None)
            if page:
                self._turn_to(page)
                return

    def swipe(self, x1, y1, x2, y2, duration=0.3):
        self.calls.append(("swipe", x1, y1, x2, y2, duration))
        if (x1, y1) == (x2, y2):
            self._turn_to("hold")

    def app_start(self, bundle_id):
        self.calls.append(("app_start", bundle_id))
        self._turn_to(bundle_id)

    def open_url(self, url):
        self.calls.append(("open_url", url))
        self._turn_to(url)


class IphoneTest(unittest.TestCase):
    def setUp(self):
        promo_rack._KINDS.clear()
        promo_rack._PROPS.clear()
        promo_rack._IPHONE_SCREENS.clear()
        promo_rack._IPHONE_WARNED.clear()
        promo_rack._RUNNING_SERIALS.clear()
        self.screen = FakeIphoneScreen(IPHONE)
        promo_rack._KINDS[IPHONE] = "iphone"
        promo_rack._IPHONE_SCREENS[IPHONE] = self.screen

    def tearDown(self):
        promo_rack._KINDS.clear()
        promo_rack._IPHONE_SCREENS.clear()
        promo_rack._IPHONE_WARNED.clear()
        promo_rack._RUNNING_SERIALS.clear()

    ADB_LIST = "List of devices attached\n35091FDH2000A1 device usb:1-1.2 model:Pixel_8a\n"

    def test_the_list_merges_iphones_after_the_androids(self):
        listed = [{"serial": IPHONE, "state": "device", "usb": "", "model": "iPhone 12", "android": "17.6.1", "timezone": "America/Toronto", "kind": "iphone"}]
        props = {"ro.product.model": "Pixel 8a", "ro.build.version.release": "16", "persist.sys.timezone": "America/Toronto"}
        with mock.patch.object(promo_rack, "adb", lambda args, serial=None, timeout=30: self.ADB_LIST), \
                mock.patch.object(promo_rack, "shell", lambda serial, command, timeout=30: props[command.split()[-1]]), \
                mock.patch.object(iphone, "list_iphones", lambda: listed):
            phones = promo_rack.list_phones()
        self.assertEqual([(phone["serial"], phone["kind"], phone["android"]) for phone in phones], [
            ("35091FDH2000A1", "android", "16"),
            (IPHONE, "iphone", "17.6.1"),
        ])
        self.assertTrue(promo_rack.is_iphone(IPHONE))
        self.assertFalse(promo_rack.is_iphone("35091FDH2000A1"))
        self.assertEqual(promo_rack.iphone_system_version(IPHONE), "17.6.1")

    def test_a_driver_that_fails_leaves_the_androids_listed_and_is_logged_once(self):
        def broken():
            raise RuntimeError("pymobiledevice3 is not installed")

        logged = []
        with mock.patch.object(promo_rack, "adb", lambda args, serial=None, timeout=30: self.ADB_LIST), \
                mock.patch.object(promo_rack, "shell", lambda serial, command, timeout=30: "x"), \
                mock.patch.object(promo_rack, "log", logged.append), \
                mock.patch.object(iphone, "list_iphones", broken):
            first = promo_rack.list_phones()
            second = promo_rack.list_phones()
        self.assertEqual([phone["serial"] for phone in first], ["35091FDH2000A1"])
        self.assertEqual(len(second), 1)
        self.assertEqual(len([line for line in logged if "could not list iPhones" in line]), 1)
        self.assertIn("pymobiledevice3 is not installed", logged[0])

    def test_no_driver_file_is_no_iphones_and_no_wda_date(self):
        with mock.patch.object(promo_rack, "iphone", None), mock.patch.object(promo_rack, "log", lambda words: None):
            self.assertEqual(promo_rack.list_iphones_safely(), [])
            self.assertIsNone(promo_rack.wda_expires_at())
            with self.assertRaises(RuntimeError):
                promo_rack.connect_screen(IPHONE)

    def test_the_check_in_carries_each_phones_kind_and_when_wda_runs_out(self):
        sent = []
        phones = [
            {"serial": "A1", "state": "device", "usb": "", "model": "", "android": "16", "kind": "android"},
            {"serial": IPHONE, "state": "device", "usb": "", "model": "iPhone 12", "android": "17.6.1", "kind": "iphone"},
        ]

        def answer(config, path, payload):
            sent.append(payload)
            return {}

        with mock.patch.object(promo_rack, "list_phones", lambda: [dict(phone) for phone in phones]), \
                mock.patch.object(promo_rack, "take_reading", lambda serial: None), \
                mock.patch.object(promo_rack, "load_state", lambda: {"checkedIn": promo_rack.VERSION}), \
                mock.patch.object(promo_rack, "call", answer), \
                mock.patch.object(iphone, "wda_expires_at", lambda: "2026-10-25T14:00:00+00:00"):
            promo_rack.check_in({})
        self.assertEqual([phone["kind"] for phone in sent[0]["phones"]], ["android", "iphone"])
        self.assertEqual(sent[0]["wdaExpiresAt"], "2026-10-25T14:00:00+00:00")

    def test_the_screen_routes_to_the_driver_and_never_adb(self):
        with mock.patch.object(promo_rack, "shell", no_adb), mock.patch.object(promo_rack, "adb", no_adb), \
                mock.patch.object(promo_rack.time, "sleep", lambda seconds: None):
            self.assertIs(promo_rack.connect_screen(IPHONE), self.screen)
            promo_rack.go_home(IPHONE)
            promo_rack.go_back(IPHONE)
            promo_rack.open_app(IPHONE, "reddit")
            promo_rack.open_link(IPHONE, "instagram", "https://www.instagram.com/p/abc/")
            promo_rack.type_like_a_person(IPHONE, self.screen, "hi\n")
            promo_rack.swipe_like_a_person(IPHONE, self.screen, 500, 1800, 500, 600)
            promo_rack.reopen_app(IPHONE, "com.reddit.Reddit")
            self.assertEqual(promo_rack.close_not_responding(IPHONE, "reddit/comment"), "")
        self.assertEqual(self.screen.calls[:7], [
            ("press", "home"),
            ("press", "back"),
            ("app_start", "com.reddit.Reddit"),
            ("open_url", "https://www.instagram.com/p/abc/"),
            ("send_keys", "h"),
            ("send_keys", "i"),
            ("press", "enter"),
        ])
        self.assertEqual(self.screen.calls[7][:1], ("swipe",))
        self.assertEqual(self.screen.calls[8:], [("app_stop", "com.reddit.Reddit"), ("app_start", "com.reddit.Reddit")])
        self.assertEqual(promo_rack.package_for(IPHONE, "tiktok"), "com.zhiliaoapp.musically")
        self.screen.front = "com.reddit.Reddit"
        with mock.patch.object(promo_rack, "shell", no_adb):
            self.assertEqual(promo_rack.foreground_package(IPHONE), "com.reddit.Reddit")

    def test_a_frozen_iphone_is_one_whose_driver_does_not_answer_right_now(self):
        with mock.patch.object(promo_rack, "shell", no_adb):
            self.assertTrue(promo_rack.phone_answers(IPHONE))
            self.screen.alive = False
            self.assertFalse(promo_rack.phone_answers(IPHONE))
        # Each answer was asked for live, never remembered from the time before.
        self.assertEqual(self.screen.calls, [("answers",), ("answers",)])
        self.assertEqual(promo_rack.package_for("A1", "reddit"), "com.reddit.frontpage")
        self.assertEqual(promo_rack.action_package("phone/android-version", IPHONE), "com.apple.Preferences")

    def test_the_ios_version_is_read_beside_its_label(self):
        self.assertEqual(promo_rack.ios_version_beside_label(ABOUT_SCREEN), "17.6.1")
        one_label = '<hierarchy><node text="iOS Version, 18.0.1" label="iOS Version, 18.0.1" type="XCUIElementTypeCell" /></hierarchy>'
        self.assertEqual(promo_rack.ios_version_beside_label(one_label), "18.0.1")
        self.assertIsNone(promo_rack.ios_version_beside_label('<hierarchy><node text="General" /></hierarchy>'))

    def test_android_version_on_an_iphone_walks_settings_and_checks_the_phone(self):
        self.screen.texts = {"General", "About"}
        self.screen.hierarchy = ABOUT_SCREEN
        promo_rack._PROPS[IPHONE] = {"model": "iPhone 12", "android": "17.6.1", "timezone": ""}
        walk = promo_rack.Walk(IPHONE, connect=lambda serial: self.screen)
        with mock.patch.object(promo_rack, "shell", no_adb), mock.patch.object(promo_rack.time, "sleep", lambda seconds: None):
            result = promo_rack.action_android_version(IPHONE, {}, walk)
        self.assertEqual(result, {"fromScreen": "17.6.1", "fromSystem": "17.6.1", "match": True, "kind": "iphone"})
        self.assertEqual(self.screen.calls[0], ("screen_on",))
        self.assertEqual(self.screen.calls[1], ("app_start", "com.apple.Preferences"))
        self.assertEqual([call for call in self.screen.calls if call[0] == "click"].__len__(), 2)
        self.assertEqual(self.screen.calls[-1], ("press", "home"))
        self.assertEqual([step for step, _ in walk.steps], ["Opened Settings", "Open General", "Open About", "Read iOS 17.6.1"])

    def test_health_and_the_minute_reading_come_from_the_driver_with_no_signal_guessed(self):
        raw = {"batteryPercent": 64, "temperatureC": 31.5, "storageUsedPercent": 41, "signal": "not_reported", "upSeconds": 5000, "apps": None}
        state = {"read_at": {}, "apps_at": {}, "missed": {}, "alerts": {}}
        listed = [{"serial": IPHONE, "state": "device", "kind": "iphone", "model": "iPhone 12", "android": "17.6.1"}]
        promo_rack._VITALS.clear()
        with mock.patch.object(promo_rack, "adb", lambda args, serial=None, timeout=30: "List of devices attached\n"), \
                mock.patch.object(promo_rack, "shell", no_adb), \
                mock.patch.object(iphone, "list_iphones", lambda: listed), \
                mock.patch.object(iphone, "app_versions", lambda udid: {"reddit": "2025.40.0"}), \
                mock.patch.object(iphone, "vitals", lambda udid: dict(raw)):
            promo_rack.vitals_turn(state, now=1000)
            reading = promo_rack.take_reading(IPHONE)
            health = promo_rack.action_health(IPHONE, {}, None)
        self.assertEqual(reading, dict(raw, restartWhy="", apps={"reddit": "2025.40.0"}))
        self.assertEqual(state["alerts"], {})
        # A driver that could not read the versions says None, which is "not read", never an empty list of apps.
        with mock.patch.object(iphone, "app_versions", lambda udid: None):
            self.assertIsNone(promo_rack.iphone_app_versions(IPHONE))
        self.assertEqual((health["batteryPercent"], health["signal"], health["upHours"], health["kind"]), (64, "not_reported", 1.4, "iphone"))

    def test_the_windows_taps_go_through_the_driver(self):
        with mock.patch.object(promo_rack, "shell", no_adb):
            promo_rack.apply_input(IPHONE, {"kind": "tap", "x": 0.5, "y": 0.25}, (1170, 2532))
            promo_rack.apply_input(IPHONE, {"kind": "swipe", "x1": 0.5, "y1": 0.8, "x2": 0.5, "y2": 0.2}, (1170, 2532))
            promo_rack.apply_input(IPHONE, {"kind": "text", "text": "hello"}, (1170, 2532))
            promo_rack.apply_input(IPHONE, {"kind": "key", "key": "back"}, (1170, 2532))
            promo_rack.apply_input(IPHONE, {"kind": "key", "key": "reboot"}, (1170, 2532))
        self.assertEqual(self.screen.calls, [
            ("click", 585, 633),
            ("swipe", 585, 2026, 585, 506),
            ("send_keys", "hello"),
            ("press", "back"),
        ])

    def test_a_texted_code_is_read_off_messages_and_the_phone_goes_home(self):
        self.screen.hierarchy = MESSAGES_SCREEN
        now_ms = int(time.time() * 1000)
        self.assertEqual(promo_rack.messages_from_ios_screen(MESSAGES_SCREEN, now_ms)[0][:2], ("Reddit", "Your Reddit code is 482913. Don't share it."))
        self.assertEqual(len(promo_rack.messages_from_ios_screen(MESSAGES_SCREEN, now_ms)), 1)
        with mock.patch.object(promo_rack, "shell", no_adb), mock.patch.object(promo_rack.time, "sleep", lambda seconds: None):
            self.assertEqual(promo_rack.read_texted_code(IPHONE), {"code": "482913", "from": "Reddit"})
        self.assertEqual(self.screen.calls, [("app_start", "com.apple.MobileSMS"), ("press", "home")])

    def test_a_clock_time_later_than_now_is_yesterdays(self):
        local = lambda seconds: time.struct_time((2026, 10, 18, 9, 41, 0, 6, 291, -1))
        now_ms = int(time.mktime((2026, 10, 18, 9, 41, 0, 0, 0, -1)) * 1000)
        self.assertEqual(promo_rack.ios_row_time_ms("Now", now_ms, local), now_ms)
        self.assertEqual(promo_rack.ios_row_time_ms("9:35 AM", now_ms, local), now_ms - 6 * 60 * 1000)
        self.assertEqual(promo_rack.ios_row_time_ms("9:50 AM", now_ms, local), now_ms + 9 * 60 * 1000 - 24 * 3600 * 1000)

    def test_messages_is_never_opened_while_an_action_runs_or_with_control_off(self):
        self.screen.hierarchy = MESSAGES_SCREEN
        promo_rack._RUNNING_SERIALS[IPHONE] = 1
        with mock.patch.object(promo_rack, "shell", no_adb):
            self.assertIsNone(promo_rack.read_texted_code(IPHONE))
        self.assertEqual(self.screen.calls, [])
        promo_rack._RUNNING_SERIALS.clear()
        now = time.time()
        self.assertFalse(promo_rack.may_read_texts(IPHONE, {}, now))
        self.assertTrue(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 60}, now))
        self.assertFalse(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 16 * 60}, now))
        self.assertTrue(promo_rack.may_read_texts("A1", {}, now))
        # Promo's own word on who has control outranks the tap reading, either way.
        self.assertTrue(promo_rack.may_read_texts(IPHONE, {}, now, control=[IPHONE]))
        self.assertFalse(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 60}, now, control=[]))
        # A tap or key in the last 20 seconds means someone is driving the phone, so
        # Messages is left alone even with control on; an Android's inbox needs no screen.
        self.assertFalse(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 5}, now, control=[IPHONE]))
        self.assertFalse(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 19}, now))
        self.assertTrue(promo_rack.may_read_texts(IPHONE, {IPHONE: now - 21}, now, control=[IPHONE]))
        self.assertTrue(promo_rack.may_read_texts("A1", {"A1": now - 5}, now))
        # A turn with the window open and control off takes the picture and leaves Messages alone.
        state = {"wanted": [IPHONE], "devices": {}, "sizes": {}, "texts_read_at": {}, "warned": set()}
        sent = []

        def fake_call(config, path, payload):
            sent.append(payload)
            return {"wanted": [IPHONE], "inputs": {}}

        with mock.patch.object(promo_rack, "call", fake_call), mock.patch.object(promo_rack, "shell", no_adb):
            promo_rack.screen_turn({}, state)
        self.assertEqual(sent[0]["texts"], [])
        self.assertEqual([frame["lane"] for frame in sent[0]["frames"]], ["window"])
        self.assertEqual(self.screen.calls, [])
        # An older Promo names nobody: the reply had no control list.
        self.assertIsNone(state["control"])
        # A reply that names the phone lets the next turn read Messages, no tap needed.
        state["texts_read_at"] = {}
        with mock.patch.object(promo_rack, "call", lambda config, path, payload: sent.append(payload) or {"wanted": [IPHONE], "control": [IPHONE], "inputs": {}}), \
                mock.patch.object(promo_rack, "shell", no_adb), mock.patch.object(promo_rack.time, "sleep", lambda seconds: None):
            promo_rack.screen_turn({}, state)
            promo_rack.screen_turn({}, state)
        self.assertEqual(state["control"], [IPHONE])
        self.assertEqual(sent[-1]["texts"], [{"code": "482913", "from": "Reddit", "serial": IPHONE}])
        self.assertEqual(self.screen.calls, [("app_start", "com.apple.MobileSMS"), ("press", "home")])

    def test_the_wall_gets_a_small_picture_every_five_seconds_beside_the_window(self):
        sent = []
        android = FakeDevice([])
        resized = []

        class WideImage(FakeImage):
            width, height = 1080, 2400

            def resize(self, size):
                resized.append(size)
                return self

        android.screenshot = lambda: WideImage()
        self.screen.screenshot = lambda: WideImage()

        def fake_call(config, path, payload):
            sent.append(payload)
            return {"wanted": ["A1"], "wall": ["A1", IPHONE], "inputs": {}}

        state = {"wanted": ["A1"], "wall": ["A1", IPHONE], "devices": {"A1": android}, "sizes": {}, "texts_read_at": {"A1": time.time()}, "warned": set()}
        with mock.patch.object(promo_rack, "call", fake_call), mock.patch.object(promo_rack, "shell", no_adb):
            gap = promo_rack.screen_turn({}, state)
            lanes_first = [(frame["serial"], frame["lane"]) for frame in sent[-1]["frames"]]
            promo_rack.screen_turn({}, state)
            lanes_second = [(frame["serial"], frame["lane"]) for frame in sent[-1]["frames"]]
            state["wall_sent_at"] = {serial: at - promo_rack.WALL_GAP_SECONDS for serial, at in state["wall_sent_at"].items()}
            promo_rack.screen_turn({}, state)
            lanes_third = [(frame["serial"], frame["lane"]) for frame in sent[-1]["frames"]]
        self.assertEqual(gap, promo_rack.SCREEN_GAP_SECONDS)
        self.assertEqual(lanes_first, [("A1", "window"), ("A1", "wall"), (IPHONE, "wall")])
        self.assertEqual(lanes_second, [("A1", "window")])
        self.assertEqual(lanes_third, [("A1", "window"), ("A1", "wall"), (IPHONE, "wall")])
        self.assertIn((270, 600), resized)
        self.assertIn((540, 1200), resized)
        self.assertIs(state["devices"][IPHONE], self.screen)
        # Only the wall open: slower turns, and the devices are kept.
        state["wanted"] = []
        with mock.patch.object(promo_rack, "call", lambda config, path, payload: {"wanted": [], "wall": [IPHONE], "inputs": {}}):
            self.assertEqual(promo_rack.screen_turn({}, state), promo_rack.WALL_TURN_SECONDS)
        self.assertEqual(set(state["devices"]), {IPHONE})

    def test_the_log_is_posted_when_the_action_poll_asks(self):
        sent = []
        home = tempfile.mkdtemp()
        path = os.path.join(home, "rack.log")
        with open(path, "w", encoding="utf-8") as handle:
            for index in range(350):
                handle.write("line %d %s\n" % (index, "x" * (2100 if index == 349 else 0)))
        with mock.patch.object(promo_rack, "LOG_PATH", path), \
                mock.patch.object(promo_rack, "call", lambda config, path, payload: sent.append((path, payload)) or {}):
            self.assertIsNone(promo_rack.maybe_send_log({}, {"action": None, "sendLog": False}))
            thread = promo_rack.maybe_send_log({}, {"action": None, "sendLog": True})
            thread.join(5)
        self.assertEqual(len(sent), 1)
        self.assertEqual(sent[0][0], "/api/rack/log")
        lines = sent[0][1]["lines"]
        self.assertEqual(len(lines), 300)
        self.assertEqual(lines[0], "line 50 ")
        self.assertEqual(len(lines[-1]), 2000)
        with mock.patch.object(promo_rack, "LOG_PATH", os.path.join(home, "missing.log")), \
                mock.patch.object(promo_rack, "call", lambda config, path, payload: sent.append((path, payload)) or {}):
            promo_rack.send_log({})
        self.assertEqual(sent[-1][1], {"lines": []})

    def test_an_update_writes_the_driver_beside_the_program_after_checking_it(self):
        home = tempfile.mkdtemp()
        source = 'VERSION = "9.9.9"\n'
        driver = "# the driver\n"
        release = {
            "version": "9.9.9",
            "source": source,
            "sha256": promo_rack.sha256_hex(source.encode("utf-8")),
            "driver": driver,
            "driverSha256": promo_rack.sha256_hex(driver.encode("utf-8")),
        }
        with mock.patch.object(promo_rack, "HOME", home), \
                mock.patch.object(promo_rack, "STATE_PATH", os.path.join(home, "state.json")), \
                mock.patch.object(promo_rack, "call", lambda config, path, payload: dict(release)):
            with self.assertRaises(SystemExit):
                promo_rack.install_update({}, "9.9.9")
            with open(os.path.join(home, "versions", "9.9.9", "iphone.py"), encoding="utf-8") as handle:
                self.assertEqual(handle.read(), driver)
            release["driverSha256"] = "0" * 64
            with self.assertRaises(promo_rack.CallFailed):
                promo_rack.install_update({}, "9.9.9")

    def test_a_frozen_iphone_the_driver_cannot_restart_is_said_in_words(self):
        promo_rack._RESTARTED_AT.clear()
        asked = []

        def refuse(udid):
            asked.append(udid)
            raise iphone.IphoneError("iPhone %s is not trusted or is locked, so it cannot be restarted" % udid)

        with mock.patch.object(promo_rack, "phone_answers", lambda serial: False), \
                mock.patch.object(promo_rack, "adb", no_adb), \
                mock.patch.object(iphone, "restart", refuse), \
                mock.patch.object(promo_rack, "log", lambda words: None):
            recovered, words = promo_rack.recover_frozen(IPHONE, "reddit/comment")
        self.assertEqual(asked, [IPHONE])
        self.assertEqual(recovered, "")
        self.assertIn("could not restart it", words)
        self.assertIn("not trusted or is locked", words)
        self.assertIn("reddit/comment was not finished", words)
        promo_rack._RESTARTED_AT.clear()
        promo_rack._RESTART_WHY.clear()

    def test_a_frozen_iphone_is_restarted_through_the_driver_when_it_offers_that(self):
        promo_rack._RESTARTED_AT.clear()
        restarted = []
        with mock.patch.object(promo_rack, "phone_answers", lambda serial: False), \
                mock.patch.object(promo_rack, "adb", no_adb), \
                mock.patch.object(iphone, "restart", restarted.append), \
                mock.patch.object(promo_rack, "log", lambda words: None):
            recovered, words = promo_rack.recover_frozen(IPHONE, "reddit/comment")
        self.assertEqual(recovered, "phone")
        self.assertIn("restarted it", words)
        self.assertEqual(restarted, [IPHONE])
        self.assertEqual([(phone["serial"], phone["state"], phone["kind"]) for phone in promo_rack.restarting_as_such([])], [(IPHONE, "restarting", "iphone")])
        promo_rack._RESTARTED_AT.clear()
        promo_rack._RESTART_WHY.clear()


IOS_REDDIT, IOS_INSTAGRAM, IOS_TIKTOK = promo_rack.IOS_REDDIT, promo_rack.IOS_INSTAGRAM, promo_rack.IOS_TIKTOK
WIFI = u"Wi‑Fi"


def ios_fixture(name):
    return fixture(IOS_FIXTURES, name)


class IphoneAppsTest(unittest.TestCase):
    """File 08, parts 51, 53, 54 and 55: the three apps, the setup check, the
    App Store, iCloud, the wipe and Safari on an iPhone. Every screen here is
    written from how the apps are known to look; a real iPhone is the proof."""

    def setUp(self):
        promo_rack._KINDS.clear()
        promo_rack._PROPS.clear()
        promo_rack._IPHONE_SCREENS.clear()
        promo_rack._RUNNING_SERIALS.clear()
        promo_rack._KINDS[IPHONE] = "iphone"
        promo_rack._KINDS["A1"] = "android"

    def tearDown(self):
        promo_rack._KINDS.clear()
        promo_rack._PROPS.clear()
        promo_rack._IPHONE_SCREENS.clear()

    def phone(self, pages, start, clipboard=""):
        screen = TreeIphone(IPHONE, pages, start, clipboard)
        promo_rack._IPHONE_SCREENS[IPHONE] = screen
        return screen

    def run_action(self, handler, screen, args, rehearse=False, **patches):
        walk = promo_rack.Walk(IPHONE, rehearse=rehearse, connect=lambda serial: screen)
        patched = [
            mock.patch.object(promo_rack, "shell", no_adb),
            mock.patch.object(promo_rack, "adb", no_adb),
            mock.patch.object(promo_rack, "APP_FEED_AFTER_SECONDS", (0, 0)),
            mock.patch.object(promo_rack, "APP_READ_FEED_SECONDS", (0, 0)),
            mock.patch.object(promo_rack, "FEED_BEFORE_SECONDS", (0, 0)),
            mock.patch.object(promo_rack, "FEED_AFTER_SECONDS", (0, 0)),
            mock.patch.object(promo_rack, "POSTS_BEFORE", (0, 0)),
            mock.patch.object(promo_rack, "READ_SECONDS", (0, 0)),
            mock.patch.object(promo_rack, "POST_LANDED_APP_SECONDS", 0.05),
            mock.patch.object(promo_rack, "POST_LANDED_SECONDS", 0.05),
            mock.patch.object(promo_rack, "MEDIA_SHOW_SECONDS", 2),
            mock.patch.object(promo_rack.time, "sleep", lambda seconds: None),
        ] + [mock.patch.object(promo_rack, name, value) for name, value in patches.items()]
        for patch in patched:
            patch.start()
        try:
            return handler(IPHONE, args, walk), walk
        except Exception as failure:  # Handed back with the walk.
            return failure, walk
        finally:
            for patch in patched:
                patch.stop()

    # --- part 51: the apps ---------------------------------------------------

    def instagram_pages(self):
        return {
            IOS_INSTAGRAM: ios_tree(IOS_INSTAGRAM, ("Button", "Home"), ("Button", "Create"), ("Button", "Profile")),
            "Create": ios_tree(IOS_INSTAGRAM, ("Cell", ["IMG_0002"]), ("Cell", ["IMG_0001"]), ("Button", "Next")),
            "IMG_0002": ios_tree(IOS_INSTAGRAM, ("Button", "Feed"), ("Button", "Next")),
            "Next": ios_tree(IOS_INSTAGRAM, ("TextView", "Write a caption..."), ("Button", "OK"), ("Button", "Share")),
            "Share": ios_tree(IOS_INSTAGRAM, ("StaticText", "Your post has been shared")),
            "Profile": ios_fixture("instagram-profile.xml"),
            "Photo by quiet.maple": ios_tree(IOS_INSTAGRAM, ("Button", "More")),
            "More": ios_tree(IOS_INSTAGRAM, ("Button", "Copy link")),
            "https://media.example/one-time/abc.jpg": ios_fixture("safari-image.xml"),
            "hold": ios_tree("com.apple.mobilesafari", ("Button", "Save to Photos"), ("Button", "Copy"), web=True),
            "Save to Photos": ios_tree("com.apple.mobilesafari", ("Button", "Allow"), web=True),
        }

    def test_an_instagram_post_from_an_iphone_goes_through_safari_and_the_apps_own_picker(self):
        screen = self.phone(self.instagram_pages(), IOS_INSTAGRAM, clipboard="https://www.instagram.com/p/ABC123/")
        result, walk = self.run_action(
            promo_rack.action_app_post("instagram"), screen,
            {"mediaUrl": "https://media.example/one-time/abc.jpg", "mediaFromSafari": True, "mediaKind": "photo", "caption": "Hi. Ok"},
        )
        self.assertEqual(result, {"postUrl": "https://www.instagram.com/p/ABC123/"})
        self.assertEqual(screen.calls[1], ("open_url", "https://media.example/one-time/abc.jpg"))
        # The long press is a swipe with no distance, held for a second.
        holds = [call for call in screen.calls if call[0] == "swipe" and call[1:3] == call[3:5]]
        self.assertEqual(len(holds), 1)
        self.assertEqual(holds[0][5], promo_rack.LONG_PRESS_SECONDS)
        self.assertEqual(screen.pressed[:2], ["Save to Photos", "Allow"])
        self.assertEqual(screen.pressed.count("Share"), 1)
        self.assertEqual(screen.pressed.count("IMG_0002"), 1)
        self.assertEqual([call[1] for call in screen.calls if call[0] == "send_keys"], list("Hi. Ok"))
        self.assertIn("Saved to Photos", [step for step, _ in walk.steps])
        self.assertIn("Press Share", [step for step, _ in walk.steps])

    def test_a_rehearsed_instagram_post_on_an_iphone_downloads_nothing_and_never_presses_share(self):
        screen = self.phone(self.instagram_pages(), IOS_INSTAGRAM)
        result, walk = self.run_action(promo_rack.action_app_post("instagram"), screen, {"mediaUrl": "", "mediaKind": "photo", "caption": ""}, rehearse=True)
        self.assertEqual(result, {"postUrl": ""})
        self.assertFalse([call for call in screen.calls if call[0] == "open_url"])
        self.assertFalse([call for call in screen.calls if call[0] == "send_keys"])
        self.assertNotIn("Share", screen.pressed)
        self.assertNotIn("Save to Photos", screen.pressed)
        self.assertIn("Press Share (found, not pressed)", [step for step, _ in walk.steps])
        # Backing out closes the app, so no draft is left open.
        self.assertIn(("app_stop", IOS_INSTAGRAM), screen.calls)

    def test_a_post_without_the_safari_link_is_refused_before_anything_opens(self):
        screen = self.phone(self.instagram_pages(), IOS_INSTAGRAM)
        failure, _ = self.run_action(promo_rack.action_app_post("instagram"), screen, {"mediaUrl": "https://media.example/a.jpg", "caption": "Hi"})
        self.assertIn("mediaFromSafari", str(failure))
        self.assertEqual(screen.pressed, [])

    def reddit_pages(self):
        post = "https://www.reddit.com/r/study/comments/abc12/night_timers/"
        return {
            IOS_REDDIT: ios_tree(IOS_REDDIT, ("Button", "Open profile menu"), ("StaticText", "A long post title from the home feed about something")),
            "Open profile menu": ios_tree(IOS_REDDIT, ("StaticText", "u/quiet_maple"), ("StaticText", "12 karma"), ("StaticText", "2y Reddit age")),
            post: ios_tree(IOS_REDDIT, ("StaticText", "Night timers?"), ("Button", "Add a comment")),
            "Add a comment": ios_tree(IOS_REDDIT, ("TextView", "Add a comment"), ("Button", "Post")),
            "Post": ios_tree(IOS_REDDIT, ("StaticText", "Night timers?"), ("StaticText", "Comment posted")),
        }

    def test_a_reddit_comment_from_an_iphone_presses_post_once(self):
        screen = self.phone(self.reddit_pages(), IOS_REDDIT)
        result, walk = self.run_action(
            promo_rack.action_reddit_comment, screen,
            {"permalink": "/r/study/comments/abc12/night_timers/", "text": "Yes."},
        )
        self.assertEqual(result["commentUrl"], "")
        self.assertEqual(screen.pressed.count("Post"), 1)
        self.assertEqual(screen.pressed[0], "Open profile menu")
        self.assertIn(("open_url", "https://www.reddit.com/r/study/comments/abc12/night_timers/"), screen.calls)
        self.assertEqual([call[1] for call in screen.calls if call[0] == "send_keys"], list("Yes."))

    def test_a_rehearsed_reddit_comment_on_an_iphone_finds_post_and_never_presses_it(self):
        screen = self.phone(self.reddit_pages(), IOS_REDDIT)
        result, walk = self.run_action(promo_rack.action_reddit_comment, screen, {"permalink": "/r/study/comments/abc12/night_timers/", "text": ""}, rehearse=True)
        self.assertEqual(result["commentUrl"], "")
        self.assertEqual(screen.pressed, ["Add a comment"])
        self.assertIn("Press Post (found, not pressed)", [step for step, _ in walk.steps])

    def tiktok_pages(self):
        return {
            IOS_TIKTOK: ios_tree(IOS_TIKTOK, ("Button", "Home"), ("Button", "Inbox"), ("Button", "Profile")),
            "Inbox": ios_tree(IOS_TIKTOK, ("Cell", ["sam.reads", "does it work offline?"]), ("Cell", ["ana", "hey"])),
            "sam.reads": ios_tree(IOS_TIKTOK, ("NavigationBar", "sam.reads"), ("StaticText", "does it work offline?"), ("TextView", "Send a message"), ("Button", "Send")),
            "Send": ios_tree(IOS_TIKTOK, ("NavigationBar", "sam.reads"), ("StaticText", "does it work offline?"), ("StaticText", "Yes, offline too."), ("TextView", "Send a message"), ("Button", "Send")),
        }

    def test_a_tiktok_reply_from_an_iphone_presses_send_once(self):
        screen = self.phone(self.tiktok_pages(), IOS_TIKTOK)
        result, _ = self.run_action(
            promo_rack.action_app_reply("tiktok"), screen,
            {"kind": "message", "thread": "sam.reads", "author": "sam.reads", "quote": "does it work offline?", "text": "Yes, offline too."},
        )
        self.assertEqual(result, {"sent": True})
        self.assertEqual(screen.pressed.count("Send"), 1)
        self.assertEqual(screen.pressed[:2], ["Inbox", "sam.reads"])
        self.assertEqual("".join(call[1] for call in screen.calls if call[0] == "send_keys"), "Yes, offline too.")

    def test_a_rehearsed_tiktok_reply_on_an_iphone_opens_the_first_chat_and_never_presses_send(self):
        screen = self.phone(self.tiktok_pages(), IOS_TIKTOK)
        result, walk = self.run_action(
            promo_rack.action_app_reply("tiktok"), screen,
            {"kind": "message", "thread": "", "author": "", "quote": "", "text": ""}, rehearse=True,
        )
        self.assertEqual(result, {"sent": False})
        self.assertNotIn("Send", screen.pressed)
        # The first chat's row was opened, whichever of its lines the thumb landed on.
        self.assertEqual(screen.pressed[0], "Inbox")
        self.assertIn(screen.pressed[1], ("sam.reads", "does it work offline?"))
        self.assertIn("Press Send (found, not pressed)", [step for step, _ in walk.steps])

    def test_the_readers_read_the_iphone_tree(self):
        profile = ios_fixture("instagram-profile.xml")
        self.assertEqual(promo_rack.app_profile_from_screen(profile, "instagram"), {"handle": "quiet.maple", "followers": 1204, "following": 310, "posts": 12})
        self.assertFalse(promo_rack.signed_out(profile, "instagram"))
        self.assertTrue(promo_rack.signed_out(ios_tree(IOS_INSTAGRAM, ("Button", "Log in"), ("Button", "Sign up")), "instagram"))
        self.assertEqual(promo_rack.account_from_screen(self.reddit_pages()["Open profile menu"], now=1000)["handle"], "quiet_maple")
        conversation = promo_rack.conversation_from_screen(self.tiktok_pages()["Send"], "tiktok", 2532, 1170)
        self.assertEqual(conversation["thread"], "sam.reads")
        # The text view is the box, not a line someone wrote.
        self.assertEqual([line["text"] for line in conversation["lines"]], ["does it work offline?", "Yes, offline too."])
        self.assertTrue(promo_rack.unread_in_inbox(ios_tree(IOS_INSTAGRAM, ("Button", "Messenger, 2 unread")), "instagram"))
        hidden = ios_tree(IOS_INSTAGRAM, ("StaticText", "Account status"), ("StaticText", "Your account can't be recommended to people who don't follow you"))
        self.assertTrue(promo_rack.shadowban_from_screen(hidden, "instagram")["hidden"])
        self.assertEqual(promo_rack.post_numbers_from_screen(ios_tree(IOS_TIKTOK, ("StaticText", "1.2K likes"), ("StaticText", "34 comments")), "tiktok"), {"views": None, "likes": 1200, "comments": 34})
        comments = promo_rack.comments_from_screen(ios_tree(IOS_INSTAGRAM, ("StaticText", "quiet.maple"), ("StaticText", "Night timers."), ("StaticText", "ana"), ("StaticText", "love it")), "instagram", "quiet.maple", 2532)
        self.assertEqual(comments, [{"author": "ana", "text": "love it", "thread": "Night timers."}])
        ban = ios_tree(IOS_REDDIT, ("StaticText", "Your account has been suspended"))
        self.assertEqual(promo_rack.ban_screen_in(ban, "reddit", IOS_REDDIT)["kind"], "suspended")

    def test_a_switch_value_is_no_line_but_a_text_box_value_is(self):
        self.assertNotIn("1", promo_rack.screen_lines(ios_fixture("settings-wifi.xml"), IOS_SETTINGS))
        self.assertIn(WIFI, promo_rack.screen_lines(ios_fixture("settings-wifi.xml"), IOS_SETTINGS))
        screen = ios_tree(IOS_REDDIT, ("Switch", "Dark mode", "1"), ("Switch", "Autoplay", "0"), ("TextField", "Search", "night timers"), ("StaticText", "Your account has been suspended"))
        lines = promo_rack.screen_lines(screen, IOS_REDDIT)
        self.assertEqual(lines, ["com.reddit.Reddit", "Dark mode", "Autoplay", "Search", "night timers", "Your account has been suspended"])
        # The two switches' values did not push the ban screen past its line limit.
        self.assertEqual(promo_rack.ban_screen_in(screen, "reddit", IOS_REDDIT)["kind"], "suspended")

    def test_leaving_a_screen_on_an_iphone_closes_the_app_given_not_whatever_is_in_front(self):
        screen = self.phone({"start": ios_tree("com.apple.mobilesafari", ("StaticText", "A page"), web=True)}, "start")
        walk = promo_rack.Walk(IPHONE, connect=lambda serial: screen)
        with mock.patch.object(promo_rack, "shell", no_adb), mock.patch.object(promo_rack.time, "sleep", lambda seconds: None):
            promo_rack.leave_app_screen(IPHONE, walk, "instagram", times=1)
        self.assertEqual([call for call in screen.calls if call[0] == "app_stop"], [("app_stop", IOS_INSTAGRAM)])

    def test_each_app_action_picks_the_iphone_shapes_by_the_phone(self):
        self.assertIs(promo_rack.app_screens(IPHONE, "tiktok"), promo_rack.APP_SCREENS[IOS_TIKTOK])
        self.assertIs(promo_rack.app_screens("A1", "tiktok"), promo_rack.APP_SCREENS["tiktok"])
        self.assertEqual(promo_rack.screens_for("reddit", IPHONE)["package"], IOS_REDDIT)
        self.assertEqual(promo_rack.screens_for("reddit")["package"], promo_rack.REDDIT)
        for bundle in (IOS_REDDIT, IOS_INSTAGRAM, IOS_TIKTOK):
            for selectors in promo_rack.APP_SCREENS[bundle].values():
                for selector in selectors if isinstance(selectors, list) else []:
                    if "packageName" in selector:
                        self.assertEqual(selector["packageName"], bundle)
        # Install and Erase are last buttons a rehearsal can never tap.
        self.assertTrue(promo_rack.could_be_last_button({"text": "Install"}))
        walk = promo_rack.Walk(IPHONE, rehearse=True, connect=lambda serial: self.phone({"x": ios_tree(IOS_SETTINGS, ("Button", "Erase"))}, "x"))
        with self.assertRaises(RuntimeError):
            walk.tap("Press Erase", text="Erase")

    # --- part 53: the setup check and the App Store --------------------------

    def settings_pages(self):
        return {
            IOS_SETTINGS: ios_fixture("settings-signed-in.xml"),
            WIFI: ios_fixture("settings-wifi.xml"),
            "General": ios_tree(IOS_SETTINGS, ("Cell", ["About"]), ("Cell", ["Language & Region"]), ("Cell", ["Transfer or Reset iPhone"])),
            "About": ios_fixture("about.xml"),
            "Language & Region": ios_fixture("language-region.xml"),
            "Privacy & Security": ios_tree(IOS_SETTINGS, ("Cell", ["Location Services", "On"]), ("Cell", ["Tracking"])),
            "Location Services": ios_fixture("location-services.xml"),
            "App Store": ios_fixture("app-store-settings.xml"),
            promo_rack.IPINFO_URL: ios_fixture("safari-ipinfo.xml"),
            "Transfer or Reset iPhone": ios_tree(IOS_SETTINGS, ("Cell", ["Reset"]), ("Cell", ["Erase All Content and Settings"])),
            "Erase All Content and Settings": ios_tree(IOS_SETTINGS, ("StaticText", "Erase All Content & Settings"), ("Button", "Continue")),
            "Continue": ios_tree(IOS_SETTINGS, ("StaticText", "This will erase everything."), ("Button", "Erase iPhone")),
            "Erase iPhone": ios_tree(IOS_SETTINGS, ("StaticText", "Erasing...")),
        }

    def test_the_setup_facts_are_read_off_ios_screens(self):
        self.assertTrue(promo_rack.ios_switch_on(ios_fixture("settings-wifi.xml"), "wi-fi"))
        self.assertFalse(promo_rack.ios_switch_on(ios_fixture("app-store-settings.xml"), "app updates"))
        self.assertIsNone(promo_rack.ios_switch_on(ios_fixture("about.xml"), "app updates"))
        location = ios_fixture("location-services.xml")
        self.assertTrue(promo_rack.ios_switch_on(location, "location services"))
        self.assertEqual([promo_rack.ios_location_allowed(location, name) for name in ("Reddit", "Instagram", "TikTok")], [True, False, None])
        language = ios_fixture("language-region.xml")
        self.assertEqual(promo_rack.ios_cell_value(language, "Region"), "Canada")
        self.assertEqual(promo_rack.ios_locale("English", "Canada"), "en-CA")
        self.assertEqual(promo_rack.ios_locale("English (US)", ""), "en-US")
        self.assertEqual(promo_rack.ios_locale("Klingon", "Canada"), "")
        self.assertEqual(promo_rack.carrier_name("Rogers 59.0.1"), "Rogers")
        self.assertEqual(promo_rack.outside_from_screen(ios_fixture("safari-ipinfo.xml"))["ip"], "172.56.21.9")
        self.assertEqual(promo_rack.store_version_from_screen(ios_fixture("app-store-reddit-update.xml")), "2025.41.0")

    def test_the_setup_check_on_an_iphone_fills_the_same_facts_and_a_failing_part_leaves_the_rest(self):
        pages = self.settings_pages()
        del pages["App Store"]  # The row leads nowhere: that part stays blank.
        screen = self.phone(pages, IOS_SETTINGS)
        promo_rack._PROPS[IPHONE] = {"model": "iPhone 12", "android": "17.6.1", "timezone": "America/Toronto"}
        logged = []
        with mock.patch.object(iphone, "vitals", lambda udid: {"batteryPercent": 64}), \
                mock.patch.object(iphone, "app_versions", lambda udid: None):
            result, walk = self.run_action(
                promo_rack.action_setup_check, screen, {},
                read_home_address=lambda: {"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "", "error": ""},
                zone_country=lambda zone: "CA",
                log=logged.append,
            )
        self.assertEqual(result, {
            "wifiOn": True,
            "locationApps": {"instagram": False, "reddit": True},
            "timezone": "America/Toronto",
            "timezoneCountry": "CA",
            "locale": "en-CA",
            "sim": {"country": "", "carrier": "Rogers"},
            "network": {"carrier": "Rogers"},
            "autoUpdate": "",
            "autoUpdateError": "No App Updates switch was found on the App Store settings screen.",
            "battery": {"percent": 64, "charging": None},
            "outside": {"ip": "172.56.21.9", "country": "CA", "timezone": "America/Toronto", "org": "AS812 Rogers Communications Canada Inc.", "error": ""},
            "home": {"ip": "203.0.113.4", "country": "CA", "timezone": "America/Toronto", "org": "", "error": ""},
        })
        self.assertIn(("open_url", promo_rack.IPINFO_URL), screen.calls)
        # Settings is closed and opened for each part, so each starts on the first screen.
        self.assertGreaterEqual(screen.calls.count(("app_stop", IOS_SETTINGS)), 5)
        self.assertEqual(logged, [])

    def test_check_updates_on_an_iphone_reads_each_store_page_and_presses_nothing(self):
        store = {
            "itms-apps://apps.apple.com/app/id1064216828": ios_fixture("app-store-reddit-update.xml"),
            "itms-apps://apps.apple.com/app/id389801252": ios_tree(promo_rack.APP_STORE, ("Button", "Open"), ("StaticText", "Version 400.0")),
            "itms-apps://apps.apple.com/app/id835599320": ios_tree(promo_rack.APP_STORE, ("Button", "Get"), ("StaticText", "Version 41.0")),
            # Medium is tracked too (Medium task, part 42), and not on this phone.
            "itms-apps://apps.apple.com/app/id828256236": ios_tree(promo_rack.APP_STORE, ("Button", "Get"), ("StaticText", "Version 7.0")),
        }
        screen = self.phone(dict(store, start=ios_tree(IOS_SETTINGS)), "start")
        with mock.patch.object(iphone, "app_versions", lambda udid: {"reddit": "2025.40.0", "instagram": "400.0"}):
            result, _ = self.run_action(promo_rack.action_check_updates, screen, {})
        self.assertEqual(result, {"apps": {"reddit": {"version": "2025.40.0", "update": True}, "instagram": {"version": "400.0", "update": False}}})
        self.assertEqual(screen.pressed, [])
        # Without the driver's versions the page is read, and Get means not installed.
        screen = self.phone(dict(store, start=ios_tree(IOS_SETTINGS)), "start")
        with mock.patch.object(iphone, "app_versions", lambda udid: None):
            result, _ = self.run_action(promo_rack.action_check_updates, screen, {})
        self.assertEqual(result, {"apps": {"reddit": {"version": "2025.41.0", "update": True}, "instagram": {"version": "400.0", "update": False}}})

    def test_update_app_on_an_iphone_presses_update_once_and_waits_for_the_version(self):
        page = "itms-apps://apps.apple.com/app/id1064216828"
        screen = self.phone({page: ios_fixture("app-store-reddit-update.xml"), "start": ios_tree(IOS_SETTINGS)}, "start")
        versions = lambda udid: {"reddit": "2025.41.0" if "Update" in screen.pressed else "2025.40.0"}
        with mock.patch.object(iphone, "app_versions", versions):
            result, walk = self.run_action(promo_rack.action_update_app, screen, {"app": "reddit"})
        self.assertEqual(result, {"app": "reddit", "from": "2025.40.0", "to": "2025.41.0"})
        self.assertEqual(screen.pressed, ["Update"])
        self.assertEqual(screen.calls[0], ("open_url", page))
        self.assertIn("Updated to 2025.41.0", [step for step, _ in walk.steps])

    # --- part 54: iCloud and the wipe ----------------------------------------

    def test_icloud_state_reads_settings_top_row_both_ways(self):
        self.assertEqual(promo_rack.icloud_from_screen(ios_fixture("settings-signed-in.xml")), {"signedOut": False, "appleId": "Tyler Pham"})
        self.assertEqual(promo_rack.icloud_from_screen(ios_fixture("settings-signed-out.xml")), {"signedOut": True, "appleId": ""})
        self.assertIsNone(promo_rack.icloud_from_screen(ios_fixture("about.xml")))
        screen = self.phone({IOS_SETTINGS: ios_fixture("settings-signed-out.xml")}, IOS_SETTINGS)
        result, walk = self.run_action(promo_rack.action_icloud_state, screen, {})
        self.assertEqual(result, {"signedOut": True, "appleId": ""})
        self.assertEqual(screen.pressed, [])
        self.assertEqual(screen.calls[-1], ("press", "home"))
        self.assertIn("phone/icloud-state", promo_rack.REHEARSALS)
        self.assertIs(promo_rack.ACTIONS["phone/icloud-state"], promo_rack.action_icloud_state)
        with self.assertRaises(RuntimeError):
            promo_rack.action_icloud_state("A1", {}, promo_rack.Walk("A1", connect=lambda serial: FakeDevice([])))

    def test_an_iphone_wipe_is_refused_until_promo_says_the_apple_id_is_signed_out(self):
        screen = self.phone(self.settings_pages(), IOS_SETTINGS)
        for args in ({}, {"icloudSignedOut": False}, {"icloudSignedOut": "yes"}):
            failure, _ = self.run_action(promo_rack.action_wipe, screen, args)
            self.assertIsInstance(failure, RuntimeError)
            self.assertIn("signed out", str(failure))
        self.assertEqual(screen.pressed, [])
        self.assertNotIn("phone/wipe", promo_rack.REHEARSALS)

    def test_an_iphone_wipe_walks_to_erase_and_a_rehearsal_never_presses_it(self):
        screen = self.phone(self.settings_pages(), IOS_SETTINGS)
        result, walk = self.run_action(promo_rack.action_wipe, screen, {"icloudSignedOut": True})
        self.assertEqual(result, {"wiped": True})
        self.assertEqual(screen.pressed, ["General", "Transfer or Reset iPhone", "Erase All Content and Settings", "Continue", "Erase iPhone"])
        screen = self.phone(self.settings_pages(), IOS_SETTINGS)
        result, walk = self.run_action(promo_rack.action_wipe, screen, {"icloudSignedOut": True}, rehearse=True)
        self.assertEqual(result, {"wiped": False})
        self.assertNotIn("Erase iPhone", screen.pressed)
        self.assertEqual(walk.steps[-1][0], "Press Erase iPhone (found, not pressed)")

    def test_a_passcode_prompt_stops_the_wipe_with_a_picture(self):
        pages = self.settings_pages()
        pages["Continue"] = ios_tree(IOS_SETTINGS, ("StaticText", "Enter Passcode"), ("SecureTextField", ""))
        screen = self.phone(pages, IOS_SETTINGS)
        failure, walk = self.run_action(promo_rack.action_wipe, screen, {"icloudSignedOut": True})
        self.assertIsInstance(failure, promo_rack.StepFailed)
        self.assertEqual(str(failure), "The phone asks for its passcode; wipe it by hand.")
        self.assertNotIn("Erase iPhone", screen.pressed)
        self.assertEqual(walk.steps[-1][0], "The phone asks for its passcode")

    # --- part 55: Safari -----------------------------------------------------

    def test_the_picture_in_safari_is_found_and_a_bad_address_is_refused(self):
        self.assertEqual(promo_rack.media_on_screen(ios_fixture("safari-image.xml"), 2532), (40, 620, 1130, 720))
        self.assertIsNone(promo_rack.media_on_screen(ios_tree(IOS_SETTINGS, ("Cell", ["General"])), 2532))
        screen = self.phone({"x": ios_tree(IOS_SETTINGS)}, "x")
        with self.assertRaises(RuntimeError):
            promo_rack.save_from_safari(IPHONE, promo_rack.Walk(IPHONE, connect=lambda serial: screen), "http://media.example/a.jpg")
        self.assertEqual(screen.calls, [])


if __name__ == "__main__":
    unittest.main()
