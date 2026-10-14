"""Tests for the rack program and its launcher. Run from apps/promo:

    python3 -m unittest discover -s rack -p "test_*.py"

No phone, adb or Promo is needed. A real phone on the rack is the only proof
that an action works on a phone; these prove the parts around it.
"""

import json
import os
import subprocess
import sys
import tempfile
import time
import unittest

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
        return self.selector.get("text", "")

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


def comment_walk(serial, args, walk):
    """A comment's steps, the shape the Reddit app actions take in file 05."""
    walk.tap("Open the post", text="Open")
    walk.tap("Open the reply box", text="Reply")
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
        result, device, walk = self.run_self_test(["Open", "Reply", "Post"])
        self.assertEqual(result, {"actions": [{"action": "test/comment", "passed": True, "step": "", "error": ""}]})
        self.assertEqual(device.pressed, ["Open", "Reply"])
        self.assertEqual([step for step, _ in walk.steps], ["test/comment: Press Post (found, not pressed)"])

    def test_a_moved_button_fails_its_step_with_a_picture_of_where_it_stopped(self):
        # The app renamed Reply to Respond, the way an update moves a button.
        result, device, walk = self.run_self_test(["Open", "Respond", "Post"])
        line = result["actions"][0]
        self.assertFalse(line["passed"])
        self.assertEqual(line["step"], "Open the reply box")
        self.assertIn('"Reply"', line["error"])
        self.assertEqual(device.pressed, ["Open"])
        self.assertNotIn("Post", device.pressed)
        self.assertEqual(walk.steps[-1][0], "test/comment: Open the reply box")

    def test_a_real_run_presses_post_once(self):
        device = FakeDevice(["Open", "Reply", "Post"])
        walk = promo_rack.Walk("A1", connect=lambda serial: device)
        comment_walk("A1", {}, walk)
        self.assertEqual(device.pressed, ["Open", "Reply", "Post"])

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
        device = FakeDevice(["Open", "Reply", "Post"])
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
