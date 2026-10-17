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
            {"serial": "35091FDH2000A1", "state": "device", "usb": "usb:1-1.2", "model": "Pixel 8a", "android": ""},
            {"serial": "R58N12ABCDE", "state": "unauthorized", "usb": "usb:1-1.3", "model": "", "android": ""},
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


if __name__ == "__main__":
    unittest.main()
