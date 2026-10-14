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
