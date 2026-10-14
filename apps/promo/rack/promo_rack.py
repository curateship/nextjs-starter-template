#!/usr/bin/env python3
"""Promo's rack program: the only thing that touches the phones.

It runs on the computer the phones are plugged into, at home. It dials out to
Promo, so no port is ever opened at the house. Every 15 seconds it tells Promo
which phones adb can see, and every few seconds it asks for the next action.
Only the actions named in ACTIONS below are ever run; any other name is
refused. Every message both ways is signed with the key this rack was given
when it was paired, and a reply without the right signature is thrown away.

Threads besides the main loop's own: each action runs on a thread of its
own, so two phones work side by side (Promo hands a phone one action at a
time); one sends the screens of the phones someone is watching, a few
pictures a second, and carries their taps back; and one reads each phone's
battery, heat, storage and signal once a minute, restarting a phone that has
stopped answering.

Every action keeps a picture of each step. An app that freezes during an
action is closed and opened again, and a phone that stops answering is
restarted; the action itself is never run again here, because Promo decides
what is tried twice and a comment never is. After any app action the screen
is checked for the app's suspended, locked and "confirm it's you" screens.

Commands:
  promo_rack.py pair --url https://promo.example --code ABCD-EFGH [--name "Rack"]
  promo_rack.py run
  promo_rack.py phones        (prints what adb sees, for checking by hand)

It is written for the Python that ships with macOS (3.9) and for Linux, using
only the standard library, except uiautomator2, which reads phone screens and
is only imported by the actions that need it.

The launcher beside it (launcher.py) starts this file, swaps in a new version
when Promo offers one, and goes back to the old one if the new one does not
check in within two minutes. The file's own VERSION is the only version there
is: Promo reads it out of the same file it serves.
"""

import argparse
import base64
import hashlib
import hmac
import io
import json
import os
import platform
import re
import secrets
import shutil
import subprocess
import sys
import threading
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree

VERSION = "2026.10.14.2"

# The launcher restarts the program when it exits with this code: a new
# version was written, or someone switched versions on disk.
EXIT_SWITCH = 75

# How often to ask for work when there is none. Check-ins are less often.
POLL_SECONDS = 3
DEFAULT_CHECK_IN_SECONDS = 15

# A signed reply whose clock is further off than this is refused.
CLOCK_WINDOW_SECONDS = 300

HTTP_TIMEOUT_SECONDS = 30

# Screenshots are shrunk to this width before they are sent.
SCREENSHOT_WIDTH = 540


def default_home():
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/PromoRack")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "promo-rack")


HOME = os.environ.get("PROMO_RACK_HOME") or default_home()
CONFIG_PATH = os.path.join(HOME, "config.json")
STATE_PATH = os.path.join(HOME, "state.json")


def log(message):
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print("%s %s" % (stamp, message), flush=True)


# ---------------------------------------------------------------------------
# Files on disk

def read_json(path, fallback):
    try:
        with open(path, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return fallback


def write_json(path, value, private=False):
    """Writes through a temporary file and a rename, so a reader never sees half."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    temporary = "%s.%d.tmp" % (path, os.getpid())
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(value, handle, indent=2)
    if private:
        os.chmod(temporary, 0o600)
    os.replace(temporary, path)


def load_state():
    return read_json(STATE_PATH, {})


def update_state(**changes):
    state = load_state()
    state.update(changes)
    write_json(STATE_PATH, state)
    return state


# ---------------------------------------------------------------------------
# Signing. The same rule as src/server/phones/signing.ts.

def sha256_hex(data):
    return hashlib.sha256(data).hexdigest()


def request_signature(key, method, path, stamp, nonce, body):
    canonical = "\n".join([method, path, str(stamp), nonce, sha256_hex(body)])
    return hmac.new(key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


def reply_signature(key, status, nonce, stamp, body):
    canonical = "\n".join(["reply", str(status), nonce, str(stamp), sha256_hex(body)])
    return hmac.new(key.encode("utf-8"), canonical.encode("utf-8"), hashlib.sha256).hexdigest()


class Refused(Exception):
    """Promo refused this rack: a cancelled key, a used code, a bad signature."""


class CallFailed(Exception):
    """Promo could not be reached, or answered with something not to be trusted."""


def call(config, path, payload):
    """One signed request to Promo, and its reply checked before it is read."""
    body = json.dumps(payload).encode("utf-8")
    stamp = int(time.time())
    nonce = secrets.token_hex(16)
    request = urllib.request.Request(
        config["url"].rstrip("/") + path,
        data=body,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-rack-id": config["rackId"],
            "x-rack-time": str(stamp),
            "x-rack-nonce": nonce,
            "x-rack-signature": request_signature(config["key"], "POST", path, stamp, nonce, body),
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            status = response.status
            text = response.read()
            headers = response.headers
    except urllib.error.HTTPError as error:
        text = error.read()
        if error.code == 401:
            raise Refused(answer_message(text) or "Promo refused this rack.")
        status = error.code
        headers = error.headers
    except (urllib.error.URLError, OSError) as error:
        raise CallFailed("Could not reach Promo: %s" % error)

    signature = headers.get("x-promo-signature") or ""
    reply_stamp = headers.get("x-promo-time") or ""
    if not signature or not reply_stamp.isdigit():
        # A refusal before Promo knew which rack this was carries no
        # signature. Its words are logged and nothing is acted on.
        if status >= 400:
            raise CallFailed(answer_message(text) or "Promo answered %s with %d." % (path, status))
        raise CallFailed("Promo's reply to %s was not signed, so it was ignored." % path)
    expected = reply_signature(config["key"], status, nonce, reply_stamp, text)
    if not hmac.compare_digest(signature, expected):
        raise CallFailed("Promo's reply to %s had the wrong signature, so it was ignored." % path)
    if abs(int(time.time()) - int(reply_stamp)) > CLOCK_WINDOW_SECONDS:
        raise CallFailed("Promo's reply to %s was too old, so it was ignored." % path)

    try:
        parsed = json.loads(text.decode("utf-8")) if text else {}
    except ValueError:
        raise CallFailed("Promo's reply to %s was not JSON." % path)
    if status >= 400:
        raise CallFailed(parsed.get("error") or "Promo answered %s with %d." % (path, status))
    return parsed


def answer_message(text):
    try:
        return json.loads(text.decode("utf-8")).get("error", "")
    except (ValueError, AttributeError):
        return ""


# ---------------------------------------------------------------------------
# adb

def adb_path():
    configured = os.environ.get("PROMO_RACK_ADB")
    if configured:
        return configured
    bundled = os.path.join(HOME, "platform-tools", "adb")
    if os.path.exists(bundled):
        return bundled
    found = shutil.which("adb")
    if found:
        return found
    raise RuntimeError("adb is not installed on this computer. Run the install command again.")


def adb(args, serial=None, timeout=30):
    command = [adb_path()] + (["-s", serial] if serial else []) + list(args)
    completed = subprocess.run(command, capture_output=True, text=True, timeout=timeout)
    if completed.returncode != 0:
        raise RuntimeError((completed.stderr or completed.stdout).strip() or "adb failed")
    return completed.stdout


def shell(serial, command, timeout=30):
    return adb(["shell", command], serial=serial, timeout=timeout).strip()


def parse_devices(output):
    """`adb devices -l`, one dict per line: serial, adb's state, USB port, model."""
    phones = []
    for line in output.splitlines():
        line = line.strip()
        if not line or line.startswith("List of devices") or line.startswith("*"):
            continue
        parts = line.split()
        if len(parts) < 2:
            continue
        fields = dict(part.split(":", 1) for part in parts[2:] if ":" in part)
        phones.append({
            "serial": parts[0],
            "state": parts[1],
            "usb": ("usb:" + fields["usb"]) if "usb" in fields else "",
            "model": fields.get("model", "").replace("_", " "),
            "android": "",
        })
    return phones


# Each phone's model, Android version and time zone, read once while it stays plugged in.
_PROPS = {}


def list_phones():
    phones = restarting_as_such(parse_devices(adb(["devices", "-l"], timeout=15)))
    present = set()
    for phone in phones:
        serial = phone["serial"]
        present.add(serial)
        if phone["state"] != "device":
            continue
        if serial not in _PROPS:
            try:
                _PROPS[serial] = {
                    "model": shell(serial, "getprop ro.product.model", timeout=10),
                    "android": shell(serial, "getprop ro.build.version.release", timeout=10),
                    "timezone": shell(serial, "getprop persist.sys.timezone", timeout=10),
                }
            except (RuntimeError, subprocess.TimeoutExpired):
                continue
        phone.update({key: value for key, value in _PROPS[serial].items() if value})
    # A phone unplugged and plugged back may have been updated in between.
    for serial in list(_PROPS):
        if serial not in present:
            del _PROPS[serial]
    return phones


# ---------------------------------------------------------------------------
# Steps. Every action that touches the screen walks it as named steps, each
# with a small picture, so a failed one shows where it stopped. The self-test
# walks the same steps with `rehearse` on, and `final` (the Post, Send or
# Share button) then only finds the button and never presses it.

class Cancelled(Exception):
    """The action was given up on because the phone or app froze; nothing more is pressed."""


class StepFailed(RuntimeError):
    """A step could not find what it was looking for on the screen."""

    def __init__(self, step, why):
        RuntimeError.__init__(self, why)
        self.step = step


def connect_screen(serial):
    try:
        import uiautomator2
    except ImportError:
        raise RuntimeError("uiautomator2 is not installed on the rack. Run the install command again.")
    return uiautomator2.connect(serial)


def screenshot_jpeg(device):
    image = device.screenshot()
    if image.width > SCREENSHOT_WIDTH:
        height = round(image.height * SCREENSHOT_WIDTH / image.width)
        image = image.resize((SCREENSHOT_WIDTH, height))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=70)
    return buffer.getvalue()


# The buttons that send something. A rehearsal may find them, never press them.
LAST_BUTTONS = ("post", "send", "share")


def selector_words(selector):
    for key in ("text", "textMatches", "description", "resourceId"):
        if key in selector:
            return '"%s"' % selector[key]
    return "the button"


class Walk(object):
    """One action's steps on one phone, each with a picture of the screen."""

    def __init__(self, serial, rehearse=False, cancelled=None, connect=None):
        self.serial = serial
        self.rehearse = rehearse
        self.cancelled = cancelled or threading.Event()
        # Looked up when used, so a test can stand a fake screen in.
        self.connect = connect or (lambda serial: connect_screen(serial))
        self.device = None
        # (step name, JPEG bytes), in order.
        self.steps = []
        # The step being worked on, for a failure that is not a StepFailed.
        self.current = ""

    def screen(self):
        if self.device is None:
            self.device = self.connect(self.serial)
        return self.device

    def check(self):
        if self.cancelled.is_set():
            raise Cancelled("The phone or app froze, so the action was stopped here.")

    def shot(self, step):
        """Keeps a picture of the screen as it is now, named for the step that got it there.
        A walk given up on takes no more pictures."""
        self.current = step
        if self.cancelled.is_set():
            return
        try:
            self.steps.append((step, screenshot_jpeg(self.screen())))
        except Exception as failure:  # A step with no picture still counts.
            log("No picture for %s on %s: %s" % (step, self.serial, failure))

    def find(self, step, timeout=10, **selector):
        self.check()
        self.current = step
        element = self.screen()(**selector)
        if not element.wait(timeout=timeout):
            self.shot(step)
            raise StepFailed(step, "Could not find %s on the screen." % selector_words(selector))
        return element

    def home(self):
        """Back to the home screen, unless the walk was given up on: a frozen
        action's thread that wakes later must not move the phone under the next."""
        if not self.cancelled.is_set():
            go_home(self.serial)

    def tap(self, step, timeout=10, **selector):
        if self.rehearse and plain(str(selector.get("text", ""))) in LAST_BUTTONS:
            # The self-test must never press Post, Send or Share; those go through final().
            raise RuntimeError("A rehearsal tried to tap %s; the last button is only ever found, with final()." % selector["text"])
        element = self.find(step, timeout, **selector)
        self.check()
        element.click()
        time.sleep(1)
        self.shot(step)

    def final(self, step, timeout=10, **selector):
        """The last button, such as Post. Pressed once in a real run; in the
        self-test it is only found, and this returns False without a press."""
        element = self.find(step, timeout, **selector)
        if self.rehearse:
            self.shot("%s (found, not pressed)" % step)
            return False
        self.check()
        element.click()
        time.sleep(1)
        self.shot(step)
        return True


def go_home(serial):
    try:
        shell(serial, "input keyevent KEYCODE_HOME", timeout=10)
    except (RuntimeError, subprocess.TimeoutExpired):
        pass


# ---------------------------------------------------------------------------
# The named actions. Each takes the phone's serial, its arguments and its
# Walk, and returns its answer; its pictures are the Walk's steps.

def action_list(serial, args, walk):
    return {"phones": list_phones()}


def action_health(serial, args, walk):
    battery = shell(serial, "dumpsys battery")
    level = re.search(r"^\s*level:\s*(\d+)", battery, re.M)
    temperature = re.search(r"^\s*temperature:\s*(\d+)", battery, re.M)
    charging = re.search(r"^\s*status:\s*(\d+)", battery, re.M)
    storage = shell(serial, "df /data").splitlines()
    free_kb = None
    if len(storage) >= 2:
        columns = storage[-1].split()
        if len(columns) >= 4 and columns[3].isdigit():
            free_kb = int(columns[3])
    awake = re.search(r"mWakefulness=(\w+)", shell(serial, "dumpsys power"))
    uptime = shell(serial, "cat /proc/uptime").split()
    return {
        "batteryPercent": int(level.group(1)) if level else None,
        # dumpsys reports tenths of a degree.
        "temperatureC": int(temperature.group(1)) / 10 if temperature else None,
        # 2 is charging and 5 is full, in Android's BatteryManager.
        "charging": bool(charging and charging.group(1) in ("2", "5")),
        "freeStorageMb": free_kb // 1024 if free_kb is not None else None,
        "screen": awake.group(1) if awake else "",
        "upHours": round(float(uptime[0]) / 3600, 1) if uptime else None,
        "android": shell(serial, "getprop ro.build.version.release"),
        "model": shell(serial, "getprop ro.product.model"),
    }


VERSION_TEXT = re.compile(r"^\d+(\.\d+)*$")


def version_beside_label(hierarchy_xml):
    """The version printed beside "Android version" in a Settings screen dump.

    The label and its value are two text views under one row, so the value is
    the version-looking text closest to the label inside the label's parent,
    or the parent's parent on screens that nest one level deeper.
    """
    root = ElementTree.fromstring(hierarchy_xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    for node in root.iter("node"):
        if (node.get("text") or "").strip().lower() != "android version":
            continue
        holder = parents.get(node)
        for _ in range(3):
            if holder is None:
                break
            for other in holder.iter("node"):
                text = (other.get("text") or "").strip()
                if other is not node and VERSION_TEXT.match(text):
                    return text
            holder = parents.get(holder)
    return None


def action_android_version(serial, args, walk):
    """Opens Settings at About phone and reads the Android version off the screen.

    A test of the whole path: the rack reaching the phone, the phone opening an
    app, and the screen being read. The version Android itself reports is read
    too, so the answer can be checked against it.
    """
    from_system = shell(serial, "getprop ro.build.version.release")
    device = walk.screen()
    device.screen_on()
    walk.check()
    shell(serial, "am start -a android.settings.DEVICE_INFO_SETTINGS")
    time.sleep(2)
    walk.shot("Opened About phone")
    found = None
    # Pixels list it on About phone. Samsungs keep it one screen in, under
    # Software information. Either may need a scroll first.
    for attempt in range(4):
        walk.check()
        found = version_beside_label(device.dump_hierarchy())
        if found:
            break
        if attempt == 0 and device(text="Software information").exists:
            device(text="Software information").click()
            time.sleep(1.5)
            walk.shot("Opened Software information")
            continue
        scroller = device(scrollable=True)
        if scroller.exists:
            scroller.scroll.forward()
            time.sleep(1)
    if not found:
        walk.shot("Looked for the Android version")
        walk.home()
        raise StepFailed(
            "Find the Android version",
            "Settings opened, but no Android version was found on its screen. Android itself says %s." % from_system,
        )
    walk.shot("Read Android %s" % found)
    walk.home()
    return {"fromScreen": found, "fromSystem": from_system, "match": found == from_system}


# ---------------------------------------------------------------------------
# The apps Promo keeps an eye on, by Play Store package. Promo keeps the same
# list in src/lib/phones/options.ts.

APP_PACKAGES = {
    "reddit": "com.reddit.frontpage",
    "instagram": "com.instagram.android",
    "tiktok": "com.zhiliaoapp.musically",
}
APP_NAMES = {"reddit": "Reddit", "instagram": "Instagram", "tiktok": "TikTok"}
PLAY_STORE = "com.android.vending"

APPS_COMMAND = "for p in %s; do echo \"$p $(dumpsys package $p | grep -m1 versionName=)\"; done" % " ".join(
    APP_PACKAGES[app] for app in sorted(APP_PACKAGES)
)


def parse_app_versions(output):
    """Each tracked app's version from APPS_COMMAND's lines; an app not installed is left out."""
    by_package = dict((package, app) for app, package in APP_PACKAGES.items())
    versions = {}
    for line in output.splitlines():
        parts = line.strip().split(None, 1)
        if len(parts) < 2 or parts[0] not in by_package:
            continue
        found = re.search(r"versionName=(\S+)", parts[1])
        if found:
            versions[by_package[parts[0]]] = found.group(1)
    return versions


def app_version(serial, package):
    found = re.search(r"versionName=(\S+)", shell(serial, "dumpsys package %s | grep -m1 versionName=" % package, timeout=20))
    return found.group(1) if found else ""


def open_store_page(serial, package):
    shell(serial, "am start -a android.intent.action.VIEW -d 'market://details?id=%s' -p %s" % (package, PLAY_STORE))
    time.sleep(4)


UPDATE_BUTTON = {"textMatches": "(?i)^update$", "packageName": PLAY_STORE}


def action_check_updates(serial, args, walk):
    """The Play Store page of each tracked app on the phone: is Update showing?
    Nothing is pressed."""
    versions = parse_app_versions(shell(serial, APPS_COMMAND, timeout=30))
    apps = {}
    for app in sorted(versions):
        walk.check()
        open_store_page(serial, APP_PACKAGES[app])
        walk.shot("%s in the Play Store" % APP_NAMES[app])
        apps[app] = {"version": versions[app], "update": bool(walk.screen()(**UPDATE_BUTTON).exists)}
    walk.home()
    return {"apps": apps}


UPDATE_WAIT_SECONDS = 480


def action_update_app(serial, args, walk):
    """Presses Update on one app's Play Store page and waits for the new version."""
    app = str(args.get("app", ""))
    if app not in APP_PACKAGES:
        raise RuntimeError("%s is not an app the rack updates." % app)
    package, name = APP_PACKAGES[app], APP_NAMES[app]
    before = app_version(serial, package)
    if not before:
        raise StepFailed("Find %s on the phone" % name, "%s is not on this phone." % name)
    walk.check()
    open_store_page(serial, package)
    walk.shot("Opened %s in the Play Store" % name)
    walk.tap("Press Update", **UPDATE_BUTTON)
    deadline = time.time() + UPDATE_WAIT_SECONDS
    while time.time() < deadline:
        time.sleep(10)
        walk.check()
        after = app_version(serial, package)
        if after and after != before:
            walk.shot("Updated to %s" % after)
            walk.home()
            return {"app": app, "from": before, "to": after}
    walk.shot("Still updating")
    raise RuntimeError("%s did not finish updating within eight minutes. It may still finish by itself." % name)


# The actions the daily self-test walks, with the arguments a rehearsal uses.
# The app actions join this list as they are written (phone farm file 05).
REHEARSALS = {
    "phone/android-version": {},
}


def action_self_test(serial, args, walk, rehearsals=None):
    """Walks every action in REHEARSALS up to just before its last button.

    A rehearsal that cannot find a step is that action broken. The pictures
    of a broken one are all kept, so the step it stopped at can be seen;
    a passed one keeps only its last.
    """
    lines = []
    for name in sorted(rehearsals or REHEARSALS):
        walk.check()
        rehearsal = Walk(serial, rehearse=True, cancelled=walk.cancelled, connect=walk.connect)
        rehearsal.device = walk.device
        try:
            ACTIONS[name](serial, dict((rehearsals or REHEARSALS)[name]), rehearsal)
            lines.append({"action": name, "passed": True, "step": "", "error": ""})
            kept = rehearsal.steps[-1:]
        except Cancelled:
            raise
        except StepFailed as failure:
            lines.append({"action": name, "passed": False, "step": failure.step, "error": str(failure)})
            kept = rehearsal.steps
        except Exception as failure:  # Anything else is broken too, at the step it was on.
            lines.append({"action": name, "passed": False, "step": rehearsal.current, "error": str(failure) or failure.__class__.__name__})
            kept = rehearsal.steps
        walk.device = rehearsal.device
        walk.steps.extend(("%s: %s" % (name, step), jpeg) for step, jpeg in kept)
        walk.home()
    return {"actions": lines}


ACTIONS = {
    "phone/list": action_list,
    "phone/health": action_health,
    "phone/android-version": action_android_version,
    "phone/self-test": action_self_test,
    "phone/check-updates": action_check_updates,
    "phone/update-app": action_update_app,
}


# ---------------------------------------------------------------------------
# Ban screens. After any app action the screen is read for the app's
# suspended, locked and "confirm it's you" screens. A match is sent with the
# answer and Promo stops the account.
#
# The wording is what each app is known to show. A phrase only counts as a
# whole line of the app's own text, on a screen with few lines, so a post
# titled "Account suspended after one comment?" is not taken for one. Phrases
# that also appear about other people are left out: Reddit shows "This
# account has been suspended" on any suspended user's profile.

BAN_SCREENS = [
    ("reddit", "suspended", ["your account has been suspended", "your account has been permanently suspended"]),
    ("reddit", "locked", ["your account has been locked", "we've locked your account"]),
    ("reddit", "confirm", ["confirm it's you", "verify it's you", "verify your identity"]),
    ("instagram", "suspended", [
        "we suspended your account",
        "your account has been suspended",
        "your account has been disabled",
        "we disabled your account",
    ]),
    ("instagram", "locked", [
        "your account has been locked",
        "your account has been temporarily locked",
        "we've locked your account",
    ]),
    ("instagram", "confirm", ["confirm it's you", "help us confirm it's you", "we detected unusual activity"]),
    ("tiktok", "suspended", [
        "your account was permanently banned",
        "your account is permanently banned",
        "your account has been banned",
        "your account was suspended",
    ]),
    ("tiktok", "confirm", ["verify it's you", "confirm it's you"]),
]

# A ban screen is a page of a few lines. A feed has many more.
BAN_SCREEN_MAX_LINES = 30


def screen_lines(hierarchy_xml, package=None):
    """The text on screen, in order, from the given app's own views only."""
    lines = []
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        if package and node.get("package") not in (None, "", package):
            continue
        for key in ("text", "content-desc"):
            text = " ".join((node.get(key) or "").split())
            if text and text not in lines:
                lines.append(text)
    return lines


def plain(text):
    return text.lower().replace(u"’", "'")


def ban_screen_in(hierarchy_xml, app):
    """The ban screen showing, as {app, kind, words}, or None."""
    lines = screen_lines(hierarchy_xml, APP_PACKAGES.get(app))
    if not lines or len(lines) > BAN_SCREEN_MAX_LINES:
        return None
    for screen_app, kind, phrases in BAN_SCREENS:
        if screen_app != app:
            continue
        for line in lines:
            if plain(line) in phrases:
                return {"app": app, "kind": kind, "words": " ".join(lines)[:500]}
    return None


def ban_screen_on(serial, app):
    try:
        return ban_screen_in(connect_screen(serial).dump_hierarchy(), app)
    except Exception as failure:  # A screen that cannot be read is not a ban screen.
        log("Could not read the screen of %s for a ban screen: %s" % (serial, failure))
        return None


def action_app(name):
    """The app an action works in: "reddit" for reddit/comment, or None."""
    app = name.split("/", 1)[0]
    return app if app in APP_PACKAGES else None


# ---------------------------------------------------------------------------
# Freezes. An action still running near the end of its time is given up on:
# a phone that no longer answers adb is restarted, otherwise the app in front
# is closed and opened again. An app Android itself says is not responding is
# closed the same way when its action fails.

# Enough to check adb, restart or reopen, read the screen and hand in the answer.
FREEZE_MARGIN_SECONDS = 60
RESTART_GAP_SECONDS = 30 * 60
# A phone the rack restarted is reported as restarting, not unplugged, for this long.
RESTART_GRACE_SECONDS = 4 * 60

NOT_RESPONDING = ("isn't responding", "is not responding", "keeps stopping", "has stopped")
CLOSE_BUTTONS = ("Close app", "Close", "OK")

SCREEN_PACKAGES = {
    "phone/android-version": "com.android.settings",
    "phone/check-updates": PLAY_STORE,
    "phone/update-app": PLAY_STORE,
}

_RESTARTED_AT = {}
_RESTART_WHY = {}
_RESTART_LOCK = threading.Lock()


def phone_answers(serial):
    try:
        return shell(serial, "echo ok", timeout=10) == "ok"
    except (RuntimeError, subprocess.TimeoutExpired):
        return False


def restart_phone(serial, why):
    """Restarts a phone, at most once in half an hour, so a phone that keeps
    freezing is left for a person rather than restarted over and over."""
    with _RESTART_LOCK:
        if time.time() - _RESTARTED_AT.get(serial, 0) < RESTART_GAP_SECONDS:
            log("%s froze again within half an hour of a restart, so it is left for a person." % serial)
            return False
        _RESTARTED_AT[serial] = time.time()
        _RESTART_WHY[serial] = why
    try:
        adb(["reboot"], serial=serial, timeout=20)
    except (RuntimeError, subprocess.TimeoutExpired) as failure:
        log("Could not restart %s: %s" % (serial, failure))
        return False
    log("Restarted %s: %s" % (serial, why))
    return True


def restarting_as_such(phones):
    """Reports a phone the rack just restarted as "restarting" while it boots,
    rather than as unplugged or offline."""
    now = time.time()
    with _RESTART_LOCK:
        booting = set(serial for serial, at in _RESTARTED_AT.items() if now - at < RESTART_GRACE_SECONDS)
    listed = set()
    for phone in phones:
        listed.add(phone["serial"])
        if phone["serial"] in booting and phone["state"] != "device":
            phone["state"] = "restarting"
    for serial in booting - listed:
        phones.append({"serial": serial, "state": "restarting", "usb": "", "model": "", "android": ""})
    return phones


def foreground_package(serial):
    try:
        found = re.search(r"mCurrentFocus=\S*\s+\S+\s+([A-Za-z0-9_.]+)/", shell(serial, "dumpsys window | grep mCurrentFocus", timeout=10))
    except (RuntimeError, subprocess.TimeoutExpired):
        return ""
    return found.group(1) if found else ""


def reopen_app(serial, package):
    shell(serial, "am force-stop %s" % package, timeout=15)
    shell(serial, "monkey -p %s -c android.intent.category.LAUNCHER 1" % package, timeout=15)


def action_package(name):
    app = action_app(name)
    return APP_PACKAGES[app] if app else SCREEN_PACKAGES.get(name, "")


def recover_frozen(serial, name):
    """What to do about an action that did not finish in time: (what was done, words)."""
    if not phone_answers(serial):
        if restart_phone(serial, "It stopped answering during %s, so the rack restarted it." % name):
            return "phone", "The phone stopped answering, so the rack restarted it. %s was not finished." % name
        return "", "The phone stopped answering again soon after a restart, so the rack left it for you. %s was not finished." % name
    package = foreground_package(serial) or action_package(name)
    if not package:
        return "", "%s did not finish in time." % name
    try:
        reopen_app(serial, package)
    except (RuntimeError, subprocess.TimeoutExpired) as failure:
        return "", "%s did not finish in time, and the app could not be closed: %s" % (name, failure)
    return "app", "The app stopped responding, so the rack closed it and opened it again. %s was not finished; nothing more was pressed." % name


def close_not_responding(serial, name):
    """Closes Android's "isn't responding" box if one is up, and opens the app again.
    Returns words for the answer, or empty when there was none."""
    try:
        device = connect_screen(serial)
        lines = screen_lines(device.dump_hierarchy())
    except Exception:  # No screen to read is no box to close.
        return ""
    said = next((line for line in lines if any(words in plain(line) for words in NOT_RESPONDING)), "")
    if not said:
        return ""
    for label in CLOSE_BUTTONS:
        try:
            if device(text=label).exists:
                device(text=label).click()
                break
        except Exception:  # The box went by itself.
            break
    package = action_package(name)
    if package:
        try:
            reopen_app(serial, package)
        except (RuntimeError, subprocess.TimeoutExpired):
            pass
    return 'Android said "%s", so the rack closed the app and opened it again.' % said


# ---------------------------------------------------------------------------
# Screens. While someone has a phone's window open in Promo, this sends a
# picture of its screen a few times a second and carries back the taps and
# typing, which Promo hands over only while that person has control on. It
# also looks for a code texted to the phone. Texts are never written down.

SCREEN_GAP_SECONDS = 0.3
IDLE_SCREEN_GAP_SECONDS = 2
TEXT_GAP_SECONDS = 4
# A texted code older than this is not shown.
TEXT_WINDOW_MS = 10 * 60 * 1000
CODE_PATTERN = re.compile(r"(?<![\d])(\d{4,8})(?![\d])")

KEYCODES = {
    "back": "KEYCODE_BACK",
    "home": "KEYCODE_HOME",
    "recents": "KEYCODE_APP_SWITCH",
    "enter": "KEYCODE_ENTER",
    "delete": "KEYCODE_DEL",
}


def screen_frame(device):
    """A picture of the screen, shrunk, with the phone's own size for placing taps."""
    image = device.screenshot()
    width, height = image.width, image.height
    if width > SCREENSHOT_WIDTH:
        image = image.resize((SCREENSHOT_WIDTH, round(height * SCREENSHOT_WIDTH / width)))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=60)
    return buffer.getvalue(), width, height


def typed_text(text):
    """`input text`'s own spelling, quoted for the phone's shell: spaces are %s."""
    return "'%s'" % text.replace("'", "'\\''").replace(" ", "%s")


def apply_input(serial, item, size):
    width, height = size
    kind = item.get("kind")
    if kind == "tap":
        shell(serial, "input tap %d %d" % (round(item["x"] * width), round(item["y"] * height)))
    elif kind == "swipe":
        shell(serial, "input swipe %d %d %d %d 300" % (
            round(item["x1"] * width), round(item["y1"] * height),
            round(item["x2"] * width), round(item["y2"] * height),
        ))
    elif kind == "text":
        shell(serial, "input text %s" % typed_text(str(item.get("text", ""))[:500]))
    elif kind == "key" and item.get("key") in KEYCODES:
        shell(serial, "input keyevent %s" % KEYCODES[item["key"]])


def newest_code(messages, now_ms):
    """The newest code in messages of (sender, body, time in ms) from the last ten minutes."""
    for sender, body, at in sorted(messages, key=lambda message: message[2], reverse=True):
        if now_ms - at > TEXT_WINDOW_MS:
            continue
        found = CODE_PATTERN.search(body)
        if found:
            return {"code": found.group(1), "from": sender[:80]}
    return None


def parse_sms_rows(output):
    """`content query` rows: Row: 0 address=..., body=..., date=..."""
    messages = []
    for line in output.splitlines():
        found = re.match(r"^Row: \d+ address=(.*?), body=(.*), date=(\d+)\s*$", line.strip())
        if found:
            messages.append((found.group(1), found.group(2), int(found.group(3))))
    return messages


def parse_notification_texts(output, now_ms):
    """Message notifications' text, from `dumpsys notification --noredact`."""
    messages = []
    block_is_messages = False
    title = ""
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("NotificationRecord("):
            block_is_messages = bool(re.search(r"pkg=\S*(messaging|mms|sms)", stripped))
            title = ""
        elif block_is_messages and stripped.startswith("android.title="):
            title = re.sub(r"^android\.title=\w+ \((.*)\)$", r"\1", stripped)
        elif block_is_messages and stripped.startswith("android.text="):
            text = re.sub(r"^android\.text=\w+ \((.*)\)$", r"\1", stripped)
            messages.append((title, text, now_ms))
    return messages


def read_texted_code(serial):
    """The newest code texted to the phone, from its inbox or, if Android refuses that, its notifications."""
    now_ms = int(time.time() * 1000)
    since = now_ms - TEXT_WINDOW_MS
    try:
        output = shell(
            serial,
            "content query --uri content://sms/inbox --projection address:body:date --where \"date>%d\"" % since,
            timeout=10,
        )
        if "Error" not in output and "Exception" not in output:
            return newest_code(parse_sms_rows(output), now_ms)
    except (RuntimeError, subprocess.TimeoutExpired):
        pass
    try:
        return newest_code(parse_notification_texts(shell(serial, "dumpsys notification --noredact", timeout=10), now_ms), now_ms)
    except (RuntimeError, subprocess.TimeoutExpired):
        return None


def screen_loop(config):
    """Runs for as long as the program does. A turn that fails for any reason
    is logged and the next one tried, so screens never stop for good."""
    state = {"wanted": [], "devices": {}, "sizes": {}, "texts_read_at": {}, "warned": set()}
    while True:
        try:
            gap = screen_turn(config, state)
        except Exception as failure:  # Anything unforeseen; the loop must outlive it.
            log("Screens stopped a turn: %s" % failure)
            gap = 10
        time.sleep(gap)


def screen_turn(config, state):
    """One turn: pictures and texted codes for the watched phones, out; which
    phones to watch and their taps, back. Returns how long to wait."""
    devices, sizes, texts_read_at, warned = state["devices"], state["sizes"], state["texts_read_at"], state["warned"]
    frames, texts = [], []
    for serial in state["wanted"]:
        try:
            device = devices.get(serial) or connect_screen(serial)
            devices[serial] = device
            jpeg, width, height = screen_frame(device)
            sizes[serial] = (width, height)
            frames.append({"serial": serial, "jpeg": base64.b64encode(jpeg).decode("ascii"), "width": width, "height": height})
            warned.discard(serial)
        except Exception as failure:  # A phone pulled out mid-picture; try again next turn.
            devices.pop(serial, None)
            if serial not in warned:
                log("No picture from %s: %s" % (serial, failure))
                warned.add(serial)
        if time.time() - texts_read_at.get(serial, 0) > TEXT_GAP_SECONDS:
            texts_read_at[serial] = time.time()
            code = read_texted_code(serial)
            if code:
                texts.append(dict(code, serial=serial))

    try:
        reply = call(config, "/api/rack/screen", {"frames": frames, "texts": texts})
    except (CallFailed, Refused) as failure:
        log("Screens: %s" % failure)
        return 10
    wanted = [serial for serial in reply.get("wanted") or [] if isinstance(serial, str)]
    state["wanted"] = wanted

    for serial, items in (reply.get("inputs") or {}).items():
        if serial not in sizes:
            continue
        for item in items:
            try:
                apply_input(serial, item, sizes[serial])
            except (RuntimeError, subprocess.TimeoutExpired, KeyError, TypeError, ValueError) as failure:
                log("A tap on %s did not go through: %s" % (serial, failure))
    for serial in list(devices):
        if serial not in wanted:
            devices.pop(serial, None)
            texts_read_at.pop(serial, None)
    return SCREEN_GAP_SECONDS if wanted else IDLE_SCREEN_GAP_SECONDS


# ---------------------------------------------------------------------------
# Readings. Once a minute each phone's battery, heat, storage, SIM signal and
# time since it started, and every ten minutes each app's version, in one adb
# call each. The newest goes to Promo with the next check-in. A phone that
# misses three readings in a row while adb still lists it has frozen, and is
# restarted.

VITALS_SECONDS = 60
APPS_SECONDS = 600
UNANSWERED_LIMIT = 3

VITALS_COMMAND = (
    "dumpsys battery; echo @@; df /data; echo @@; cat /proc/uptime; echo @@; "
    "dumpsys telephony.registry | grep mServiceState="
)

SERVICE_WORDS = {
    "0": "in_service", "IN_SERVICE": "in_service",
    "1": "out_of_service", "OUT_OF_SERVICE": "out_of_service",
    "2": "emergency_only", "EMERGENCY_ONLY": "emergency_only",
    "3": "power_off", "POWER_OFF": "power_off",
}

_VITALS = {}
_VITALS_LOCK = threading.Lock()


def service_state(lines):
    """The best service any SIM slot has: in service beats the rest."""
    found = []
    for line in lines:
        for match in re.finditer(r"m(?:Voice|Data)RegState=(\d)(?:\((\w+)\))?", line):
            found.append(SERVICE_WORDS.get(match.group(2) or match.group(1), ""))
        # Older Androids print the voice state first: mServiceState=0 1 ...
        old = re.match(r"^\s*mServiceState=(\d)\s", line)
        if old:
            found.append(SERVICE_WORDS.get(old.group(1), ""))
    found = [word for word in found if word]
    if "in_service" in found:
        return "in_service"
    return found[0] if found else ""


def parse_vitals(output):
    parts = (output.split("@@") + ["", "", "", ""])[:4]
    battery, storage, uptime, telephony = parts
    level = re.search(r"^\s*level:\s*(\d+)", battery, re.M)
    temperature = re.search(r"^\s*temperature:\s*(-?\d+)", battery, re.M)
    used = None
    rows = [line.split() for line in storage.strip().splitlines()[1:]]
    if rows and len(rows[-1]) >= 4 and rows[-1][2].isdigit() and rows[-1][3].isdigit():
        total = int(rows[-1][2]) + int(rows[-1][3])
        used = round(100 * int(rows[-1][2]) / total) if total else None
    up = uptime.split()
    return {
        "batteryPercent": int(level.group(1)) if level else None,
        # dumpsys reports tenths of a degree.
        "temperatureC": int(temperature.group(1)) / 10 if temperature else None,
        "storageUsedPercent": used,
        "signal": service_state(telephony.splitlines()),
        "upSeconds": int(float(up[0])) if up and re.match(r"^[\d.]+$", up[0]) else None,
        "apps": None,
        "restartWhy": "",
    }


def keep_reading(serial, reading):
    """Holds the newest reading for the next check-in. A restart's reason or
    app versions still waiting to be sent are carried onto it."""
    with _VITALS_LOCK:
        waiting = _VITALS.get(serial)
        if waiting and waiting.get("restartWhy") and not reading.get("restartWhy"):
            reading["restartWhy"] = waiting["restartWhy"]
        if waiting and waiting.get("apps") is not None and reading.get("apps") is None:
            reading["apps"] = waiting["apps"]
        _VITALS[serial] = reading


def put_back_reading(serial, reading):
    """A reading Promo did not receive goes back, unless a newer one is already
    waiting, which then carries its restart reason and app versions."""
    with _VITALS_LOCK:
        newer = _VITALS.get(serial)
        if newer is None:
            _VITALS[serial] = reading
            return
        if reading.get("restartWhy") and not newer.get("restartWhy"):
            newer["restartWhy"] = reading["restartWhy"]
        if reading.get("apps") is not None and newer.get("apps") is None:
            newer["apps"] = reading["apps"]


def take_reading(serial):
    with _VITALS_LOCK:
        return _VITALS.pop(serial, None)


def vitals_turn(state, now=None):
    now = now or time.time()
    for phone in parse_devices(adb(["devices", "-l"], timeout=15)):
        serial = phone["serial"]
        if phone["state"] != "device" or now - state["read_at"].get(serial, 0) < VITALS_SECONDS:
            continue
        state["read_at"][serial] = now
        try:
            reading = parse_vitals(shell(serial, VITALS_COMMAND, timeout=20))
            if now - state["apps_at"].get(serial, 0) >= APPS_SECONDS:
                reading["apps"] = parse_app_versions(shell(serial, APPS_COMMAND, timeout=30))
                state["apps_at"][serial] = now
        except (RuntimeError, subprocess.TimeoutExpired) as failure:
            missed = state["missed"].get(serial, 0) + 1
            state["missed"][serial] = missed
            log("No reading from %s (%d in a row): %s" % (serial, missed, failure))
            if missed >= UNANSWERED_LIMIT:
                state["missed"][serial] = 0
                restart_phone(serial, "It stopped answering for three minutes, so the rack restarted it.")
            continue
        state["missed"][serial] = 0
        # The reason for a restart the rack did goes with the first reading
        # taken after it, which is the one Promo sees the time-since-start drop in.
        with _RESTART_LOCK:
            restarted_at = _RESTARTED_AT.get(serial, 0)
            if serial in _RESTART_WHY and reading["upSeconds"] is not None and reading["upSeconds"] < now - restarted_at + 30:
                reading["restartWhy"] = _RESTART_WHY.pop(serial)
        keep_reading(serial, reading)


def vitals_loop():
    """Runs for as long as the program does; a turn that fails is logged and the next one tried."""
    state = {"read_at": {}, "apps_at": {}, "missed": {}}
    while True:
        try:
            vitals_turn(state)
        except Exception as failure:  # Anything unforeseen; the loop must outlive it.
            log("Readings stopped a turn: %s" % failure)
        time.sleep(5)


# ---------------------------------------------------------------------------
# The loop

def platform_name():
    if sys.platform == "darwin":
        return ("macOS %s" % platform.mac_ver()[0]).strip()
    return platform.system() or sys.platform


def check_in(config):
    state = load_state()
    note = state.get("rolledBack")
    phones = list_phones()
    taken = {}
    for phone in phones:
        reading = take_reading(phone["serial"]) if phone["state"] == "device" else None
        if reading:
            phone["vitals"] = taken[phone["serial"]] = reading
    try:
        reply = call(config, "/api/rack/check-in", {
            "version": VERSION,
            "platform": platform_name(),
            "phones": phones,
            "rolledBack": note if isinstance(note, dict) else None,
        })
    except (CallFailed, Refused):
        # Not received, so the readings wait for the next check-in.
        for serial, reading in taken.items():
            put_back_reading(serial, reading)
        raise
    # Tells the launcher this version works, so it stops watching it.
    if state.get("checkedIn") != VERSION or state.get("pending"):
        update_state(checkedIn=VERSION, pending=None)
    return reply


def install_update(config, latest):
    """Downloads a version Promo offers, checks it, and switches to it."""
    release = call(config, "/api/rack/release", {"version": latest})
    source = release.get("source") or ""
    if release.get("version") != latest:
        raise CallFailed("Promo offered %s but sent %s." % (latest, release.get("version")))
    if sha256_hex(source.encode("utf-8")) != release.get("sha256"):
        raise CallFailed("The download of %s did not match its checksum." % latest)
    if ('VERSION = "%s"' % latest) not in source:
        raise CallFailed("The download of %s does not say it is %s." % (latest, latest))
    folder = os.path.join(HOME, "versions", latest)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "promo_rack.py"), "w", encoding="utf-8") as handle:
        handle.write(source)
    update_state(
        previous=VERSION,
        current=latest,
        pending={"version": latest, "since": time.time()},
        rolledBack=None,
    )
    log("Installed %s. Restarting on it." % latest)
    sys.exit(EXIT_SWITCH)


# The actions running now, so the program never switches version under one.
_RUNNING = set()
_RUNNING_LOCK = threading.Lock()


def start_action(config, action):
    """Runs one action on a thread of its own, so another phone's can start meanwhile."""
    with _RUNNING_LOCK:
        _RUNNING.add(action["id"])

    def work():
        try:
            run_action(config, action)
        finally:
            with _RUNNING_LOCK:
                _RUNNING.discard(action["id"])

    threading.Thread(target=work, name="action-%s" % action["id"][:8], daemon=True).start()


def actions_running():
    with _RUNNING_LOCK:
        return len(_RUNNING)


def run_action(config, action):
    name = action.get("action", "")
    serial = action.get("serial", "")
    walk = Walk(serial)
    ok, result, error, recovered = False, None, "", ""
    handler = ACTIONS.get(name)
    if handler is None:
        error = "This rack does not know the action %s." % name
    else:
        ok, result, error, recovered = run_watched(handler, serial, action, walk)
    ban = ban_screen_on(serial, action_app(name)) if action_app(name) else None
    log("%s on %s: %s" % (name, serial, "done" if ok else error))
    answer = {
        "id": action["id"],
        "ok": ok,
        "result": result,
        "error": error,
        "steps": [{"step": step, "jpeg": base64.b64encode(jpeg).decode("ascii")} for step, jpeg in capped(list(walk.steps))],
        "banScreen": ban,
        "recovered": recovered,
    }
    # The answer is worth a few tries: a comment that went out must be
    # reported, or Promo calls it failed when it was not.
    for attempt in range(5):
        try:
            call(config, "/api/rack/result", answer)
            return
        except (CallFailed, Refused) as failure:
            log("Could not hand in the answer to %s (%s). %s" % (name, attempt + 1, failure))
            time.sleep(5)


# Promo keeps at most this many pictures an action.
MAX_STEPS = 30


def capped(steps):
    """The first steps and the last, where an action stopped, when there are too many."""
    return steps if len(steps) <= MAX_STEPS else steps[:MAX_STEPS - 1] + steps[-1:]


# However short an action's time, it gets at least this long before it counts as frozen.
MIN_WATCH_SECONDS = 30


def watch_seconds(action):
    """How long an action may run here: its time in Promo, less a margin to reopen the app."""
    return max(MIN_WATCH_SECONDS, int(action.get("timeoutSeconds") or 300) - FREEZE_MARGIN_SECONDS)


def run_watched(handler, serial, action, walk):
    """Runs one action, giving up on it shortly before Promo would.

    Returns (ok, result, error, recovered). A frozen action's thread is left
    behind; its Walk is cancelled, so it presses nothing more if it wakes.
    """
    name = action.get("action", "")
    outcome = {}

    def work():
        try:
            outcome["result"] = handler(serial, action.get("args") or {}, walk)
        except Exception as failure:  # Reported below either way.
            outcome["error"] = failure

    worker = threading.Thread(target=work, name="steps-%s" % action["id"][:8], daemon=True)
    worker.start()
    worker.join(watch_seconds(action))
    if worker.is_alive():
        walk.cancelled.set()
        recovered, words = recover_frozen(serial, name)
        return False, None, words, recovered
    if "error" not in outcome:
        return True, outcome.get("result"), "", ""
    failure = outcome["error"]
    error = str(failure) or failure.__class__.__name__
    closed = close_not_responding(serial, name) if action_package(name) else ""
    return False, None, ("%s %s" % (error, closed)).strip(), "app" if closed else ""


def run():
    config = read_json(CONFIG_PATH, None)
    if not config:
        log("This rack is not paired. Run the install command from the Phones dashboard.")
        sys.exit(1)
    log("Promo rack %s started, talking to %s." % (VERSION, config["url"]))
    threading.Thread(target=screen_loop, args=(config,), name="screens", daemon=True).start()
    threading.Thread(target=vitals_loop, name="readings", daemon=True).start()
    interval = DEFAULT_CHECK_IN_SECONDS
    last_check_in = 0.0
    while True:
        current = load_state().get("current")
        if current and current != VERSION and not actions_running():
            log("Switching to %s." % current)
            sys.exit(EXIT_SWITCH)
        try:
            if time.time() - last_check_in >= interval:
                reply = check_in(config)
                last_check_in = time.time()
                interval = int(reply.get("checkInSeconds") or DEFAULT_CHECK_IN_SECONDS)
                latest = reply.get("latestVersion")
                # Never under a running action: it would be cut off half-way.
                if (
                    latest
                    and latest != VERSION
                    and latest not in (load_state().get("failed") or [])
                    and not actions_running()
                ):
                    install_update(config, latest)
            work = call(config, "/api/rack/next", {}).get("action")
            if work:
                start_action(config, work)
                continue
            time.sleep(POLL_SECONDS)
        except Refused as refusal:
            log("Promo refused this rack: %s Trying again in a minute." % refusal)
            time.sleep(60)
        except (CallFailed, RuntimeError, subprocess.TimeoutExpired) as failure:
            log(str(failure))
            time.sleep(10)


def pair(url, code, name):
    body = json.dumps({
        "code": code,
        "name": name,
        "platform": platform_name(),
        "version": VERSION,
    }).encode("utf-8")
    request = urllib.request.Request(
        url.rstrip("/") + "/api/rack/pair",
        data=body,
        method="POST",
        headers={"content-type": "application/json"},
    )
    try:
        with urllib.request.urlopen(request, timeout=HTTP_TIMEOUT_SECONDS) as response:
            answer = json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as error:
        print(answer_message(error.read()) or "Promo refused the code.", file=sys.stderr)
        sys.exit(1)
    except (urllib.error.URLError, OSError) as error:
        print("Could not reach Promo at %s: %s" % (url, error), file=sys.stderr)
        sys.exit(1)
    write_json(CONFIG_PATH, {"url": url.rstrip("/"), "rackId": answer["rackId"], "key": answer["key"]}, private=True)
    update_state(current=VERSION, previous=None, pending=None, checkedIn=None, rolledBack=None)
    print("Paired with %s as %s." % (url, name))


def main():
    parser = argparse.ArgumentParser(description="Promo's rack program.")
    commands = parser.add_subparsers(dest="command", required=True)
    pairing = commands.add_parser("pair", help="Swap a one-time code from the Phones dashboard for this rack's key.")
    pairing.add_argument("--url", required=True)
    pairing.add_argument("--code", required=True)
    pairing.add_argument("--name", default=platform.node() or "Rack")
    commands.add_parser("run", help="Check in and run actions until stopped.")
    commands.add_parser("phones", help="Print the phones adb can see.")
    arguments = parser.parse_args()
    if arguments.command == "pair":
        pair(arguments.url, arguments.code, arguments.name)
    elif arguments.command == "phones":
        print(json.dumps(list_phones(), indent=2))
    else:
        run()


if __name__ == "__main__":
    main()
