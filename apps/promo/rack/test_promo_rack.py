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
