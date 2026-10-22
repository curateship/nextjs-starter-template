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

Reddit runs through the Reddit app itself: who is signed in, the account's
health and the comment, answering in the browser's own shapes. Instagram and
TikTok run only here, in their apps: who is signed in, the daily reading with
the Account status page, the profile, a post, and reading and answering
messages and comments, which the phones' own notifications say have arrived. Taps land a
little off the middle of a button, swipes bend, and typing keeps a person's
rhythm. The setup check reads what a platform could notice about a phone
(Wi-Fi beside a SIM, location allowed, a clock or language from another
country, apps updating themselves, the address the internet sees), and the
wipe erases a phone through its own Settings before it gets a new account.

Commands:
  promo_rack.py pair --url https://promo.example --code ABCD-EFGH [--name "Rack"]
  promo_rack.py run
  promo_rack.py phones        (prints what adb sees, for checking by hand)

It is written for the Python that ships with macOS (3.9) and for Linux, using
only the standard library, except uiautomator2, which reads phone screens and
is only imported by the actions that need it. iPhones are driven through the
file beside this one, iphone.py (phone farm file 08), which owns every word
spoken to pymobiledevice3 and WebDriverAgent; this file only asks it for the
list of iPhones, a screen that answers like a uiautomator2 device, the
minute's reading, each app's version when it offers that, and when the
WebDriverAgent signature runs out. A rack without that file, or with a
driver that fails, lists no iPhones and says so once in the log. On an
iPhone the three apps run through their own iOS buttons (APP_SCREENS, keyed
by bundle id), the setup check reads iOS's Settings and Safari, updates come
from the App Store, a wipe is refused until Promo says the Apple ID is
signed out, and a post's file reaches Photos through a one-time link opened
in Safari, since a computer cannot drop a file into an iPhone's Photos.

The launcher beside it (launcher.py) starts this file, swaps in a new version
when Promo offers one, and goes back to the old one if the new one does not
check in within two minutes. The file's own VERSION is the only version there
is: Promo reads it out of the same file it serves.
"""

import argparse
import base64
import collections
import hashlib
import hmac
import io
import json
import math
import os
import platform
import random
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

# The iPhone driver lives beside this file. A rack without it is an
# adb-only rack, exactly as before iPhones joined; nothing below may fail
# because it is missing.
try:
    import iphone
    _IPHONE_IMPORT_ERROR = None
except Exception as _failure:  # A missing file, or one its own imports break.
    iphone = None
    _IPHONE_IMPORT_ERROR = _failure

VERSION = "2026.10.18.1"

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
# Where the Mac's LaunchAgent (rack/install.sh) sends this program's output.
# On Linux the journal holds it and there is no file.
LOG_PATH = os.path.join(HOME, "rack.log")


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
            "kind": "android",
        })
    return phones


# Each phone's model, system version and time zone, read once while it stays
# plugged in. An iPhone's come with the driver's list and are kept here too,
# so phone/android-version can check the screen against them.
_PROPS = {}

# Which kind each serial is, "android" or "iphone", filled by list_phones()
# and never emptied, so a running action still knows its phone's kind after
# the phone is unplugged mid-way.
_KINDS = {}

# Failures of the iPhone driver already written to the log, so a rack
# without iPhones does not say so every 15 seconds.
_IPHONE_WARNED = set()


def is_iphone(serial):
    return _KINDS.get(serial) == "iphone"


def warn_once(key, words):
    if key not in _IPHONE_WARNED:
        _IPHONE_WARNED.add(key)
        log(words)


def list_iphones_safely():
    """The driver's list of iPhones, or none when there is no driver or it
    fails, said once in the log. The Android list never waits on this."""
    if iphone is None:
        warn_once("import", "The iPhone driver (iphone.py) is not beside the program, so no iPhones are listed: %s" % _IPHONE_IMPORT_ERROR)
        return []
    try:
        phones = [dict(phone) for phone in (iphone.list_iphones() or []) if isinstance(phone, dict) and phone.get("serial")]
    except Exception as failure:  # The driver's own trouble; the Androids are still listed.
        warn_once("list", "The iPhone driver could not list iPhones, so none are listed: %s" % (str(failure) or failure.__class__.__name__))
        return []
    _IPHONE_WARNED.discard("list")
    for phone in phones:
        phone["kind"] = "iphone"
        for key in ("state", "usb", "model", "android"):
            phone.setdefault(key, "")
    return phones


def wda_expires_at():
    """When WebDriverAgent's signature runs out, for the check-in, or None
    when there is no driver, it was never signed, or the driver cannot say."""
    if iphone is None:
        return None
    try:
        value = iphone.wda_expires_at()
    except Exception as failure:  # Not knowing is answered as unknown, never as a crash.
        warn_once("wda", "The iPhone driver could not say when WebDriverAgent's signature runs out: %s" % (str(failure) or failure.__class__.__name__))
        return None
    _IPHONE_WARNED.discard("wda")
    return str(value) if value else None


def list_phones():
    androids = parse_devices(adb(["devices", "-l"], timeout=15))
    for phone in androids:
        _KINDS[phone["serial"]] = "android"
    iphones = list_iphones_safely()
    for phone in iphones:
        _KINDS[phone["serial"]] = "iphone"
    phones = restarting_as_such(androids + iphones)
    present = set()
    for phone in phones:
        serial = phone["serial"]
        present.add(serial)
        if phone["state"] != "device":
            continue
        if phone.get("kind") == "iphone":
            _PROPS[serial] = {key: str(phone.get(key) or "") for key in ("model", "android", "timezone")}
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
    for serial in list(_IPHONE_SCREENS):
        if serial not in present:
            _IPHONE_SCREENS.pop(serial, None)
    return phones


def iphone_system_version(serial):
    """The iOS version the phone itself reports over USB, from the last list."""
    version = _PROPS.get(serial, {}).get("android", "")
    if not version:
        for phone in list_iphones_safely():
            if phone["serial"] == serial:
                version = str(phone.get("android") or "")
    return version


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


# One screen object per iPhone, shared by every helper below and the screen
# window, dropped when the phone leaves the list.
_IPHONE_SCREENS = {}


def iphone_screen(serial):
    """The iPhone's screen through the driver, which answers like a uiautomator2 device."""
    if iphone is None:
        raise RuntimeError("The iPhone driver (iphone.py) is not beside the program, so %s cannot be driven." % serial)
    screen = _IPHONE_SCREENS.get(serial)
    if screen is None:
        screen = iphone.IphoneScreen(serial)
        _IPHONE_SCREENS[serial] = screen
    return screen


def connect_screen(serial):
    if is_iphone(serial):
        return iphone_screen(serial)
    try:
        import uiautomator2
    except ImportError:
        raise RuntimeError("uiautomator2 is not installed on the rack. Run the install command again.")
    return uiautomator2.connect(serial)


def wake_screen(device):
    """Turns the screen on: uiautomator2's screen_on, or the iPhone driver's,
    which is WebDriverAgent's unlock."""
    device.screen_on()


def screenshot_jpeg(device):
    image = device.screenshot()
    if image.width > SCREENSHOT_WIDTH:
        height = round(image.height * SCREENSHOT_WIDTH / image.width)
        image = image.resize((SCREENSHOT_WIDTH, height))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=70)
    return buffer.getvalue()


# The buttons that send something. A rehearsal may find them, never press them.
# Reddit's comment box sends with Post, Reply or Comment, depending on the version.
# The App Store's Install and a wipe's Erase are last buttons too.
LAST_BUTTONS = ("post", "send", "share", "reply", "comment", "install", "erase")


def selector_words(selector):
    for key in ("text", "textMatches", "description", "descriptionMatches", "resourceId", "resourceIdMatches"):
        if key in selector:
            return '"%s"' % selector[key]
    return "the button"


def could_be_last_button(selector):
    """True when a selector could find Post, Send or Share, by its words or a pattern."""
    for key in ("text", "description"):
        if plain(str(selector.get(key, ""))) in LAST_BUTTONS:
            return True
    for key in ("textMatches", "descriptionMatches"):
        pattern = selector.get(key)
        if pattern:
            try:
                if any(re.match(pattern, word) or re.match(pattern, word.title()) for word in LAST_BUTTONS):
                    return True
            except re.error:
                return True
    return False


def element_bounds(element):
    """An element's place on screen as (left, top, right, bottom), or None when it cannot say."""
    try:
        bounds = element.info["bounds"]
        return (int(bounds["left"]), int(bounds["top"]), int(bounds["right"]), int(bounds["bottom"]))
    except Exception:  # A fake screen, or an element that went away; pressed the plain way.
        return None


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
        self.press(element)
        time.sleep(1)
        self.shot(step)

    def press(self, element):
        """Presses a found element a little off its middle, the way a thumb
        lands, after a short look. An element that cannot say where it is
        (a test's fake screen) is pressed the plain way."""
        bounds = element_bounds(element)
        device = self.screen()
        if bounds and hasattr(device, "click"):
            time.sleep(random.uniform(*LOOK_BEFORE_TAP_SECONDS))
            self.check()
            x, y = tap_point(bounds)
            device.click(x, y)
        else:
            element.click()

    def find_first(self, step, timeout=10, selectors=()):
        """The first of several shapes of one button to show within the time.
        An app update often renames or moves a button, so each known shape is
        tried, and the failure names them all."""
        self.check()
        self.current = step
        device = self.screen()
        deadline = time.time() + timeout
        while True:
            for selector in selectors:
                element = device(**selector)
                if element.exists:
                    return element
            if time.time() >= deadline:
                break
            time.sleep(0.5)
            self.check()
        self.shot(step)
        raise StepFailed(step, "Could not find %s on the screen." % " or ".join(selector_words(one) for one in selectors))

    def tap_first(self, step, timeout=10, selectors=()):
        if self.rehearse and any(could_be_last_button(one) for one in selectors):
            raise RuntimeError("A rehearsal tried to tap %s; the last button is only ever found, with final()." % selector_words(selectors[0]))
        element = self.find_first(step, timeout, selectors)
        self.check()
        self.press(element)
        time.sleep(1)
        self.shot(step)

    def final_first(self, step, timeout=10, selectors=()):
        """final() for a button with several known shapes. Only one press ever
        happens: a press that raised may still have sent it."""
        element = self.find_first(step, timeout, selectors)
        if self.rehearse:
            self.shot("%s (found, not pressed)" % step)
            return False
        self.check()
        self.press(element)
        time.sleep(1)
        self.shot(step)
        return True

    def final(self, step, timeout=10, **selector):
        """The last button, such as Post. Pressed once in a real run; in the
        self-test it is only found, and this returns False without a press."""
        element = self.find(step, timeout, **selector)
        if self.rehearse:
            self.shot("%s (found, not pressed)" % step)
            return False
        self.check()
        self.press(element)
        time.sleep(1)
        self.shot(step)
        return True


def go_home(serial):
    try:
        if is_iphone(serial):
            iphone_screen(serial).press("home")
        else:
            shell(serial, "input keyevent KEYCODE_HOME", timeout=10)
    except Exception:  # A phone pulled out; the next step will say so.
        pass


def go_back(serial):
    """Back: Android's key, or the iPhone's swipe in from the left edge, which the driver makes."""
    try:
        if is_iphone(serial):
            iphone_screen(serial).press("back")
        else:
            shell(serial, "input keyevent KEYCODE_BACK", timeout=10)
    except Exception:
        pass


# ---------------------------------------------------------------------------
# Hands. A thumb never lands on the exact middle of a button twice, a swipe
# bends and changes speed on the way, and typing has an uneven rhythm with a
# stop at the end of each sentence. The numbers are the browser's own, from
# docker/browser/human.py, so an account behaves the same on a phone as in a
# browser. Every timing is drawn from a range, never picked from a list.

# Between two keys; after the end of a sentence; now and then, mid-sentence.
KEY_GAP_SECONDS = (0.06, 0.17)
SENTENCE_PAUSE_SECONDS = (0.35, 1.1)
THINKING_CHANCE = 0.02
THINKING_PAUSE_SECONDS = (0.5, 1.8)

# Reading the post before replying, longer for a longer post, within a floor and a ceiling.
READ_SECONDS_PER_CHARACTER = 0.012
READ_SECONDS = (4.0, 25.0)

# Between the last key and pressing Post, and a look at a button before tapping it.
BEFORE_SUBMIT_SECONDS = (0.8, 2.6)
LOOK_BEFORE_TAP_SECONDS = (0.3, 1.2)

# Where a tap lands, as a share of the button's width and height away from
# its middle: mostly near the middle, never in the outer fifth on either side.
TAP_SPREAD = 0.15
TAP_INNER = 0.3

# A swipe: a few points on a line that bows sideways, sent over a time drawn
# from a range, with the points bunched at the start and end so the thumb
# speeds up and slows down.
SWIPE_POINTS = (4, 7)
SWIPE_BEND = 0.12
SWIPE_MIN_BEND = 0.03
SWIPE_SECONDS = (0.25, 0.7)

# One scroll moves a share of the screen's height; uneven gaps between
# scrolls, now and then a stop to read, now and then a little way back up.
SCROLL_SHARE = (0.2, 0.5)
SCROLL_GAP_SECONDS = (0.4, 2.4)
READING_CHANCE = 0.15
READING_SECONDS = (2.5, 8.0)
SCROLL_BACK_CHANCE = 0.12


def tap_point(bounds, rng=random):
    """Where on a button with these bounds a tap lands: a little off its middle,
    different every time, always inside the button's inner part."""
    left, top, right, bottom = bounds

    def axis(low, high):
        size = high - low
        offset = rng.gauss(0, TAP_SPREAD) * size
        limit = TAP_INNER * size
        point = int(round(low + size / 2 + max(-limit, min(limit, offset))))
        return max(low, min(high - 1, point)) if size >= 2 else low

    return axis(left, right), axis(top, bottom)


def swipe_path(x1, y1, x2, y2, rng=random):
    """The points of one swipe from (x1, y1) to (x2, y2): a line bowed to one
    side, never straight, its points closer together at both ends so the
    thumb speeds up and slows down."""
    count = rng.randint(*SWIPE_POINTS)
    length = ((x2 - x1) ** 2 + (y2 - y1) ** 2) ** 0.5 or 1.0
    bend = rng.gauss(0, SWIPE_BEND)
    if abs(bend) < SWIPE_MIN_BEND:
        bend = SWIPE_MIN_BEND if bend >= 0 else -SWIPE_MIN_BEND
    bend *= length
    # The unit step at right angles to the swipe.
    across_x, across_y = -(y2 - y1) / length, (x2 - x1) / length
    points = []
    for index in range(count):
        share = index / (count - 1)
        along = 0.5 - 0.5 * math.cos(math.pi * share)
        bow = bend * math.sin(math.pi * along)
        points.append((
            int(round(x1 + (x2 - x1) * along + across_x * bow)),
            int(round(y1 + (y2 - y1) * along + across_y * bow)),
        ))
    return points


def typing_plan(text, rng=random):
    """Each character to type and the wait after it. A sentence's end waits
    longer, and now and then a space is a stop to think. The last key has
    no wait."""
    plan = []
    for index, character in enumerate(text):
        if index == len(text) - 1:
            plan.append((character, 0.0))
            break
        gap = rng.uniform(*KEY_GAP_SECONDS)
        if character in ".!?" and text[index + 1:index + 2] in (" ", "\n"):
            gap += rng.uniform(*SENTENCE_PAUSE_SECONDS)
        elif character == " " and rng.random() < THINKING_CHANCE:
            gap += rng.uniform(*THINKING_PAUSE_SECONDS)
        plan.append((character, gap))
    return plan


def type_key(serial, device, character):
    """One character into the box in focus: a plain one as a key press, a
    new line as Enter, anything else (an accent, an emoji) through
    uiautomator2, which Android's own `input text` cannot type. An iPhone
    types every character through WebDriverAgent, one at a time, so the
    rhythm between keys is the same on both kinds."""
    if is_iphone(serial):
        if character == "\n":
            device.press("enter")
        else:
            device.send_keys(character)
    elif character == "\n":
        shell(serial, "input keyevent KEYCODE_ENTER", timeout=10)
    elif 32 <= ord(character) < 127:
        shell(serial, "input text %s" % typed_text(character), timeout=10)
    else:
        device.send_keys(character, clear=False)


def type_like_a_person(serial, device, text, check=lambda: None):
    """Types `text` one key at a time with a person's rhythm. Returns the gaps."""
    gaps = []
    for character, gap in typing_plan(text):
        check()
        type_key(serial, device, character)
        if gap:
            gaps.append(gap)
            time.sleep(gap)
    return gaps


def screen_size(device):
    try:
        width, height = device.window_size()
        return int(width), int(height)
    except Exception:  # A fake screen; a common phone's size.
        return 1080, 2400


def tap_at(serial, device, x, y):
    if hasattr(device, "click"):
        device.click(x, y)
    else:
        shell(serial, "input tap %d %d" % (x, y), timeout=10)


def swipe_like_a_person(serial, device, x1, y1, x2, y2):
    points = swipe_path(x1, y1, x2, y2)
    seconds = random.uniform(*SWIPE_SECONDS)
    if is_iphone(serial):
        # WebDriverAgent draws a straight swipe; its speed still varies.
        device.swipe(x1, y1, x2, y2, duration=seconds)
    elif hasattr(device, "swipe_points"):
        device.swipe_points(points, seconds)
    else:
        shell(serial, "input swipe %d %d %d %d %d" % (x1, y1, x2, y2, int(seconds * 1000)), timeout=10)


def scroll_once(serial, device, direction=1):
    """One scroll as a thumb makes it: a bent swipe of uneven length, up the
    screen to go down the page. Returns how far it moved, in pixels."""
    width, height = screen_size(device)
    distance = int(height * random.uniform(*SCROLL_SHARE))
    x = int(width * random.uniform(0.35, 0.65))
    start = int(height * random.uniform(0.62, 0.78))
    end = start - distance
    if direction > 0:
        swipe_like_a_person(serial, device, x, start, x + random.randint(-30, 30), end)
    else:
        swipe_like_a_person(serial, device, x, end, x + random.randint(-30, 30), start)
    return distance


def scroll_pause(until=None):
    pause = random.uniform(*SCROLL_GAP_SECONDS)
    if random.random() < READING_CHANCE:
        pause += random.uniform(*READING_SECONDS)
    if until is not None:
        pause = max(0.0, min(pause, until - time.monotonic()))
    time.sleep(pause)


# ---------------------------------------------------------------------------
# The named actions. Each takes the phone's serial, its arguments and its
# Walk, and returns its answer; its pictures are the Walk's steps.

def action_list(serial, args, walk):
    return {"phones": list_phones()}


def action_health(serial, args, walk):
    if is_iphone(serial):
        # The same figures the minute's reading takes, from the same channel.
        reading = iphone_vitals(serial)
        return dict(
            reading,
            kind="iphone",
            upHours=round(reading["upSeconds"] / 3600, 1) if reading["upSeconds"] is not None else None,
            android=iphone_system_version(serial),
            model=_PROPS.get(serial, {}).get("model", ""),
        )
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


def node_words(node):
    """A node's own words: its text, or its description when it has no text.
    An iPhone's tree carries them as label or value instead."""
    return " ".join((node.get("text") or node.get("content-desc") or node.get("label") or node.get("value") or "").split())


def value_beside_label(hierarchy_xml, label, pattern):
    """The text matching `pattern` printed beside `label` in a screen dump.

    A label and its value are two text views under one row or one column, so
    the value is looked for inside the label's parent first, then the
    parent's parent on screens that nest deeper. Within one holder the match
    nearest the label wins, so a row of two figures (karma, then the
    account's age) gives each label its own.
    """
    root = ElementTree.fromstring(hierarchy_xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    wanted = plain(label)
    for node in root.iter("node"):
        if plain(node_words(node)) != wanted:
            continue
        holder = parents.get(node)
        for _ in range(3):
            if holder is None:
                break
            nodes = list(holder.iter("node"))
            here = nodes.index(node) if node in nodes else 0
            matches = [
                (abs(index - here), node_words(other))
                for index, other in enumerate(nodes)
                if other is not node and pattern.match(node_words(other))
            ]
            if matches:
                return min(matches, key=lambda match: match[0])[1]
            holder = parents.get(holder)
    return None


def version_beside_label(hierarchy_xml):
    """The version printed beside "Android version" in a Settings screen dump."""
    return value_beside_label(hierarchy_xml, "Android version", VERSION_TEXT)


# iOS's Settings, General, About. The row reads "iOS Version" with the number
# beside it; older builds said "Software Version". A tree may also give the
# whole row as one label, "iOS Version, 17.6.1".
IOS_VERSION_LABELS = ("iOS Version", "Software Version")
IOS_VERSION_INLINE = re.compile(r"(?i)\b(?:ios|software) version\b[,:]?\s*(\d+(?:\.\d+)*)")


def ios_version_beside_label(hierarchy_xml):
    """The version printed beside "iOS Version" on the About screen. The label
    and the value are two sibling elements of one cell, so the same reader
    as Android's finds it; a row given as one label is read whole."""
    for label in IOS_VERSION_LABELS:
        found = value_beside_label(hierarchy_xml, label, VERSION_TEXT)
        if found:
            return found
    for node in ElementTree.fromstring(hierarchy_xml).iter():
        match = IOS_VERSION_INLINE.search(node_words(node))
        if match:
            return match.group(1)
    return None


def read_ios_version(serial, walk):
    """phone/android-version on an iPhone: Settings, General, About, and the
    iOS Version row read off the screen, checked against what the phone
    reports over USB."""
    from_system = iphone_system_version(serial)
    device = walk.screen()
    wake_screen(device)
    walk.check()
    device.app_start(IOS_SETTINGS)
    time.sleep(2)
    walk.shot("Opened Settings")
    walk.tap("Open General", text="General")
    walk.tap("Open About", text="About")
    found = None
    width, height = screen_size(device)
    for attempt in range(3):
        walk.check()
        found = ios_version_beside_label(device.dump_hierarchy())
        if found:
            break
        swipe_like_a_person(serial, device, width // 2, int(height * 0.7), width // 2, int(height * 0.3))
        time.sleep(1)
    if not found:
        walk.shot("Looked for the iOS version")
        walk.home()
        raise StepFailed(
            "Find the iOS version",
            "Settings opened, but no iOS version was found on its screen. The phone itself says %s." % (from_system or "nothing"),
        )
    walk.shot("Read iOS %s" % found)
    walk.home()
    return {"fromScreen": found, "fromSystem": from_system, "match": found == from_system, "kind": "iphone"}


def action_android_version(serial, args, walk):
    """Opens Settings at About phone and reads the Android version off the screen.

    A test of the whole path: the rack reaching the phone, the phone opening an
    app, and the screen being read. The version Android itself reports is read
    too, so the answer can be checked against it.
    """
    if is_iphone(serial):
        return read_ios_version(serial, walk)
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
    "medium": "com.medium.reader",
}
APP_NAMES = {"reddit": "Reddit", "instagram": "Instagram", "tiktok": "TikTok", "medium": "Medium"}
PLAY_STORE = "com.android.vending"

# The same apps on an iPhone, by App Store bundle id, and Apple's own apps
# the rack opens: Settings for the version read and Messages for a texted code.
APP_BUNDLES = {
    "reddit": "com.reddit.Reddit",
    "instagram": "com.burbn.instagram",
    "tiktok": "com.zhiliaoapp.musically",
    # Not yet read off a real iPhone. The Android package is Medium's own
    # Play Store name; this one is the same until a phone says otherwise.
    "medium": "com.medium.reader",
}
IOS_SETTINGS = "com.apple.Preferences"
IOS_MESSAGES = "com.apple.MobileSMS"


def package_for(serial, app):
    """The app's name to the phone it is on: a bundle id on an iPhone, a package on Android."""
    return APP_BUNDLES[app] if is_iphone(serial) else APP_PACKAGES[app]


def app_packages(app):
    """Both names of one app: its Android package and its iPhone bundle id. A
    reader handed a screen and no serial filters by both, since every node
    is stamped with one or the other."""
    return (APP_PACKAGES[app], APP_BUNDLES[app])


def own_node(node, package):
    """True when a node is the app's own: nothing stamped on it, the package
    given, or either name of the app when `package` is app_packages' pair."""
    stamped = node.get("package")
    if not stamped or not package:
        return True
    if isinstance(package, tuple):
        return stamped in package
    return stamped == package


def ios_kind(node):
    """An iPhone node's element type, XCUIElementTypeCell and the like; an Android node's class."""
    return node.get("type") or node.get("class") or ""


IOS_TEXT_BOX = re.compile(r"^XCUIElementType(TextField|TextView|SecureTextField|SearchField)$")


def is_text_box(node):
    """True for a box someone types into: Android's EditText or an iPhone's text field."""
    kind = node.get("class") or node.get("type") or ""
    return kind == "android.widget.EditText" or bool(IOS_TEXT_BOX.match(kind))


def is_row(node):
    """True for something a thumb can open: a clickable Android view, or an iPhone list cell."""
    return node.get("clickable") == "true" or ios_kind(node).endswith("Cell")


def not_a_line(node, height):
    """True for an iPhone node that is no line anyone wrote: a button, or the
    app's own root, whose label is the app's name and whose bounds are the
    whole screen. Android's buttons carry a description, not text, and a
    long Android message can be taller than half the screen, so the height
    rule is only for iPhone nodes."""
    kind = ios_kind(node)
    if not kind.startswith("XCUIElementType"):
        return False
    if kind == "XCUIElementTypeButton":
        return True
    bounds = parse_bounds(node.get("bounds"))
    return bool(bounds) and bounds[3] - bounds[1] > height * 0.5

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

# The same apps in the App Store (phone farm part 53): each app's page by
# Apple's own number, opened through the itms-apps address the store owns.
APP_STORE = "com.apple.AppStore"
APP_STORE_IDS = {"reddit": "1064216828", "instagram": "389801252", "tiktok": "835599320", "medium": "828256236"}
IOS_UPDATE_BUTTON = {"textMatches": "(?i)^update$", "packageName": APP_STORE}
IOS_OPEN_BUTTON = {"textMatches": "(?i)^open$", "packageName": APP_STORE}
# The page's What's New says "Version 2025.40.0" under the newest notes.
STORE_VERSION_LINE = re.compile(r"(?i)^version\s+(\d+(?:\.\d+)*)$")


def open_ios_store_page(device, app):
    device.open_url("itms-apps://apps.apple.com/app/id%s" % APP_STORE_IDS[app])
    time.sleep(4)


def store_version_from_screen(hierarchy_xml):
    """The version the App Store page shows, "Version 2025.40.0", or empty."""
    for line in screen_lines(hierarchy_xml):
        found = STORE_VERSION_LINE.match(line)
        if found:
            return found.group(1)
    for words in ios_cells(hierarchy_xml):
        if len(words) > 1 and plain(words[0]) == "version" and VERSION_TEXT.match(words[1]):
            return words[1]
    return ""


def ios_check_updates(serial, walk):
    """Each tracked app's App Store page on an iPhone: is Update showing?
    Nothing is pressed. The versions come from the driver when it offers
    them, else off each page; a page offering Get is an app not on the phone."""
    device = walk.screen()
    versions = iphone_app_versions(serial)
    apps = {}
    for app in sorted(APP_BUNDLES):
        if versions is not None and app not in versions:
            continue
        walk.check()
        open_ios_store_page(device, app)
        walk.shot("%s in the App Store" % APP_NAMES[app])
        hierarchy = device.dump_hierarchy()
        update = bool(device(**IOS_UPDATE_BUTTON).exists)
        if versions is None and not update and not device(**IOS_OPEN_BUTTON).exists:
            continue
        version = versions.get(app, "") if versions is not None else store_version_from_screen(hierarchy)
        apps[app] = {"version": version, "update": update}
    walk.home()
    return {"apps": apps}


def ios_update_app(serial, walk, app):
    """Presses Update on one app's App Store page and waits for the new
    version. With the driver's app_versions the version itself is watched;
    without it the page is the only word, and the update is done when Update
    has gone and Open is back, the version being the page's own line."""
    device = walk.screen()
    name = APP_NAMES[app]
    walk.check()
    open_ios_store_page(device, app)
    walk.shot("Opened %s in the App Store" % name)
    versions = iphone_app_versions(serial)
    before = versions.get(app, "") if versions is not None else ""
    if versions is not None and not before:
        raise StepFailed("Find %s on the phone" % name, "%s is not on this phone." % name)
    target = store_version_from_screen(device.dump_hierarchy())
    walk.tap("Press Update", **IOS_UPDATE_BUTTON)
    deadline = time.time() + UPDATE_WAIT_SECONDS
    while time.time() < deadline:
        time.sleep(10)
        walk.check()
        if versions is not None:
            after = (iphone_app_versions(serial) or {}).get(app, "")
            done = bool(after) and after != before
        else:
            after = target
            done = not device(**IOS_UPDATE_BUTTON).exists and bool(device(**IOS_OPEN_BUTTON).exists)
        if done:
            walk.shot("Updated to %s" % (after or "the new version"))
            walk.home()
            return {"app": app, "from": before, "to": after}
    walk.shot("Still updating")
    raise RuntimeError("%s did not finish updating within eight minutes. It may still finish by itself." % name)


def action_check_updates(serial, args, walk):
    """The Play Store page of each tracked app on the phone: is Update showing?
    Nothing is pressed. On an iPhone it is each app's App Store page."""
    if is_iphone(serial):
        return ios_check_updates(serial, walk)
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
    if is_iphone(serial):
        return ios_update_app(serial, walk, app)
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


# ---------------------------------------------------------------------------
# The setup check (phone farm part 23). What a platform could notice about a
# phone before any account is used on it: Wi-Fi left on beside a SIM, apps
# allowed the phone's location, a clock or language from another country,
# apps that update themselves, and the address the internet sees. Each part
# is read on its own, so one that cannot be read leaves a blank and a reason
# rather than failing the rest. Promo judges each line; the rack only reads.

# The rack computer's own table of which country each time zone is in.
ZONE_TABLES = ("/usr/share/zoneinfo/zone.tab", "/usr/share/zoneinfo/zone1970.tab")

# What the internet sees, asked over plain http so a phone with no
# certificate quirks still loads it. The same service Promo's own proxy test uses.
IPINFO_URL = "http://ipinfo.io/json"
HOME_IPINFO_URL = "https://ipinfo.io/json"

# A freshly wiped phone's browser asks these first. Pressing them only gets
# past the browser's welcome screen.
BROWSER_FIRST_RUN = ("Accept & continue", "Use without an account", "No thanks", "No, thanks", "Got it")

PLAY_ACCOUNT_BUTTON = [
    {"descriptionMatches": "(?is)^(signed in as|account and settings|google account).*", "packageName": PLAY_STORE},
    {"descriptionMatches": "(?is).*account.*", "packageName": PLAY_STORE},
]
PLAY_SETTINGS = [{"textMatches": "(?i)^settings$", "packageName": PLAY_STORE}]
PLAY_NETWORK = [{"textMatches": "(?i)^network preferences$", "packageName": PLAY_STORE}]
PLAY_AUTO_UPDATE = [{"textMatches": "(?i)^auto-update apps$", "packageName": PLAY_STORE}]

LOCATION_GRANTED = re.compile(r"android\.permission\.ACCESS_(?:FINE|COARSE)_LOCATION: granted=true")


def location_granted(dumpsys_package):
    """True when `dumpsys package` shows the app allowed the phone's location, fine or rough."""
    return bool(LOCATION_GRANTED.search(dumpsys_package or ""))


def zone_country(timezone, tables=ZONE_TABLES):
    """The two-letter country a time zone is in, from the computer's zone
    table, or empty for a zone in no country (UTC) or no table."""
    zone = (timezone or "").strip()
    if not zone:
        return ""
    for path in tables:
        try:
            with open(path, "r", encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith("#"):
                        continue
                    parts = line.rstrip("\n").split("\t")
                    if len(parts) >= 3 and parts[2].strip() == zone:
                        return parts[0].split(",")[0].strip().upper()
        except OSError:
            continue
    return ""


def first_listed(value):
    """The first non-empty item of Android's comma lists, such as one per SIM slot."""
    for part in (value or "").split(","):
        if part.strip() and part.strip() != "null":
            return part.strip()
    return ""


def pick_locale(persisted, system_locales, product):
    """The phone's language as en-CA: the one chosen, else the first of the
    list, else the one it was sold with."""
    for value in (persisted, first_listed(system_locales), product):
        value = (value or "").strip().replace("_", "-")
        if value and value != "null":
            return value
    return ""


def wifi_on(value):
    """`settings get global wifi_on`: 0 off, 1 on, 2 on in airplane mode, 3 off in airplane mode."""
    return {"0": False, "1": True, "2": True, "3": False}.get((value or "").strip())


def ipinfo_from_text(text):
    """ipinfo.io's answer read out of whatever text holds it: a JSON page as
    a browser shows it, split over any number of lines."""
    found = {}
    for key in ("ip", "country", "timezone", "org"):
        match = re.search(r'"%s"\s*:\s*"([^"]*)"' % key, text or "")
        found[key] = match.group(1).strip() if match else ""
    return found


def outside_from_screen(hierarchy_xml):
    return ipinfo_from_text(" ".join(screen_lines(hierarchy_xml)))


def checked_radio(hierarchy_xml):
    """The words of the ticked choice in a dialog of choices, or empty.
    A radio button often has no words of its own; its row's do."""
    root = ElementTree.fromstring(hierarchy_xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    for node in root.iter("node"):
        if node.get("checked") != "true":
            continue
        if node.get("checkable") != "true" and "Radio" not in (node.get("class") or ""):
            continue
        words = node_words(node)
        holder = parents.get(node)
        while not words and holder is not None:
            words = next((node_words(other) for other in holder.iter("node") if other is not node and node_words(other)), "")
            holder = parents.get(holder)
        if words:
            return words
    return ""


def auto_update_word(label):
    """The Play Store's auto-update choice as off, wifi or any."""
    words = plain(label)
    if "don't" in words or "do not" in words or "never" in words:
        return "off"
    if "wi-fi" in words or "wifi" in words:
        return "wifi"
    if "any network" in words:
        return "any"
    return ""


def battery_now(dumpsys_battery):
    level = re.search(r"^\s*level:\s*(\d+)", dumpsys_battery or "", re.M)
    status = re.search(r"^\s*status:\s*(\d+)", dumpsys_battery or "", re.M)
    # 2 is charging and 5 is full, in Android's BatteryManager.
    return {"percent": int(level.group(1)) if level else None, "charging": bool(status and status.group(1) in ("2", "5"))}


def blank_address():
    return {"ip": "", "country": "", "timezone": "", "org": "", "error": ""}


def quietly(serial, command, timeout=15):
    """A shell command whose failure is an empty answer, for readings that may each fail alone."""
    try:
        return shell(serial, command, timeout=timeout)
    except (RuntimeError, subprocess.TimeoutExpired):
        return ""


def read_home_address(fetch=None):
    """This computer's own outside address, which is the house's: the one a
    phone on Wi-Fi must never show."""
    found = blank_address()
    try:
        if fetch is None:
            request = urllib.request.Request(HOME_IPINFO_URL, headers={"accept": "application/json"})
            with urllib.request.urlopen(request, timeout=15) as response:
                text = response.read().decode("utf-8")
        else:
            text = fetch(HOME_IPINFO_URL)
        data = json.loads(text)
        for key in ("ip", "country", "timezone", "org"):
            found[key] = str(data.get(key) or "")
    except (urllib.error.URLError, OSError, ValueError, AttributeError) as failure:
        found["error"] = "This computer's own address could not be read: %s" % failure
    return found


def read_outside_on_phone(serial, walk):
    """The address, country and clock the internet sees from the phone, read
    in the phone's own browser, the way any app's traffic leaves it."""
    found = blank_address()
    try:
        device = walk.screen()
        walk.check()
        if is_iphone(serial):
            device.open_url(IPINFO_URL)
        else:
            shell(serial, "am start -a android.intent.action.VIEW -d '%s'" % IPINFO_URL)
        for _ in range(6):
            time.sleep(2.5)
            walk.check()
            seen = outside_from_screen(device.dump_hierarchy())
            if seen["ip"]:
                found.update(seen)
                break
            for label in BROWSER_FIRST_RUN:
                button = device(text=label)
                if button.exists:
                    walk.press(button)
                    walk.shot("Pressed %s in the browser" % label)
                    break
        walk.shot("Read the outside address in the browser")
        if not found["ip"]:
            found["error"] = "The phone's browser did not show ipinfo.io's answer within 15 seconds."
    except Cancelled:
        raise
    except Exception as failure:  # One reading failing leaves the rest of the check.
        found["error"] = "The phone's outside address could not be read: %s" % (str(failure) or failure.__class__.__name__)
    finally:
        walk.home()
    return found


def read_auto_update(serial, walk):
    """The Play Store's auto-update choice, read off its own settings: (off,
    wifi, any or empty; why when empty). Nothing is changed: the choices
    are only looked at, and the box is closed with Back."""
    try:
        walk.check()
        shell(serial, "monkey -p %s -c android.intent.category.LAUNCHER 1" % PLAY_STORE)
        time.sleep(4)
        walk.shot("Opened the Play Store")
        walk.tap_first("Open the account menu", selectors=PLAY_ACCOUNT_BUTTON)
        walk.tap_first("Open Settings", selectors=PLAY_SETTINGS)
        walk.tap_first("Open Network preferences", selectors=PLAY_NETWORK)
        walk.tap_first("Open Auto-update apps", selectors=PLAY_AUTO_UPDATE)
        label = checked_radio(walk.screen().dump_hierarchy())
        walk.shot("Read auto-update: %s" % (label or "nothing ticked"))
        go_back(serial)
        word = auto_update_word(label)
        return word, "" if word else "No auto-update choice was ticked on the Play Store's screen."
    except Cancelled:
        raise
    except Exception as failure:  # One reading failing leaves the rest of the check.
        return "", "The Play Store's auto-update choice could not be read: %s" % (str(failure) or failure.__class__.__name__)
    finally:
        walk.home()


# The same check on an iPhone (phone farm part 53), read off iOS's own
# Settings, each row by its label. iOS writes "Wi-Fi" with a non-breaking
# hyphen, so the row is matched with any one character there.
IOS_WIFI_ROW = [{"textMatches": "(?i)^wi.fi$", "packageName": IOS_SETTINGS}]
IOS_PRIVACY_ROW = [{"textMatches": "(?i)^privacy( & security)?$", "packageName": IOS_SETTINGS}]
IOS_LOCATION_ROW = [{"textMatches": "(?i)^location services$", "packageName": IOS_SETTINGS}]
IOS_GENERAL_ROW = [{"textMatches": "(?i)^general$", "packageName": IOS_SETTINGS}]
IOS_LANGUAGE_ROW = [{"textMatches": "(?i)^language & region$", "packageName": IOS_SETTINGS}]
IOS_ABOUT_ROW = [{"textMatches": "(?i)^about$", "packageName": IOS_SETTINGS}]
IOS_APP_STORE_ROW = [{"textMatches": "(?i)^app store$", "packageName": IOS_SETTINGS}]
IOS_WIFI_SWITCH = "wi-fi"
IOS_LOCATION_SWITCH = "location services"
IOS_APP_UPDATES_SWITCH = "app updates"

# Language & Region names the language and the region in words. The locale
# fact is en-CA, as Android gives it, so the words are turned into codes
# through these two tables; a word in neither leaves the locale blank
# rather than guessed.
IOS_LANGUAGE_CODES = {
    "english": "en", "french": "fr", "spanish": "es", "german": "de", "portuguese": "pt",
    "italian": "it", "dutch": "nl", "chinese": "zh", "japanese": "ja", "korean": "ko",
    "arabic": "ar", "hindi": "hi", "russian": "ru", "swedish": "sv", "polish": "pl",
    "turkish": "tr", "vietnamese": "vi", "thai": "th", "indonesian": "id", "tagalog": "tl",
}
IOS_REGION_CODES = {
    "united states": "US", "us": "US", "u.s.": "US", "canada": "CA", "united kingdom": "GB", "uk": "GB",
    "u.k.": "GB", "australia": "AU", "new zealand": "NZ", "ireland": "IE", "germany": "DE", "france": "FR",
    "spain": "ES", "mexico": "MX", "brazil": "BR", "portugal": "PT", "italy": "IT", "netherlands": "NL",
    "india": "IN", "japan": "JP", "south korea": "KR", "philippines": "PH", "singapore": "SG",
    "south africa": "ZA", "sweden": "SE", "poland": "PL", "turkey": "TR", "vietnam": "VN", "thailand": "TH",
    "indonesia": "ID", "argentina": "AR", "colombia": "CO", "chile": "CL", "belgium": "BE", "switzerland": "CH",
    "austria": "AT", "norway": "NO", "denmark": "DK", "finland": "FI",
}


def open_ios_settings(serial):
    """Settings on its first screen. iOS reopens an app where it was left, so
    Settings is closed first."""
    reopen_app(serial, IOS_SETTINGS)
    time.sleep(2)


def ios_switch_on(hierarchy_xml, label):
    """Whether the switch labelled `label` is on: True, False, or None when no
    such switch is on screen. The switch carries the label itself, or sits in
    a cell with a line that does."""
    wanted = plain(label)
    root = ElementTree.fromstring(hierarchy_xml)
    for node in root.iter("node"):
        if ios_kind(node).endswith("Switch") and plain(node.get("label") or node.get("name") or "") == wanted:
            return node.get("checked") == "true"
    for cell in root.iter("node"):
        if not ios_kind(cell).endswith("Cell"):
            continue
        children = [child for child in cell.iter("node") if child is not cell]
        if not any(plain(node_words(child)) == wanted for child in children):
            continue
        switch = next((child for child in children if ios_kind(child).endswith("Switch")), None)
        if switch is not None:
            return switch.get("checked") == "true"
    return None


def ios_cell_value(hierarchy_xml, label):
    """The value beside `label` in an iPhone list, "Canada" beside "Region",
    or None when no row on screen starts with the label."""
    wanted = plain(label)
    for words in ios_cells(hierarchy_xml):
        if plain(words[0]) == wanted:
            return " ".join(words[1:])
    return None


def ios_location_allowed(hierarchy_xml, app_name):
    """Whether Location Services lists the app as allowed: Never and Ask Next
    Time are not; While Using and Always are; a row not on screen is None."""
    value = ios_cell_value(hierarchy_xml, app_name)
    if value is None:
        return None
    words = plain(value)
    return not (words.startswith("never") or words.startswith("ask"))


def ios_locale(language, region):
    """en-CA from "English" and "Canada", or from "English (Canada)" alone,
    through the two tables. Empty when either word is in neither table."""
    language = language or ""
    code = IOS_LANGUAGE_CODES.get(plain(language.split("(")[0]).strip(), "")
    region_code = IOS_REGION_CODES.get(plain(region or "").strip(), "")
    inner = re.search(r"\(([^)]+)\)", language)
    if not region_code and inner:
        region_code = IOS_REGION_CODES.get(plain(inner.group(1)).strip(), "")
    return "%s-%s" % (code, region_code) if code and region_code else ""


def carrier_name(value):
    """"Rogers" from the About screen's "Rogers 59.0.1", which adds the carrier settings' version."""
    return re.sub(r"\s+\d+(?:\.\d+)*$", "", (value or "").strip())


def ios_setup_check(serial, args, walk):
    """The setup check on an iPhone, the same facts as Android's, read off
    Settings, the driver and Safari. Each part runs in its own try: one that
    cannot be read leaves its fact blank, never guessed, and the rest go on."""
    device = walk.screen()
    wake_screen(device)
    timezone = _PROPS.get(serial, {}).get("timezone", "")  # Lockdown's TimeZone, cached by the list.
    facts = {
        "wifiOn": None,
        "locationApps": {},
        "timezone": timezone,
        "timezoneCountry": zone_country(timezone),
        "locale": "",
        "sim": {"country": "", "carrier": ""},
        "network": {"carrier": ""},
        "autoUpdate": "",
        "autoUpdateError": "",
        "battery": {"percent": None, "charging": None},
        "outside": blank_address(),
        "home": blank_address(),
    }

    def part(name, read):
        try:
            walk.check()
            read()
        except Cancelled:
            raise
        except Exception as failure:  # This part stays blank; the next is still read.
            log("Could not read %s on %s: %s" % (name, serial, short_words(failure)))
            walk.shot("Could not read %s" % name)
        finally:
            walk.home()

    def wifi():
        open_ios_settings(serial)
        walk.tap_first("Open Wi-Fi", selectors=IOS_WIFI_ROW)
        time.sleep(1.5)
        facts["wifiOn"] = ios_switch_on(device.dump_hierarchy(), IOS_WIFI_SWITCH)
        walk.shot("Read Wi-Fi: %s" % {True: "on", False: "off"}.get(facts["wifiOn"], "no switch found"))

    def location():
        open_ios_settings(serial)
        scroll_to_first(walk, "Find Privacy & Security", IOS_PRIVACY_ROW)
        walk.tap_first("Open Privacy & Security", selectors=IOS_PRIVACY_ROW)
        walk.tap_first("Open Location Services", selectors=IOS_LOCATION_ROW)
        time.sleep(1.5)
        hierarchy = device.dump_hierarchy()
        if ios_switch_on(hierarchy, IOS_LOCATION_SWITCH) is False:
            # Off for every app at once; the list below it is empty then.
            versions = iphone_app_versions(serial)
            for app in (sorted(versions) if versions else sorted(APP_NAMES)):
                facts["locationApps"][app] = False
            walk.shot("Read Location Services: off")
            return
        for app in sorted(APP_NAMES):
            scroll_to_first(walk, "Find %s" % APP_NAMES[app], [{"text": APP_NAMES[app], "packageName": IOS_SETTINGS}], scrolls=3)
            allowed = ios_location_allowed(device.dump_hierarchy(), APP_NAMES[app])
            if allowed is not None:
                facts["locationApps"][app] = allowed
        walk.shot("Read Location Services")

    def language():
        open_ios_settings(serial)
        walk.tap_first("Open General", selectors=IOS_GENERAL_ROW)
        scroll_to_first(walk, "Find Language & Region", IOS_LANGUAGE_ROW)
        walk.tap_first("Open Language & Region", selectors=IOS_LANGUAGE_ROW)
        time.sleep(1.5)
        hierarchy = device.dump_hierarchy()
        spoken = ios_cell_value(hierarchy, "iPhone Language")
        region = ios_cell_value(hierarchy, "Region")
        facts["locale"] = ios_locale(spoken, region)
        walk.shot("Read the language: %s, %s" % (spoken or "not shown", region or "no region"))

    def carrier():
        open_ios_settings(serial)
        walk.tap_first("Open General", selectors=IOS_GENERAL_ROW)
        walk.tap_first("Open About", selectors=IOS_ABOUT_ROW)
        scroll_to_first(walk, "Find the carrier", [{"textMatches": "(?i)^carrier$", "packageName": IOS_SETTINGS}], scrolls=3)
        hierarchy = device.dump_hierarchy()
        facts["sim"]["carrier"] = carrier_name(ios_cell_value(hierarchy, "Carrier"))
        facts["network"]["carrier"] = carrier_name(ios_cell_value(hierarchy, "Network"))
        walk.shot("Read the carrier: %s" % (facts["sim"]["carrier"] or "not shown"))

    def updates():
        open_ios_settings(serial)
        scroll_to_first(walk, "Find App Store", IOS_APP_STORE_ROW)
        walk.tap_first("Open App Store", selectors=IOS_APP_STORE_ROW)
        time.sleep(1.5)
        state = ios_switch_on(device.dump_hierarchy(), IOS_APP_UPDATES_SWITCH)
        # On, the App Store fetches updates on Wi-Fi and on cellular alike.
        facts["autoUpdate"] = {True: "any", False: "off"}.get(state, "")
        if state is None:
            facts["autoUpdateError"] = "No App Updates switch was found on the App Store settings screen."
        walk.shot("Read App Updates: %s" % (facts["autoUpdate"] or "no switch found"))

    def battery():
        facts["battery"]["percent"] = iphone_vitals(serial)["batteryPercent"]

    part("Wi-Fi", wifi)
    part("Location Services", location)
    part("Language & Region", language)
    part("the carrier", carrier)
    part("App Updates", updates)
    part("the battery", battery)
    facts["outside"] = read_outside_on_phone(serial, walk)
    facts["home"] = read_home_address()
    return facts


def action_setup_check(serial, args, walk):
    """Everything the setup check reads off one phone (part 23)."""
    if is_iphone(serial):
        return ios_setup_check(serial, args, walk)
    versions = parse_app_versions(quietly(serial, APPS_COMMAND, timeout=30))
    location = {}
    for app in sorted(versions):
        location[app] = location_granted(quietly(serial, "dumpsys package %s" % APP_PACKAGES[app], timeout=30))
    timezone = quietly(serial, "getprop persist.sys.timezone")
    auto_update, auto_update_error = read_auto_update(serial, walk)
    return {
        "wifiOn": wifi_on(quietly(serial, "settings get global wifi_on")),
        "locationApps": location,
        "timezone": timezone,
        "timezoneCountry": zone_country(timezone),
        "locale": pick_locale(
            quietly(serial, "getprop persist.sys.locale"),
            quietly(serial, "settings get system system_locales"),
            quietly(serial, "getprop ro.product.locale"),
        ),
        "sim": {
            "country": first_listed(quietly(serial, "getprop gsm.sim.operator.iso-country")).upper(),
            "carrier": first_listed(quietly(serial, "getprop gsm.sim.operator.alpha")),
        },
        "network": {"carrier": first_listed(quietly(serial, "getprop gsm.operator.alpha"))},
        "autoUpdate": auto_update,
        "autoUpdateError": auto_update_error,
        "battery": battery_now(quietly(serial, "dumpsys battery")),
        "outside": read_outside_on_phone(serial, walk),
        "home": read_home_address(),
    }


def action_outside_address(serial, args, walk):
    """The phone's outside address beside the house's, read before a job on a
    phone that goes out through a proxy over Wi-Fi (part 28)."""
    return {"phone": read_outside_on_phone(serial, walk), "home": read_home_address()}


# ---------------------------------------------------------------------------
# The wipe (part 26). A factory reset through the phone's own Settings, so a
# new account never inherits an old one's device history. The press that
# erases goes through Walk.final, so a rehearsal can never wipe a phone, and
# the wipe is not rehearsed at all. USB debugging goes with the wipe, so the
# phone is set up again by hand afterwards.

SETTINGS = "com.android.settings"
FACTORY_RESET_ACTIVITY = "com.android.settings/.Settings$FactoryResetActivity"

WIPE_SYSTEM = [
    {"textMatches": "(?i)^system$", "packageName": SETTINGS},
    {"textMatches": "(?i)^general management$"},
]
WIPE_RESET_MENU = [
    {"textMatches": "(?i)^reset options$", "packageName": SETTINGS},
    {"textMatches": "(?i)^reset$"},
]
WIPE_ENTRY = [
    {"textMatches": "(?i)^erase all data \\(factory reset\\)$"},
    {"textMatches": "(?i)^factory data reset$"},
]
WIPE_ERASE = [{"textMatches": "(?i)^(erase all data|reset|reset device)$"}]
WIPE_CONFIRM = [{"textMatches": "(?i)^(erase all data|delete all|reset)$"}]


def scroll_to_first(walk, step, selectors, scrolls=5):
    """Finds one of the shapes, scrolling the screen down between looks."""
    device = walk.screen()
    for _ in range(scrolls):
        walk.check()
        for selector in selectors:
            if device(**selector).exists:
                return
        scroller = device(scrollable=True)
        if not scroller.exists:
            return
        scroller.scroll.forward()
        time.sleep(1)


# An iPhone's wipe (phone farm part 54). Erased while still signed in to an
# Apple ID, the phone locks to that Apple ID and is useless to the rack, so
# the wipe runs only when Promo says the sign-out is done (a person did it in
# the screen window and phone/icloud-state read the phone as signed out).
IOS_WIPE_RESET_MENU = [{"textMatches": "(?i)^(transfer or reset iphone|reset)$", "packageName": IOS_SETTINGS}]
IOS_WIPE_ENTRY = [{"textMatches": "(?i)^erase all content and settings$", "packageName": IOS_SETTINGS}]
IOS_WIPE_CONTINUE = [{"textMatches": "(?i)^continue$", "packageName": IOS_SETTINGS}]
IOS_WIPE_ERASE = [{"textMatches": "(?i)^(erase iphone|erase this iphone|erase now|erase)$", "packageName": IOS_SETTINGS}]
IOS_PASSCODE_WORDS = ("enter passcode", "enter your passcode", "enter iphone passcode")
IOS_SIGNED_OUT_WORDS = ("sign in to your iphone", "sign in to iphone")
IOS_APPLE_ID_WORDS = ("apple id", "apple account", "icloud", "media & purchases")
WIPE_NOT_SIGNED_OUT = (
    "The iPhone was not wiped: Promo did not say its Apple ID is signed out. "
    "Sign out of iCloud in the screen window, let Promo read the phone as signed out, then wipe it."
)


def ios_asks_passcode(hierarchy_xml):
    """True when iOS is asking for the phone's passcode: its words, or a secure field."""
    lines = [plain(line) for line in screen_lines(hierarchy_xml)]
    if any(any(words in line for words in IOS_PASSCODE_WORDS) for line in lines):
        return True
    return any(ios_kind(node) == "XCUIElementTypeSecureTextField" for node in ElementTree.fromstring(hierarchy_xml).iter("node"))


def icloud_from_screen(hierarchy_xml):
    """What Settings' top row says: the person's name beside Apple ID, or
    "Sign in to your iPhone". None when neither row is on screen."""
    for words in ios_cells(hierarchy_xml):
        joined = plain(" ".join(words))
        if any(phrase in joined for phrase in IOS_SIGNED_OUT_WORDS):
            return {"signedOut": True, "appleId": ""}
        if any(phrase in joined for phrase in IOS_APPLE_ID_WORDS):
            return {"signedOut": False, "appleId": words[0][:200]}
    return None


def action_icloud_state(serial, args, walk):
    """Whether an Apple ID is signed in, read off Settings' top row. Nothing is pressed."""
    if not is_iphone(serial):
        raise RuntimeError("phone/icloud-state is only for an iPhone.")
    device = walk.screen()
    wake_screen(device)
    walk.check()
    open_ios_settings(serial)
    walk.shot("Opened Settings")
    state = icloud_from_screen(device.dump_hierarchy())
    if state is None:
        walk.shot("Looked for the Apple ID row")
        walk.home()
        raise StepFailed("Find the Apple ID row", "Settings opened, but its top row named neither an Apple ID nor Sign in to your iPhone.")
    walk.shot("Read: %s" % ("signed out" if state["signedOut"] else "signed in as %s" % state["appleId"]))
    walk.home()
    return state


def ios_wipe(serial, args, walk):
    """Erase All Content and Settings through Settings, only once Promo says
    the Apple ID is signed out. The erase itself goes through final_first;
    a passcode prompt stops the walk with a picture."""
    if args.get("icloudSignedOut") is not True:
        raise RuntimeError(WIPE_NOT_SIGNED_OUT)
    device = walk.screen()
    wake_screen(device)
    walk.check()
    open_ios_settings(serial)
    walk.shot("Opened Settings")
    walk.tap_first("Open General", selectors=IOS_GENERAL_ROW)
    scroll_to_first(walk, "Find Transfer or Reset iPhone", IOS_WIPE_RESET_MENU)
    walk.tap_first("Open Transfer or Reset iPhone", selectors=IOS_WIPE_RESET_MENU)
    walk.tap_first("Open Erase All Content and Settings", selectors=IOS_WIPE_ENTRY)
    time.sleep(1.5)
    walk.tap_first("Press Continue", selectors=IOS_WIPE_CONTINUE)
    time.sleep(1.5)
    if ios_asks_passcode(device.dump_hierarchy()):
        walk.shot("The phone asks for its passcode")
        raise StepFailed("Enter the passcode", "The phone asks for its passcode; wipe it by hand.")
    pressed = walk.final_first("Press Erase iPhone", selectors=IOS_WIPE_ERASE)
    if pressed:
        # iOS asks once more on a sheet of its own.
        time.sleep(1.5)
        if any(device(**selector).exists for selector in IOS_WIPE_ERASE):
            walk.final_first("Confirm the erase", selectors=IOS_WIPE_ERASE)
    return {"wiped": bool(pressed)}


def action_wipe(serial, args, walk):
    """Erases everything on the phone. Returns as soon as the erase is pressed;
    the phone restarts into its setup screens."""
    if is_iphone(serial):
        return ios_wipe(serial, args, walk)
    device = walk.screen()
    device.screen_on()
    walk.check()
    opened = quietly(serial, "am start -n '%s'" % FACTORY_RESET_ACTIVITY)
    time.sleep(2)
    if not opened or "Error" in opened or "Exception" in opened:
        shell(serial, "am start -a android.settings.SETTINGS")
        time.sleep(2)
        walk.shot("Opened Settings")
        scroll_to_first(walk, "Find System", WIPE_SYSTEM)
        walk.tap_first("Open System", selectors=WIPE_SYSTEM)
        scroll_to_first(walk, "Find Reset options", WIPE_RESET_MENU)
        walk.tap_first("Open Reset options", selectors=WIPE_RESET_MENU)
        walk.tap_first("Open Erase all data", selectors=WIPE_ENTRY)
    else:
        walk.shot("Opened Erase all data")
    scroll_to_first(walk, "Find the erase button", WIPE_ERASE)
    walk.tap_first("Press Erase all data", selectors=WIPE_ERASE)
    time.sleep(1.5)
    pressed = walk.final_first("Confirm the erase", selectors=WIPE_CONFIRM)
    return {"wiped": bool(pressed)}


# ---------------------------------------------------------------------------
# Reddit through the Reddit app (phone farm part 29). The same names and the
# same answers as the browser's routines, so nothing above the rack knows
# whether a phone or a browser did the work. Searches and thread reads stay
# with the signed-out reader browser (Tyler, 14 Oct 2026); a phone signs in,
# reads its own account and comments.
#
# Who is signed in is read off the app's account menu: "u/name", the karma
# and the "Reddit age". The app shows the age rounded ("2y", "5d"), so the
# day the account was made is worked out counting the age down, and an
# approximate age never makes an account look older than it is.

REDDIT = APP_PACKAGES["reddit"]

REDDIT_AVATAR = [
    {
        "descriptionMatches": "(?i)^(open profile|profile|account|user account|user profile|your profile|navigate to profile|open account menu|.*avatar.*)$",
        "packageName": REDDIT,
    },
    {"resourceIdMatches": "(?i).*(avatar|user_icon|nav_icon_profile).*", "packageName": REDDIT},
]
REDDIT_PROFILE_ENTRY = [{"textMatches": "(?i)^(profile|my profile|view profile)$", "packageName": REDDIT}]
REDDIT_COMMENT_BOX = [
    {"textMatches": "(?i)^(add a comment|join the conversation|add a reply)( ?(…|\\.\\.\\.))?$", "packageName": REDDIT},
    {"descriptionMatches": "(?i)^(add a comment|join the conversation|add a reply)( ?(…|\\.\\.\\.))?$", "packageName": REDDIT},
]
REDDIT_POST_BUTTON = [
    {"textMatches": "(?i)^(post|reply|comment)$", "packageName": REDDIT},
    {"descriptionMatches": "(?i)^(post|reply|comment)$", "packageName": REDDIT},
]
REDDIT_DISCARD = [{"textMatches": "(?i)^(discard|discard comment|leave)$"}]

HANDLE_LINE = re.compile(r"^u/([A-Za-z0-9_-]{3,20})$")
KARMA_TEXT = re.compile(r"^\d[\d,]*(\.\d+)?\s*[kKmM]?$")
AGE_TEXT = re.compile(r"^(\d+\s*(y|yr|yrs|year|years|mo|mos|month|months|w|wk|wks|week|weeks|d|day|days|h|hr|hrs|m|min|mins|s)\s*)+$", re.I)
KARMA_LINE = re.compile(r"^(\d[\d,]*(?:\.\d+)?\s*[kKmM]?)\s+karma$", re.I)
AGE_LINE = re.compile(r"^(.+?)\s+reddit age$", re.I)
PROFILE_SUSPENDED = ("this account has been suspended", "account suspended", "has been suspended")
POSTED_WORDS = ("comment posted", "your comment was posted", "reply posted", "comment sent")

AGE_UNIT_DAYS = {
    "y": 365, "yr": 365, "yrs": 365, "year": 365, "years": 365,
    "mo": 30, "mos": 30, "month": 30, "months": 30,
    "w": 7, "wk": 7, "wks": 7, "week": 7, "weeks": 7,
    "d": 1, "day": 1, "days": 1,
    # Under a day, and "m" read as minutes rather than months: counted down.
    "h": 0, "hr": 0, "hrs": 0, "m": 0, "min": 0, "mins": 0, "s": 0,
}

# The comment's visit, as the browser's: feed before, the post, the comment, feed after.
FEED_BEFORE_SECONDS = (60, 150)
POSTS_BEFORE = (0, 2)
FEED_AFTER_SECONDS = (20, 60)
FEED_POST_SECONDS = (4, 12)
POST_LANDED_SECONDS = 20
# The visit plans to finish well inside Promo's 930 seconds (less the
# rack's own minute), keeping room to type the comment.
VISIT_BUDGET_SECONDS = 780
COMMENT_RESERVE_SECONDS = 120
TYPING_SECONDS_PER_CHARACTER = 0.25


def parse_karma(text):
    """1,234 or 1.2k as a number, or None."""
    found = re.match(r"^(\d+(?:\.\d+)?)\s*([km]?)$", (text or "").strip().lower().replace(",", ""))
    if not found:
        return None
    return int(round(float(found.group(1)) * {"": 1, "k": 1000, "m": 1000000}[found.group(2)]))


def parse_age_days(text):
    """"2y" as 730 days, "3mo" as 90, "1y 2mo" as 425, counted down; None when unreadable."""
    parts = re.findall(r"(\d+)\s*([a-z]+)", (text or "").strip().lower())
    if not parts or any(unit not in AGE_UNIT_DAYS for _, unit in parts):
        return None
    return sum(int(number) * AGE_UNIT_DAYS[unit] for number, unit in parts)


def account_from_screen(hierarchy_xml, now=None):
    """Who the app's account menu says is signed in: handle, karma and the
    day it was made. A menu with no u/ line is signed out."""
    now = now if now is not None else time.time()
    lines = screen_lines(hierarchy_xml, app_packages("reddit"))
    handle = next((HANDLE_LINE.match(line).group(1) for line in lines if HANDLE_LINE.match(line)), None)
    if not handle:
        return {"handle": None, "karma": None, "createdSeconds": None}
    karma_text = value_beside_label(hierarchy_xml, "Karma", KARMA_TEXT)
    age_text = value_beside_label(hierarchy_xml, "Reddit age", AGE_TEXT)
    for line in lines:
        if karma_text is None and KARMA_LINE.match(line):
            karma_text = KARMA_LINE.match(line).group(1)
        if age_text is None and AGE_LINE.match(line):
            age_text = AGE_LINE.match(line).group(1)
    days = parse_age_days(age_text) if age_text else None
    return {
        "handle": handle,
        "karma": parse_karma(karma_text) if karma_text else None,
        "createdSeconds": float(now - days * 86400) if days is not None else None,
    }


def profile_from_screen(hierarchy_xml, handle):
    """The account's own profile as the app shows it: loaded, found, suspended."""
    names = [plain(line) for line in screen_lines(hierarchy_xml, app_packages("reddit"))]
    found = ("u/%s" % handle).lower() in names or handle.lower() in names
    suspended = any(any(words in name for words in PROFILE_SUSPENDED) for name in names)
    return {"status": 200 if (found or suspended) else 0, "found": found, "suspended": suspended}


def handle_count(hierarchy_xml, handle):
    """How many lines on screen name the account: its comments in a thread."""
    if not handle:
        return 0
    wanted = (handle.lower(), "u/%s" % handle.lower())
    return sum(1 for line in screen_lines(hierarchy_xml, app_packages("reddit")) if plain(line).split(" ")[0] in wanted)


def comment_landed(hierarchy_xml, handle, before):
    names = [plain(line) for line in screen_lines(hierarchy_xml, app_packages("reddit"))]
    if any(any(words in name for words in POSTED_WORDS) for name in names):
        return True
    return handle_count(hierarchy_xml, handle) > before


def parse_bounds(text):
    found = re.match(r"^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$", text or "")
    return tuple(int(part) for part in found.groups()) if found else None


def feed_post_titles(hierarchy_xml, height):
    """Post titles a thumb could open in the feed: long lines of the app's own
    text in the middle of the screen, never a promoted post's."""
    root = ElementTree.fromstring(hierarchy_xml)
    parents = {child: parent for parent in root.iter() for child in parent}
    titles = []
    for node in root.iter("node"):
        if not own_node(node, app_packages("reddit")):
            continue
        words = (node.get("text") or "").strip()
        bounds = parse_bounds(node.get("bounds"))
        if len(words) < 25 or not bounds:
            continue
        middle = (bounds[1] + bounds[3]) / 2
        if not (height * 0.2 <= middle <= height * 0.8):
            continue
        card = parents.get(parents.get(node)) if parents.get(node) is not None else None
        nearby = [plain(node_words(other)) for other in (card.iter("node") if card is not None else [])]
        if any(word in ("promoted", "sponsored", "ad") for word in nearby):
            continue
        titles.append(bounds)
    return titles


def new_visit():
    return {"beforeSeconds": 0, "afterSeconds": 0, "postsOpened": 0, "reachedBy": "address", "scrolls": 0, "problems": []}


def short_words(failure):
    return (str(failure) or failure.__class__.__name__).splitlines()[0][:200]


def open_reddit(serial):
    open_app(serial, "reddit")


POST_LINK = re.compile(r"^/r/[A-Za-z0-9_]+/comments/[A-Za-z0-9]+(/[A-Za-z0-9_%\-]*)*/?$")


def open_post_link(serial, permalink):
    open_link(serial, "reddit", "https://www.reddit.com%s" % permalink)


def open_feed_post(serial, walk):
    """Opens one post from the feed by its title. False when none was on screen."""
    device = walk.screen()
    _, height = screen_size(device)
    titles = feed_post_titles(device.dump_hierarchy(), height)
    if not titles:
        return False
    walk.check()
    x, y = tap_point(random.choice(titles))
    tap_at(serial, device, x, y)
    time.sleep(2)
    walk.shot("Opened a post in the feed")
    return True


def browse_feed(serial, walk, seconds, posts, visit, deadline):
    """Scrolls the home feed for about `seconds`, opening up to `posts` posts on the way."""
    device = walk.screen()
    until = min(time.monotonic() + seconds, deadline)
    opened = 0
    while time.monotonic() < until:
        walk.check()
        up = visit["scrolls"] and random.random() < SCROLL_BACK_CHANCE
        scroll_once(serial, device, -1 if up else 1)
        visit["scrolls"] += 1
        if opened < posts and random.random() < 0.3 and open_feed_post(serial, walk):
            opened += 1
            visit["postsOpened"] += 1
            time.sleep(random.uniform(*FEED_POST_SECONDS))
            if random.random() < 0.5:
                scroll_once(serial, device, 1)
                visit["scrolls"] += 1
            go_back(serial)
            time.sleep(1.5)
        scroll_pause(until)


def read_post(serial, walk, length, visit):
    """Reads the post for longer the longer it is, a few scrolls down and the same back up."""
    device = walk.screen()
    seconds = min(max(length * READ_SECONDS_PER_CHARACTER, READ_SECONDS[0]), READ_SECONDS[1])
    until = time.monotonic() + seconds * random.uniform(0.8, 1.2)
    down = 0
    while time.monotonic() < until:
        walk.check()
        if down < 4 and random.random() < 0.6:
            scroll_once(serial, device, 1)
            down += 1
            visit["scrolls"] += 1
        time.sleep(random.uniform(0.7, 2.2))
    for _ in range(down):
        walk.check()
        scroll_once(serial, device, -1)
        visit["scrolls"] += 1
        time.sleep(random.uniform(0.15, 0.6))


def read_account(serial, walk):
    """Opens the app's account menu and reads it. Leaves the menu open."""
    open_reddit(serial)
    walk.shot("Opened Reddit")
    walk.tap_first("Open the account menu", selectors=app_screens(serial, "reddit")["avatar"])
    time.sleep(1)
    reading = account_from_screen(walk.screen().dump_hierarchy())
    walk.shot("Read the account menu")
    return reading


def action_reddit_state(serial, args, walk):
    """Who the app is signed in as, with the karma and the age."""
    walk.screen().screen_on()
    reading = read_account(serial, walk)
    go_back(serial)
    walk.home()
    return dict(reading, blocked=False, reason="", url="")


def action_reddit_quick_state(serial, args, walk):
    """The same look, asked after every job. An app that cannot be read says
    "not checked", so a failed look is never written down as signed out."""
    try:
        reading = action_reddit_state(serial, args, walk)
    except Cancelled:
        raise
    except Exception as failure:  # Not checked rather than signed out.
        log("Could not read who is signed in on %s: %s" % (serial, failure))
        return {"checked": False, "handle": None, "karma": None, "createdSeconds": None, "blocked": False, "reason": ""}
    return {
        "checked": True,
        "handle": reading["handle"],
        "karma": reading["karma"],
        "createdSeconds": reading["createdSeconds"],
        "blocked": False,
        "reason": "",
    }


def action_reddit_health(serial, args, walk):
    """The account's half of a health reading: who it is, its karma and age,
    and its own profile as the app shows it. The stranger's half is the
    reader browser's, never a phone's."""
    walk.screen().screen_on()
    reading = read_account(serial, walk)
    profile = None
    if reading["handle"]:
        signed_in = {"status": 0, "found": False, "suspended": False}
        try:
            walk.tap_first("Open your profile", selectors=app_screens(serial, "reddit")["profile_entry"])
            time.sleep(2)
            signed_in = profile_from_screen(walk.screen().dump_hierarchy(), reading["handle"])
            walk.shot("Read your profile")
        except StepFailed:
            # A rehearsal that cannot reach the profile is broken; a real
            # reading says the profile did not load, which is status 0.
            if walk.rehearse:
                raise
        profile = {"signedIn": signed_in}
    walk.home()
    return dict(reading, blocked=False, reason="", profile=profile)


def leave_composer(serial, walk):
    """Out of the comment box without sending anything: Back, and Discard if asked."""
    go_back(serial)
    time.sleep(1)
    device = walk.screen()
    for selector in app_screens(serial, "reddit")["discard"]:
        button = device(**selector)
        if button.exists:
            walk.press(button)
            walk.shot("Left the comment box without sending")
            break


def action_reddit_comment(serial, args, walk):
    """Writes one comment under a post, inside an ordinary visit to the app.

    Before: the home feed for a minute or two, sometimes opening a post.
    Then who is signed in, the post by its link, the post read, the words
    typed with a person's rhythm, a pause, and Post pressed once. After: a
    little more feed. Nothing before the comment stops it except not being
    signed in, and nothing after the press can fail it: it is on Reddit by
    then and never sent twice. The comment's link is "" here; Promo reads it
    afterwards from the signed-out reader browser.

    In a rehearsal there is no feed and nothing is typed: the post opens,
    the comment box opens, Post is found and not pressed, and the box is left.
    """
    permalink = str(args.get("permalink") or "").strip()
    text = str(args.get("text") or "").strip()
    # Only a post's own address is opened, in a real run or a rehearsal.
    if permalink and not POST_LINK.match(permalink):
        raise RuntimeError("comment: permalink is not a Reddit post's address")
    if not walk.rehearse:
        if not permalink.startswith("/"):
            raise RuntimeError("comment: permalink must start with /")
        if not text:
            raise RuntimeError("comment: no words to post")
    device = walk.screen()
    device.screen_on()
    started = time.monotonic()
    deadline = started + VISIT_BUDGET_SECONDS
    reserve = COMMENT_RESERVE_SECONDS + len(text) * TYPING_SECONDS_PER_CHARACTER
    visit = new_visit()
    handle = None

    if not walk.rehearse:
        try:
            open_reddit(serial)
            walk.shot("Opened Reddit")
            browse_feed(serial, walk, random.uniform(*FEED_BEFORE_SECONDS), random.randint(*POSTS_BEFORE), visit, deadline - reserve)
        except Cancelled:
            raise
        except Exception as failure:  # The comment still goes.
            visit["problems"].append("the feed before: %s" % short_words(failure))
        visit["beforeSeconds"] = int(time.monotonic() - started)
        handle = read_account(serial, walk)["handle"]
        go_back(serial)
        if not handle:
            raise RuntimeError("comment: the app is not signed in to Reddit")

    if permalink:
        walk.check()
        open_post_link(serial, permalink)
        walk.shot("Opened the post")
    else:
        open_reddit(serial)
        if not open_feed_post(serial, walk):
            raise StepFailed("Open a post", "No post was on the app's home feed to open.")

    thread = device.dump_hierarchy()
    if not walk.rehearse:
        read_post(serial, walk, len(" ".join(screen_lines(thread, app_packages("reddit")))), visit)
        thread = device.dump_hierarchy()
    before = handle_count(thread, handle)

    walk.tap_first("Open the comment box", selectors=app_screens(serial, "reddit")["comment_box"])
    if not walk.rehearse:
        gaps = type_like_a_person(serial, device, text, walk.check)
        walk.shot("Typed the comment")
        log("comment typed: %d characters, gaps %.2f to %.2f seconds" % (len(text), min(gaps or [0]), max(gaps or [0])))
        time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))

    pressed = walk.final_first("Press Post", selectors=app_screens(serial, "reddit")["post_button"])
    if not pressed:
        leave_composer(serial, walk)
        walk.home()
        return {"commentUrl": "", "visit": visit}

    landed = False
    waiting_until = time.time() + POST_LANDED_SECONDS
    while time.time() < waiting_until:
        time.sleep(1)
        try:
            if comment_landed(device.dump_hierarchy(), handle, before):
                landed = True
                break
        except Exception:  # A screen caught mid-change; look again.
            continue
    walk.shot("Looked for the comment")
    if not landed:
        raise RuntimeError("comment: pressed Post but no new comment by u/%s appeared within %d seconds" % (handle, POST_LANDED_SECONDS))

    # After: nothing here may fail the comment, which is already on Reddit.
    after_started = time.monotonic()
    try:
        seconds = min(random.uniform(*FEED_AFTER_SECONDS), deadline - after_started)
        if seconds > 5:
            go_back(serial)
            time.sleep(1.5)
            browse_feed(serial, walk, seconds, 0, visit, deadline)
    except Exception as failure:  # Includes a cancel: the comment is out either way.
        visit["problems"].append("the feed after: %s" % short_words(failure))
    visit["afterSeconds"] = int(time.monotonic() - after_started)
    walk.home()
    log("comment visit: %d seconds before, %d after, %d posts opened, %d scrolls; %s" % (
        visit["beforeSeconds"], visit["afterSeconds"], visit["postsOpened"], visit["scrolls"],
        "; ".join(visit["problems"]) or "no problems",
    ))
    return {"commentUrl": "", "visit": visit}


# ---------------------------------------------------------------------------
# Instagram and TikTok (phone farm file 06), and the direct messages every
# phone account reads, Reddit's included. The same steps in two apps, so one
# set of actions reads each app's own buttons from APP_SCREENS.
#
# Nothing here posts, answers or changes a profile unless Promo sent the
# action because a person pressed the button, and the last button (Share,
# Post, Send, Save) is pressed once, through final_first, so a rehearsal
# never presses it. Like Reddit's, every screen here was written from how
# the apps are known to look, not dumped from a real phone (16 Oct 2026); the
# self-test walks them first, and a step that does not find its button stops
# with a picture of the screen.

INSTAGRAM = APP_PACKAGES["instagram"]
TIKTOK = APP_PACKAGES["tiktok"]


def shapes(package, *patterns):
    """A button looked for by its words or its description, in each pattern given."""
    found = []
    for pattern in patterns:
        found.append({"textMatches": pattern, "packageName": package})
        found.append({"descriptionMatches": pattern, "packageName": package})
    return found


def field_in(package):
    return [{"className": "android.widget.EditText", "packageName": package}]


IOS_REDDIT, IOS_INSTAGRAM, IOS_TIKTOK = APP_BUNDLES["reddit"], APP_BUNDLES["instagram"], APP_BUNDLES["tiktok"]


def ios_field_in(bundle):
    """A text box on an iPhone: a text field, a text view or a search field in the app's own tree."""
    return [{"classNameMatches": "XCUIElementType(TextField|TextView|SearchField)", "packageName": bundle}]


def ios_first_cell(bundle):
    """The first cell of a picker, which is the newest item in the library."""
    return [{"className": "XCUIElementTypeCell", "packageName": bundle}]


APP_SCREENS = {
    "instagram": {
        "package": INSTAGRAM,
        "profile_tab": shapes(INSTAGRAM, "(?i)^(profile|your profile)$") + [{"resourceIdMatches": "(?i).*profile_tab.*", "packageName": INSTAGRAM}],
        "settings": shapes(INSTAGRAM, "(?i)^(options|menu|settings and activity|settings)$"),
        "account_status": shapes(INSTAGRAM, "(?i)^account status$"),
        "status_detail": shapes(INSTAGRAM, "(?i)^what can.?t be recommended$"),
        "edit_profile": shapes(INSTAGRAM, "(?i)^edit profile$"),
        "rows": {
            "displayName": shapes(INSTAGRAM, "(?i)^name$"),
            "bio": shapes(INSTAGRAM, "(?i)^bio$"),
            "link": shapes(INSTAGRAM, "(?i)^(links|add link|add links|website)$"),
        },
        "link_add": shapes(INSTAGRAM, "(?i)^add external link$"),
        "picture_row": shapes(INSTAGRAM, "(?i)^(edit picture or avatar|change profile photo|edit picture)$"),
        "picture_library": shapes(INSTAGRAM, "(?i)^(choose from library|new profile picture|choose from gallery)$"),
        "gallery_first": [{"resourceIdMatches": "(?i).*(gallery_grid_item|media_picker_item|thumbnail).*", "packageName": INSTAGRAM}],
        "save": shapes(INSTAGRAM, "(?i)^(done|save)$"),
        "next": shapes(INSTAGRAM, "(?i)^next$"),
        "share_to": shapes(INSTAGRAM, "(?i)^(feed|reel|reels)$"),
        "caption": shapes(INSTAGRAM, "(?i)^(write a caption|add a caption)( ?(…|\\.\\.\\.))?$"),
        "share": shapes(INSTAGRAM, "(?i)^share$"),
        "posted": ("your post has been shared", "your reel has been shared", "post shared", "reel shared", "your post is live"),
        "post_failed": ("couldn't post", "couldn't share", "upload failed", "couldn't upload", "post failed"),
        "grid_first": [
            {"descriptionMatches": "(?i).*row 1, column 1.*", "packageName": INSTAGRAM},
            {"resourceIdMatches": "(?i).*(image_button|grid_card_layout_container).*", "packageName": INSTAGRAM},
        ],
        "more": shapes(INSTAGRAM, "(?i)^(more|more options|options)$"),
        "copy_link": shapes(INSTAGRAM, "(?i)^(copy link|link)$"),
        "inbox": shapes(INSTAGRAM, "(?i)^(direct|messenger|messages|message|direct messages)$") + [{"resourceIdMatches": "(?i).*(direct_tab|action_bar_inbox_button).*", "packageName": INSTAGRAM}],
        "activity": shapes(INSTAGRAM, "(?i)^(notifications|activity)$"),
        "message_box": shapes(INSTAGRAM, "(?i)^message( ?(…|\\.\\.\\.))?$") + field_in(INSTAGRAM),
        "send": shapes(INSTAGRAM, "(?i)^send$"),
        "reply": shapes(INSTAGRAM, "(?i)^reply$"),
        "comment_box": field_in(INSTAGRAM),
        "comment_send": shapes(INSTAGRAM, "(?i)^(post|send)$"),
        "field": field_in(INSTAGRAM),
        "handle_id": "(?i).*(action_bar_title|action_bar_large_title|profile_header_username|username).*",
        "figures": {"posts": "posts", "followers": "followers", "following": "following"},
        "hidden": (
            "your account can't be recommended",
            "can't be recommended to people who don't follow you",
            "isn't eligible to be recommended",
            "not eligible to be recommended",
            "some of your content isn't eligible",
            "your content may not be recommended",
        ),
        "clear": (
            "your account can be recommended",
            "you haven't posted anything that",
            "no content is affected",
            "nothing is affecting",
            "eligible to be recommended",
        ),
        "link_shape": re.compile(r"^https://(www\.)?instagram\.com/(p|reel|tv)/[A-Za-z0-9_-]+/?(\?\S*)?$"),
    },
    "tiktok": {
        "package": TIKTOK,
        "profile_tab": shapes(TIKTOK, "(?i)^(profile|me)$"),
        "settings": shapes(TIKTOK, "(?i)^(menu|settings and privacy|profile menu)$"),
        "account_status": shapes(TIKTOK, "(?i)^account status$"),
        "status_detail": shapes(TIKTOK, "(?i)^(for you feed eligibility|recommendation eligibility)$"),
        "edit_profile": shapes(TIKTOK, "(?i)^edit profile$"),
        "rows": {
            "displayName": shapes(TIKTOK, "(?i)^name$"),
            "bio": shapes(TIKTOK, "(?i)^bio$"),
            "link": shapes(TIKTOK, "(?i)^(links|website|add link)$"),
        },
        "link_add": shapes(TIKTOK, "(?i)^(add link|website)$"),
        "picture_row": shapes(TIKTOK, "(?i)^(change photo|edit photo|photo)$"),
        "picture_library": shapes(TIKTOK, "(?i)^(select from gallery|upload photo|choose from gallery)$"),
        "gallery_first": [{"resourceIdMatches": "(?i).*(media_item|gallery_item|thumbnail|cover).*", "packageName": TIKTOK}],
        "save": shapes(TIKTOK, "(?i)^(save|confirm|done)$"),
        "next": shapes(TIKTOK, "(?i)^next$"),
        "share_to": [],
        "caption": shapes(TIKTOK, "(?i)^(add description|describe your post|add a description).*$") + field_in(TIKTOK),
        "share": shapes(TIKTOK, "(?i)^post$"),
        "posted": ("your video is now posted", "posted", "your post is live", "upload complete"),
        "post_failed": ("couldn't post", "upload failed", "couldn't upload", "post failed"),
        "grid_first": [{"resourceIdMatches": "(?i).*(cover|video_cover|aweme_cover).*", "packageName": TIKTOK}],
        "more": shapes(TIKTOK, "(?i)^(share|more)$"),
        "copy_link": shapes(TIKTOK, "(?i)^copy link$"),
        "inbox": shapes(TIKTOK, "(?i)^(inbox)$"),
        "activity": shapes(TIKTOK, "(?i)^(activities|activity|comments)$"),
        "message_box": shapes(TIKTOK, "(?i)^send a message( ?(…|\\.\\.\\.))?$") + field_in(TIKTOK),
        "send": shapes(TIKTOK, "(?i)^send$"),
        "reply": shapes(TIKTOK, "(?i)^reply$"),
        "comment_box": field_in(TIKTOK),
        "comment_send": shapes(TIKTOK, "(?i)^(post|send)$"),
        "field": field_in(TIKTOK),
        "handle_id": "",
        "figures": {"posts": "", "followers": "followers", "following": "following"},
        "hidden": (
            "not eligible for the for you feed",
            "ineligible for the for you feed",
            "not eligible for recommendation",
            "your account isn't eligible",
            "may not be recommended",
        ),
        "clear": ("eligible for the for you feed", "good standing", "no violations", "your account is in good standing"),
        "link_shape": re.compile(r"^https://((www|vm|vt)\.)?tiktok\.com/\S+$"),
    },
}

# The same two apps on an iPhone (phone farm part 51), keyed by bundle id.
# A button is found by its accessibility label (text or description here)
# or its accessibility id (resourceId). The words the apps say, and the link
# shapes, are the Android entries' own, since they are the same apps. The
# post flow differs: no share screen is handed a file, so the app's own
# create button and library picker are walked, "create", "upload" and
# "picker_first". Written from how the apps are known to look (18 Oct 2026);
# the first self-test on a real iPhone is the proof.
APP_SCREENS[IOS_INSTAGRAM] = {
    "package": IOS_INSTAGRAM,
    "profile_tab": shapes(IOS_INSTAGRAM, "(?i)^(profile|your profile)$") + [{"resourceIdMatches": "(?i).*profile.?tab.*", "packageName": IOS_INSTAGRAM}],
    "settings": shapes(IOS_INSTAGRAM, "(?i)^(options|menu|settings and activity|settings)$") + [{"resourceIdMatches": "(?i).*(settings|options).?button.*", "packageName": IOS_INSTAGRAM}],
    "account_status": shapes(IOS_INSTAGRAM, "(?i)^account status$"),
    "status_detail": shapes(IOS_INSTAGRAM, "(?i)^what can.?t be recommended$"),
    "edit_profile": shapes(IOS_INSTAGRAM, "(?i)^edit profile$"),
    "rows": {
        "displayName": shapes(IOS_INSTAGRAM, "(?i)^name$"),
        "bio": shapes(IOS_INSTAGRAM, "(?i)^bio$"),
        "link": shapes(IOS_INSTAGRAM, "(?i)^(links|add link|add links|website)$"),
    },
    "link_add": shapes(IOS_INSTAGRAM, "(?i)^add external link$"),
    "picture_row": shapes(IOS_INSTAGRAM, "(?i)^(edit picture or avatar|change profile photo|edit picture)$"),
    "picture_library": shapes(IOS_INSTAGRAM, "(?i)^(choose from library|new profile picture|choose from gallery)$"),
    "gallery_first": ios_first_cell(IOS_INSTAGRAM),
    "create": shapes(IOS_INSTAGRAM, "(?i)^(create|new post|new|add|camera)$") + [{"resourceIdMatches": "(?i).*(create|camera).?tab.*", "packageName": IOS_INSTAGRAM}],
    "upload": [],
    "picker_first": ios_first_cell(IOS_INSTAGRAM),
    "save": shapes(IOS_INSTAGRAM, "(?i)^(done|save)$"),
    "next": shapes(IOS_INSTAGRAM, "(?i)^next$"),
    "share_to": shapes(IOS_INSTAGRAM, "(?i)^(feed|reel|reels)$"),
    "caption": shapes(IOS_INSTAGRAM, "(?i)^(write a caption|add a caption)( ?(…|\\.\\.\\.))?$") + ios_field_in(IOS_INSTAGRAM),
    "keyboard_done": [{"textMatches": "(?i)^(ok|done)$", "packageName": IOS_INSTAGRAM}],
    "share": shapes(IOS_INSTAGRAM, "(?i)^share$"),
    "posted": APP_SCREENS["instagram"]["posted"],
    "post_failed": APP_SCREENS["instagram"]["post_failed"],
    "grid_first": ios_first_cell(IOS_INSTAGRAM) + [{"classNameMatches": "XCUIElementType(Image|Button)", "packageName": IOS_INSTAGRAM, "descriptionMatches": "(?i)^(photo|video|reel)( by .*)?$"}],
    "more": shapes(IOS_INSTAGRAM, "(?i)^(more|more options|options)$"),
    "copy_link": shapes(IOS_INSTAGRAM, "(?i)^(copy link|link)$"),
    "inbox": shapes(IOS_INSTAGRAM, "(?i)^(direct|messenger|messages|message|direct messages)$") + [{"resourceIdMatches": "(?i).*(direct|inbox).?(tab|button).*", "packageName": IOS_INSTAGRAM}],
    "activity": shapes(IOS_INSTAGRAM, "(?i)^(notifications|activity)$"),
    "message_box": shapes(IOS_INSTAGRAM, "(?i)^message( ?(…|\\.\\.\\.))?$") + ios_field_in(IOS_INSTAGRAM),
    "send": shapes(IOS_INSTAGRAM, "(?i)^send$"),
    "reply": shapes(IOS_INSTAGRAM, "(?i)^reply$"),
    "comment_box": ios_field_in(IOS_INSTAGRAM),
    "comment_send": shapes(IOS_INSTAGRAM, "(?i)^(post|send)$"),
    "field": ios_field_in(IOS_INSTAGRAM),
    # The username is the profile's own title bar on iOS; there is no id to match.
    "handle_in_title": True,
    "figures": APP_SCREENS["instagram"]["figures"],
    "hidden": APP_SCREENS["instagram"]["hidden"],
    "clear": APP_SCREENS["instagram"]["clear"],
    "link_shape": APP_SCREENS["instagram"]["link_shape"],
}
APP_SCREENS[IOS_TIKTOK] = {
    "package": IOS_TIKTOK,
    "profile_tab": shapes(IOS_TIKTOK, "(?i)^(profile|me)$"),
    "settings": shapes(IOS_TIKTOK, "(?i)^(menu|settings and privacy|profile menu)$"),
    "account_status": shapes(IOS_TIKTOK, "(?i)^account status$"),
    "status_detail": shapes(IOS_TIKTOK, "(?i)^(for you feed eligibility|recommendation eligibility)$"),
    "edit_profile": shapes(IOS_TIKTOK, "(?i)^edit profile$"),
    "rows": {
        "displayName": shapes(IOS_TIKTOK, "(?i)^name$"),
        "bio": shapes(IOS_TIKTOK, "(?i)^bio$"),
        "link": shapes(IOS_TIKTOK, "(?i)^(links|website|add link)$"),
    },
    "link_add": shapes(IOS_TIKTOK, "(?i)^(add link|website)$"),
    "picture_row": shapes(IOS_TIKTOK, "(?i)^(change photo|edit photo|photo)$"),
    "picture_library": shapes(IOS_TIKTOK, "(?i)^(select from gallery|upload photo|choose from gallery|choose from library)$"),
    "gallery_first": ios_first_cell(IOS_TIKTOK),
    "create": shapes(IOS_TIKTOK, "(?i)^(create|record|new|add)$") + [{"resourceIdMatches": "(?i).*(create|record|camera).?(tab|button).*", "packageName": IOS_TIKTOK}],
    "upload": shapes(IOS_TIKTOK, "(?i)^(upload|album|gallery)$"),
    "picker_first": ios_first_cell(IOS_TIKTOK),
    "save": shapes(IOS_TIKTOK, "(?i)^(save|confirm|done)$"),
    "next": shapes(IOS_TIKTOK, "(?i)^next$"),
    "share_to": [],
    "caption": shapes(IOS_TIKTOK, "(?i)^(add description|describe your post|add a description).*$") + ios_field_in(IOS_TIKTOK),
    "keyboard_done": [{"textMatches": "(?i)^(ok|done)$", "packageName": IOS_TIKTOK}],
    "share": shapes(IOS_TIKTOK, "(?i)^post$"),
    "posted": APP_SCREENS["tiktok"]["posted"],
    "post_failed": APP_SCREENS["tiktok"]["post_failed"],
    "grid_first": ios_first_cell(IOS_TIKTOK),
    "more": shapes(IOS_TIKTOK, "(?i)^(share|more)$"),
    "copy_link": shapes(IOS_TIKTOK, "(?i)^copy link$"),
    "inbox": shapes(IOS_TIKTOK, "(?i)^(inbox)$"),
    "activity": shapes(IOS_TIKTOK, "(?i)^(activities|activity|comments)$"),
    "message_box": shapes(IOS_TIKTOK, "(?i)^send a message( ?(…|\\.\\.\\.))?$") + ios_field_in(IOS_TIKTOK),
    "send": shapes(IOS_TIKTOK, "(?i)^send$"),
    "reply": shapes(IOS_TIKTOK, "(?i)^reply$"),
    "comment_box": ios_field_in(IOS_TIKTOK),
    "comment_send": shapes(IOS_TIKTOK, "(?i)^(post|send)$"),
    "field": ios_field_in(IOS_TIKTOK),
    "handle_in_title": False,
    "figures": APP_SCREENS["tiktok"]["figures"],
    "hidden": APP_SCREENS["tiktok"]["hidden"],
    "clear": APP_SCREENS["tiktok"]["clear"],
    "link_shape": APP_SCREENS["tiktok"]["link_shape"],
}


# Medium's app (Medium task, part 42). Written from how the app is put
# together, like Instagram's and TikTok's were (phone farm file 06), and not
# yet walked on a real phone. The daily self-test walks it first, on a story
# Promo found in the last week; with none found, it only opens the app. A response
# is answered in the app with the same three steps a browser takes: the
# responses button under the story, the box, and Respond.
MEDIUM = APP_PACKAGES["medium"]
APP_SCREENS["medium"] = {
    "package": MEDIUM,
    "profile_tab": shapes(MEDIUM, "(?i)^(you|profile|your profile|me)$") + [{"resourceIdMatches": "(?i).*(profile|avatar).*tab.*", "packageName": MEDIUM}],
    "responses": shapes(MEDIUM, "(?i)^(responses?|\\d+ responses?|view responses)$") + [{"resourceIdMatches": "(?i).*responses.*", "packageName": MEDIUM}],
    "response_box": shapes(MEDIUM, "(?i)^what are your thoughts\\??$") + field_in(MEDIUM),
    "respond": shapes(MEDIUM, "(?i)^(respond|publish|post)$"),
    "handle_id": "(?i).*(username|user_name|handle).*",
    "figures": {"posts": "", "followers": "followers", "following": "following"},
}
APP_SCREENS[APP_BUNDLES["medium"]] = dict(
    APP_SCREENS["medium"],
    package=APP_BUNDLES["medium"],
    response_box=shapes(APP_BUNDLES["medium"], "(?i)^what are your thoughts\\??$") + ios_field_in(APP_BUNDLES["medium"]),
    handle_in_title=False,
)

def app_screens(serial, app):
    """The app's buttons on this phone: the iPhone app's, keyed by its bundle
    id, on an iPhone; the Android app's, keyed by its name, otherwise."""
    return APP_SCREENS[package_for(serial, app)] if is_iphone(serial) else APP_SCREENS[app]

# Words a signed-out app's first screen shows.
LOG_IN_WORDS = ("log in", "log into another account", "sign up", "create new account", "use phone or email")
COUNT_TEXT = re.compile(r"^\d[\d,]*(\.\d+)?\s*[kKmM]?$")
COUNT_LINE = re.compile(r"^(\d[\d,]*(?:\.\d+)?\s*[kKmM]?)\s+([A-Za-z]+)$")
AT_HANDLE = re.compile(r"^@([A-Za-z0-9._]{2,30})$")
PLAIN_HANDLE = re.compile(r"^[A-Za-z0-9._]{1,30}$")
# Lines a conversation shows that nobody wrote: times, days, Seen and Sent.
NOT_A_LINE = re.compile(r"(?i)^(today|yesterday|seen|sent|delivered|active now|active \d+\w* ago|\d{1,2}:\d{2}( ?[ap]m)?|(today|yesterday|mon|tue|wed|thu|fri|sat|sun)\w* \d{1,2}:\d{2}.*|\d+[smhdw])$")
POST_LANDED_APP_SECONDS = 180
APP_FEED_AFTER_SECONDS = (20, 60)
APP_READ_FEED_SECONDS = (30, 90)
MEDIA_DOWNLOAD_LIMIT = 300 * 1024 * 1024
MEDIA_DOWNLOAD_SECONDS = 120


def open_app(serial, app):
    if is_iphone(serial):
        iphone_screen(serial).app_start(APP_BUNDLES[app])
    else:
        shell(serial, "monkey -p %s -c android.intent.category.LAUNCHER 1" % APP_PACKAGES[app])
    time.sleep(4)


def signed_out(hierarchy_xml, app):
    """True on a sign-in screen: a short screen offering Log in."""
    lines = [plain(line) for line in screen_lines(hierarchy_xml, app_packages(app))]
    return len(lines) < 40 and any(line in LOG_IN_WORDS for line in lines)


def parse_count(text):
    """1,234 or 12.3K as a number, or None."""
    return parse_karma(text)


def profile_handle(hierarchy_xml, app):
    """The account's name on its own profile: the title bar on Instagram, the
    @name line on TikTok. Android's title bar is found by its view id
    (handle_id); an iPhone's is the navigation bar, named after the account
    (handle_in_title), and has no id to match."""
    root = ElementTree.fromstring(hierarchy_xml)
    packages = app_packages(app)
    pattern = APP_SCREENS[app]["handle_id"]
    in_title = APP_SCREENS[APP_BUNDLES[app]].get("handle_in_title", False)
    for node in root.iter("node"):
        if not own_node(node, packages):
            continue
        words = node_words(node).strip().rstrip("⌄▾").strip()
        found = AT_HANDLE.match(words)
        if found:
            return found.group(1)
        if pattern and re.match(pattern, node.get("resource-id") or "") and PLAIN_HANDLE.match(words):
            return words
        if in_title and ios_kind(node) == "XCUIElementTypeNavigationBar" and PLAIN_HANDLE.match(words) and plain(words) not in NOT_A_HANDLE:
            return words
    return None


# Titles a navigation bar shows that are no account's name.
NOT_A_HANDLE = ("profile", "settings", "instagram", "home", "search", "reels", "explore", "edit", "back")


def app_profile_from_screen(hierarchy_xml, app):
    """The handle and the figures on the account's own profile. None where one is not shown."""
    handle = profile_handle(hierarchy_xml, app)
    figures = {}
    lines = screen_lines(hierarchy_xml, app_packages(app))
    for key, label in APP_SCREENS[app]["figures"].items():
        if not label:
            figures[key] = None
            continue
        value = value_beside_label(hierarchy_xml, label, COUNT_TEXT)
        if value is None:
            for line in lines:
                found = COUNT_LINE.match(line)
                if found and plain(found.group(2)) == label:
                    value = found.group(1)
                    break
        figures[key] = parse_count(value) if value else None
    return {"handle": handle, "followers": figures["followers"], "following": figures["following"], "posts": figures["posts"]}


def read_app_profile(serial, walk, app):
    """Opens the app on the account's own profile and reads it. Leaves it there."""
    open_app(serial, app)
    walk.shot("Opened %s" % APP_NAMES[app])
    device = walk.screen()
    if signed_out(device.dump_hierarchy(), app):
        return {"handle": None, "followers": None, "following": None, "posts": None}
    walk.tap_first("Open the profile", selectors=app_screens(serial, app)["profile_tab"])
    time.sleep(2)
    reading = app_profile_from_screen(device.dump_hierarchy(), app)
    walk.shot("Read the profile")
    return reading


def action_app_quick_state(app):
    def action(serial, args, walk):
        """Who the app is signed in as, read after every job. An app that cannot
        be read says "not checked", so a failed look is never written down as
        signed out."""
        try:
            walk.screen().screen_on()
            reading = read_app_profile(serial, walk, app)
            walk.home()
        except Cancelled:
            raise
        except Exception as failure:  # Not checked rather than signed out.
            log("Could not read who is signed in to %s on %s: %s" % (APP_NAMES[app], serial, failure))
            return {"checked": False, "handle": None}
        return {"checked": True, "handle": reading["handle"]}
    return action


def shadowban_from_screen(hierarchy_xml, app):
    """What the Account status page says about being shown to people who do not
    follow the account: hidden, clear, or not read when neither is said.
    Hidden is looked for first, since "can't be recommended" also holds
    "be recommended"."""
    screens = APP_SCREENS[app]
    labels = [selector["textMatches"] for selector in screens["status_detail"] if "textMatches" in selector]
    # The menu's own label ("What can't be recommended") is not an answer.
    lines = [line for line in screen_lines(hierarchy_xml, app_packages(app)) if not any(re.match(label, line) for label in labels)]
    words = [plain(line) for line in lines]
    for line in words:
        if any(phrase in line for phrase in screens["hidden"]):
            return {"read": True, "hidden": True, "words": next(text for text in lines if plain(text) == line)[:300]}
    for line in words:
        if any(phrase in line for phrase in screens["clear"]):
            return {"read": True, "hidden": False, "words": next(text for text in lines if plain(text) == line)[:300]}
    return {"read": False, "hidden": False, "words": ""}


def read_account_status(serial, walk, app):
    """Settings, then Account status, then the part about recommendations,
    read without pressing anything else. A step that is not found leaves it
    unread rather than failing the reading."""
    screens = app_screens(serial, app)
    try:
        walk.tap_first("Open the menu", selectors=screens["settings"])
        time.sleep(1.5)
        scroll_to_first(walk, "Find Account status", screens["account_status"])
        walk.tap_first("Open Account status", selectors=screens["account_status"])
        time.sleep(2)
        reading = shadowban_from_screen(walk.screen().dump_hierarchy(), app)
        if not reading["read"]:
            try:
                walk.tap_first("Open what can't be recommended", timeout=3, selectors=screens["status_detail"])
                time.sleep(2)
                reading = shadowban_from_screen(walk.screen().dump_hierarchy(), app)
            except StepFailed:
                pass
        walk.shot("Read Account status")
        return reading
    except StepFailed:
        if walk.rehearse:
            raise
        return {"read": False, "hidden": False, "words": ""}


def post_numbers_from_screen(hierarchy_xml, app):
    """Views, likes and comments as one post's own screen shows them, each None when not shown."""
    lines = screen_lines(hierarchy_xml, app_packages(app))
    found = {"views": None, "likes": None, "comments": None}
    words = {"views": ("views", "plays", "view", "play"), "likes": ("likes", "like"), "comments": ("comments", "comment")}
    for line in lines:
        text = line.replace(",", "")
        for key, names in words.items():
            if found[key] is not None:
                continue
            match = re.match(r"(?i)^([\d.]+\s*[km]?)\s+(%s)$" % "|".join(names), text.strip())
            if match:
                found[key] = parse_count(match.group(1))
    # TikTok writes the counts under their icons, described by the button: "Like, 1.2K".
    for line in lines:
        match = re.match(r"(?i)^(like|likes|comment|comments|views?|plays?)\W+([\d.,]+\s*[km]?)\b", line.strip())
        if match:
            key = "likes" if match.group(1).lower().startswith("like") else "comments" if match.group(1).lower().startswith("comment") else "views"
            if found[key] is None:
                found[key] = parse_count(match.group(2).replace(",", ""))
    return found


def open_link(serial, app, url):
    """Opens an address in the app that owns it: handed to the app on Android,
    through the iPhone's own link handling (the app, or Safari) on an iPhone."""
    if is_iphone(serial):
        iphone_screen(serial).open_url(url)
    else:
        shell(serial, "am start -a android.intent.action.VIEW -d '%s' -p %s" % (url.replace("'", ""), APP_PACKAGES[app]))
    time.sleep(4)


def unread_in_inbox(hierarchy_xml, app):
    """True when the inbox button says something is unread: "Messenger, 2 unread", "Inbox, 3"."""
    for line in screen_lines(hierarchy_xml, app_packages(app)):
        text = plain(line)
        if re.match(r"^(direct|messenger|messages|inbox)\W+\d+", text) or re.search(r"\b\d+ (unread|new)\b", text):
            return True
    return False


def action_app_health(app):
    def action(serial, args, walk):
        """The daily reading: the profile, the Account status page, and the
        numbers of each post named, opened by its link. A post that will not
        open is left out, and its numbers stay as they were."""
        walk.screen().screen_on()
        reading = read_app_profile(serial, walk, app)
        result = dict(reading, shadowban={"read": False, "hidden": False, "words": ""}, numbers=[], inboxWaiting=False)
        if not reading["handle"]:
            walk.home()
            return result
        result["shadowban"] = read_account_status(serial, walk, app)
        go_back(serial)
        go_back(serial)
        urls = [str(url) for url in (args.get("postUrls") or []) if app_screens(serial, app)["link_shape"].match(str(url))]
        for url in urls[:12]:
            walk.check()
            try:
                open_link(serial, app, url)
                numbers = post_numbers_from_screen(walk.screen().dump_hierarchy(), app)
                walk.shot("Read a post's numbers")
                result["numbers"].append(dict(numbers, url=url))
            except StepFailed:
                continue
        try:
            open_app(serial, app)
            result["inboxWaiting"] = unread_in_inbox(walk.screen().dump_hierarchy(), app)
        except Exception as failure:  # A glance that fails is only a glance.
            log("Could not glance at the %s inbox on %s: %s" % (APP_NAMES[app], serial, failure))
        walk.home()
        return result
    return action


# ---------------------------------------------------------------------------
# Files for a post or a profile picture: downloaded from Promo's own media
# address, put in the phone's camera folder under a camera-like name, and
# scanned so the gallery shows it.

MEDIA_TYPES = {
    ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp",
    ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm",
}


def media_extension(url):
    path = url.split("?", 1)[0].lower()
    for extension in MEDIA_TYPES:
        if path.endswith(extension):
            return extension
    return ""


def download_media(url, fetch=None):
    """The file's bytes and its extension, or a failure saying why. Only an https address is fetched."""
    if not url.startswith("https://"):
        raise RuntimeError("post: the file's address is not an https address")
    extension = media_extension(url)
    if not extension:
        raise RuntimeError("post: the file is not a photo or video the apps take")
    if fetch is None:
        def fetch(address):
            with urllib.request.urlopen(address, timeout=MEDIA_DOWNLOAD_SECONDS) as response:
                data = response.read(MEDIA_DOWNLOAD_LIMIT + 1)
            return data
    data = fetch(url)
    if len(data) > MEDIA_DOWNLOAD_LIMIT:
        raise RuntimeError("post: the file is larger than 300 MB")
    if not data:
        raise RuntimeError("post: the file came back empty")
    return data, extension


def camera_name(extension, now=None):
    """IMG_20261016_142233.jpg or VID_..., the way the phone's own camera names a file."""
    stamp = time.strftime("%Y%m%d_%H%M%S", time.localtime(now or time.time()))
    return "%s_%s%s" % ("VID" if MEDIA_TYPES[extension].startswith("video/") else "IMG", stamp, extension)


def put_in_gallery(serial, data, extension):
    """Puts the file in the camera folder and has the gallery read it. Returns its path on the phone."""
    name = camera_name(extension)
    folder = os.path.join(HOME, "media")
    os.makedirs(folder, exist_ok=True)
    local = os.path.join(folder, name)
    with open(local, "wb") as handle:
        handle.write(data)
    remote = "/sdcard/DCIM/Camera/%s" % name
    try:
        adb(["push", local, remote], serial=serial, timeout=MEDIA_DOWNLOAD_SECONDS)
    finally:
        try:
            os.remove(local)
        except OSError:
            pass
    shell(serial, "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://%s'" % remote, timeout=15)
    time.sleep(2)
    return remote


def media_uri(serial, remote, extension):
    """The gallery's own address for a file, which the share screen is handed."""
    kind = "video" if MEDIA_TYPES[extension].startswith("video/") else "images"
    output = shell(serial, "content query --uri content://media/external/%s/media --projection _id --where \"_data='%s'\"" % (kind, remote), timeout=15)
    found = re.search(r"_id=(\d+)", output)
    if not found:
        raise RuntimeError("post: the gallery did not list the file after it was copied in")
    return "content://media/external/%s/media/%s" % (kind, found.group(1))


def rehearsal_picture():
    """A plain picture for the self-test to walk the post screens with. Never posted."""
    from PIL import Image  # uiautomator2 brings Pillow.
    buffer = io.BytesIO()
    Image.new("RGB", (1080, 1080), (232, 228, 220)).save(buffer, format="JPEG", quality=80)
    return buffer.getvalue(), ".jpg"


def share_into(serial, app, uri, extension):
    """Hands the file to the app's own share screen, as sharing from the gallery does."""
    shell(serial, "am start -a android.intent.action.SEND -t %s --eu android.intent.extra.STREAM %s --grant-read-uri-permission -p %s" % (
        MEDIA_TYPES[extension], uri, APP_PACKAGES[app]))
    time.sleep(5)


def leave_app_screen(serial, walk, app, times=4):
    """Backs out of a screen without sending anything, discarding a draft if
    asked. On an iPhone the app is closed as well, since its create screens
    do not all answer the swipe back, and a closed app holds no draft. It is
    the app given that is closed, never whatever is in front, which could be
    the home screen or Safari."""
    for _ in range(times):
        go_back(serial)
        time.sleep(1)
        device = walk.screen()
        for label in ("Discard", "Discard post", "Discard edits", "Delete draft", "Leave"):
            try:
                if device(text=label).exists:
                    walk.press(device(text=label))
                    break
            except Exception:  # A screen caught mid-change.
                break
    if is_iphone(serial):
        try:
            walk.screen().app_stop(package_for(serial, app))
        except Exception:  # The app is gone already, or the phone is.
            pass


def screen_says(hierarchy_xml, app, phrases):
    lines = [plain(line) for line in screen_lines(hierarchy_xml, app_packages(app))]
    return next((line for line in lines if any(phrase in line for phrase in phrases)), None)


def tap_next_until(walk, step, selectors, until, most=3):
    """Presses Next until the screen with `until` shows, at most `most` times."""
    device = walk.screen()
    for index in range(most):
        for selector in until:
            if device(**selector).exists:
                return
        walk.tap_first("%s (%d)" % (step, index + 1), selectors=selectors)
        time.sleep(2)
    walk.find_first(step, selectors=until)


def read_post_link(serial, walk, app):
    """The newest post's link: the profile, its first post, More, Copy link,
    and the clipboard read. "" when the app would not give it."""
    screens = app_screens(serial, app)
    try:
        open_app(serial, app)
        walk.tap_first("Open the profile", selectors=screens["profile_tab"])
        time.sleep(2)
        walk.tap_first("Open the newest post", selectors=screens["grid_first"])
        time.sleep(2)
        walk.tap_first("Open its menu", selectors=screens["more"])
        time.sleep(1)
        walk.tap_first("Copy its link", selectors=screens["copy_link"])
        time.sleep(1)
        link = str(walk.screen().clipboard or "").strip()
    except (StepFailed, AttributeError) as failure:
        log("Could not read the new post's link on %s: %s" % (walk.serial, short_words(failure)))
        return ""
    return link if screens["link_shape"].match(link) else ""


def browse_app_feed(serial, walk, seconds):
    """A little of the app's own feed, which can never fail what came before it."""
    device = walk.screen()
    until = time.monotonic() + seconds
    while time.monotonic() < until:
        walk.check()
        scroll_once(serial, device, 1)
        scroll_pause(until)


# A post's file on an iPhone (phone farm part 55). A computer cannot drop a
# file into an iPhone's Photos, so Promo makes a one-time link to the file,
# good for ten minutes and one download, and the rack opens it in Safari on
# the phone, holds a thumb on the picture or video and saves it to Photos.
# The app's own picker then shows it first, as the newest item.
SAFARI = "com.apple.mobilesafari"
MEDIA_SHOW_SECONDS = 30
LONG_PRESS_SECONDS = 1.0
SAVE_TO_PHOTOS = [{"textMatches": "(?i)^(save to photos|add to photos|save image|save video)$"}]
# Safari's own share button, by its accessibility id; the words only as a fallback.
SAFARI_SHARE = [{"resourceIdMatches": "(?i)^(sharebutton|share)$"}, {"textMatches": "(?i)^share$"}]
# The first save asks whether Safari may add to Photos.
IOS_ALLOW = [{"textMatches": "(?i)^(allow|allow full access|allow access to all photos|add photos only|ok)$"}]


def media_on_screen(hierarchy_xml, height):
    """Where Safari shows the picture or video: the largest image or video
    element below the address bar, else the web view itself, which the file
    fills when it is the whole page. None when there is neither."""
    largest, page = None, None
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        kind = ios_kind(node)
        bounds = parse_bounds(node.get("bounds"))
        if not bounds or bounds[3] <= height * 0.1:
            continue
        area = max(0, bounds[2] - bounds[0]) * max(0, bounds[3] - bounds[1])
        if kind.endswith("Image") or kind.endswith("Video") or plain(node.get("label") or "") in ("video", "image"):
            if area and (largest is None or area > largest[0]):
                largest = (area, bounds)
        elif kind.endswith("WebView") and area and (page is None or area > page[0]):
            page = (area, bounds)
    found = largest or page
    return found[1] if found else None


def long_press(device, x, y):
    """A thumb held on one spot for a second: the iPhone driver's swipe with
    no distance, held for LONG_PRESS_SECONDS."""
    device.swipe(x, y, x, y, duration=LONG_PRESS_SECONDS)


def save_from_safari(serial, walk, url):
    """Opens the one-time link in Safari, waits for the picture or video,
    holds a thumb on it and saves it to Photos. A video has no long-press
    menu, so Safari's share sheet saves that. Runs once: the link dies after
    one download."""
    if not url.startswith("https://"):
        raise RuntimeError("post: the file's address is not an https address")
    device = walk.screen()
    walk.check()
    device.open_url(url)
    _, height = screen_size(device)
    bounds = None
    deadline = time.time() + MEDIA_SHOW_SECONDS
    while time.time() < deadline:
        time.sleep(2)
        walk.check()
        bounds = media_on_screen(device.dump_hierarchy(), height)
        if bounds:
            break
    if not bounds:
        walk.shot("Looked for the file in Safari")
        raise StepFailed("Open the file in Safari", "Safari did not show the picture or video within %d seconds." % MEDIA_SHOW_SECONDS)
    walk.shot("Opened the file in Safari")
    x, y = tap_point(bounds)
    walk.check()
    long_press(device, x, y)
    time.sleep(1.5)
    try:
        walk.tap_first("Save to Photos", timeout=5, selectors=SAVE_TO_PHOTOS)
    except StepFailed:
        walk.tap_first("Open Safari's share sheet", selectors=SAFARI_SHARE)
        time.sleep(1.5)
        walk.tap_first("Save to Photos", timeout=5, selectors=SAVE_TO_PHOTOS)
    time.sleep(1.5)
    try:
        walk.tap_first("Allow Safari to add to Photos", timeout=3, selectors=IOS_ALLOW)
    except StepFailed:
        pass  # Allowed on an earlier save.
    walk.shot("Saved to Photos")
    walk.home()


def wait_for_post(serial, walk, app, screens):
    """After the last button was pressed: the post counts as up when the app
    says so within three minutes, then its link is read and a little feed.
    Nothing here may fail the post, which is up and never sent twice."""
    device = walk.screen()
    button = "Share" if app == "instagram" else "Post"
    landed = None
    waiting_until = time.time() + POST_LANDED_APP_SECONDS
    while time.time() < waiting_until:
        time.sleep(3)
        try:
            hierarchy = device.dump_hierarchy()
        except Exception:  # A screen caught mid-change; look again.
            continue
        if screen_says(hierarchy, app, screens["post_failed"]):
            walk.shot("The app said it failed")
            raise RuntimeError("post: the app said it could not post: %s" % screen_says(hierarchy, app, screens["post_failed"]))
        if screen_says(hierarchy, app, screens["posted"]):
            landed = True
            break
    walk.shot("Looked for the post")
    if not landed:
        raise RuntimeError("post: pressed %s but the app did not say it was posted within %d seconds. It may still be uploading; check the app before posting again." % (
            button, POST_LANDED_APP_SECONDS))
    link = ""
    try:
        link = read_post_link(serial, walk, app)
        browse_app_feed(serial, walk, random.uniform(*APP_FEED_AFTER_SECONDS))
    except Exception as failure:  # Includes a cancel: the post is up either way.
        log("After the post on %s: %s" % (serial, short_words(failure)))
    walk.home()
    return {"postUrl": link}


def ios_app_post(serial, args, walk, app):
    """A post from an iPhone: the file saved to Photos through Safari, then
    the app's own create screen, its picker's newest item, Next until the
    caption box, the caption typed, and Share or Post pressed once. A
    rehearsal downloads nothing and saves nothing: it walks the create
    screen with whatever the test phone's Photos holds, finds the last
    button and backs out."""
    screens = app_screens(serial, app)
    caption = str(args.get("caption") or "")
    device = walk.screen()
    wake_screen(device)
    if not walk.rehearse:
        if args.get("mediaFromSafari") is not True:
            raise RuntimeError("post: an iPhone takes its file through a one-time Safari link (mediaFromSafari), and Promo sent none")
        save_from_safari(serial, walk, str(args.get("mediaUrl") or ""))
    try:
        open_app(serial, app)
        walk.shot("Opened %s" % APP_NAMES[app])
        if signed_out(device.dump_hierarchy(), app):
            raise RuntimeError("post: the app is not signed in to %s" % APP_NAMES[app])
        walk.tap_first("Open the create screen", selectors=screens["create"])
        time.sleep(2)
        if screens["upload"]:
            try:
                walk.tap_first("Open the library", timeout=4, selectors=screens["upload"])
                time.sleep(2)
            except StepFailed:
                pass  # The library is already open on this version.
        walk.tap_first("Pick the newest item", selectors=screens["picker_first"])
        time.sleep(1.5)
        if screens["share_to"]:
            try:
                walk.tap_first("Pick the feed", timeout=4, selectors=screens["share_to"])
            except StepFailed:
                pass  # Straight to the editor on this version.
        tap_next_until(walk, "Press Next", screens["next"], screens["caption"])
        walk.tap_first("Open the caption box", selectors=screens["caption"])
        if not walk.rehearse and caption:
            gaps = type_like_a_person(serial, device, caption, walk.check)
            walk.shot("Typed the caption")
            log("caption typed: %d characters, gaps %.2f to %.2f seconds" % (len(caption), min(gaps or [0]), max(gaps or [0])))
            # The keyboard down, so the last button is on screen. iOS has no
            # Back key for that; the app's own OK or Done above the keyboard does it.
            try:
                walk.tap_first("Close the keyboard", timeout=3, selectors=screens["keyboard_done"])
            except StepFailed:
                pass
            time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))
        pressed = walk.final_first("Press %s" % ("Share" if app == "instagram" else "Post"), selectors=screens["share"])
    except Cancelled:
        raise
    except Exception:
        if not walk.rehearse:
            leave_app_screen(serial, walk, app)
        raise
    finally:
        if walk.rehearse:
            leave_app_screen(serial, walk, app)
    if not pressed:
        walk.home()
        return {"postUrl": ""}
    return wait_for_post(serial, walk, app, screens)


def action_app_post(app):
    def action(serial, args, walk):
        """Posts one photo or video with its caption, once.

        The file is downloaded from Promo's own address, put in the phone's
        camera folder and handed to the app's own share screen, as sharing
        from the gallery does. Next until the caption box shows, the caption
        typed with a person's rhythm, a pause, and Share or Post pressed once.
        It counts as posted when the app says so within three minutes. Then
        the link is read off the newest post, and a little feed. Nothing after
        the press can fail the post: it is up by then and never sent twice.

        In a rehearsal a plain picture walks the same screens up to the last
        button, which is found and not pressed, then the draft is discarded
        and the picture deleted.

        On an iPhone the file comes through Safari and the app's own picker
        (ios_app_post); on Android nothing changes.
        """
        if is_iphone(serial):
            return ios_app_post(serial, args, walk, app)
        screens = app_screens(serial, app)
        caption = str(args.get("caption") or "")
        device = walk.screen()
        device.screen_on()
        if walk.rehearse:
            data, extension = rehearsal_picture()
        else:
            data, extension = download_media(str(args.get("mediaUrl") or ""))
        remote = put_in_gallery(serial, data, extension)
        walk.shot("Put the file in the gallery")
        try:
            share_into(serial, app, media_uri(serial, remote, extension), extension)
            walk.shot("Opened %s's share screen" % APP_NAMES[app])
            if signed_out(device.dump_hierarchy(), app):
                raise RuntimeError("post: the app is not signed in to %s" % APP_NAMES[app])
            if screens["share_to"]:
                try:
                    walk.tap_first("Pick the feed", timeout=4, selectors=screens["share_to"])
                except StepFailed:
                    pass  # Straight to the editor on this version.
            tap_next_until(walk, "Press Next", screens["next"], screens["caption"])
            walk.tap_first("Open the caption box", selectors=screens["caption"])
            if not walk.rehearse and caption:
                gaps = type_like_a_person(serial, device, caption, walk.check)
                walk.shot("Typed the caption")
                log("caption typed: %d characters, gaps %.2f to %.2f seconds" % (len(caption), min(gaps or [0]), max(gaps or [0])))
                go_back(serial)  # The keyboard down, so Share is on screen.
                time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))
            pressed = walk.final_first("Press %s" % ("Share" if app == "instagram" else "Post"), selectors=screens["share"])
        except Cancelled:
            raise
        except Exception:
            # Stopped before the last button: the draft is discarded so the
            # phone is not left on it, and nothing was posted.
            if not walk.rehearse:
                leave_app_screen(serial, walk, app)
            raise
        finally:
            if walk.rehearse:
                leave_app_screen(serial, walk, app)
                quietly(serial, "rm -f '%s'" % remote)
                quietly(serial, "am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d 'file://%s'" % remote)
        if not pressed:
            walk.home()
            return {"postUrl": ""}
        return wait_for_post(serial, walk, app, screens)
    return action


def clear_and_type(serial, walk, element, text):
    """Empties a text box and types into it with a person's rhythm."""
    walk.press(element)
    time.sleep(0.6)
    try:
        element.clear_text()
    except Exception:  # A fake screen, or a box that clears on its own.
        pass
    if text:
        type_like_a_person(serial, walk.screen(), text, walk.check)


def action_app_profile(app):
    def action(serial, args, walk):
        """Changes the fields given in the app's Edit profile: the name, the
        bio, the link and the picture, each saved on its own screen with one
        press. The bio is read back off the profile afterwards. A rehearsal
        opens Edit profile and the bio's screen, finds its box and its Save,
        and backs out without pressing it."""
        screens = app_screens(serial, app)
        device = walk.screen()
        device.screen_on()
        reading = read_app_profile(serial, walk, app)
        if not reading["handle"]:
            raise RuntimeError("profile: the app is not signed in to %s" % APP_NAMES[app])
        walk.tap_first("Open Edit profile", selectors=screens["edit_profile"])
        time.sleep(2)
        applied = []
        fields = [(key, args.get(key)) for key in ("displayName", "bio", "link")]
        if walk.rehearse:
            fields = [("bio", "")]
        for key, value in fields:
            if value is None:
                continue
            walk.check()
            walk.tap_first("Open the %s" % key, selectors=screens["rows"][key])
            time.sleep(1.5)
            if key == "link" and not walk.rehearse:
                try:
                    walk.tap_first("Add an external link", timeout=3, selectors=screens["link_add"])
                    time.sleep(1)
                except StepFailed:
                    pass
            box = walk.find_first("Find the %s box" % key, selectors=screens["field"])
            if not walk.rehearse:
                clear_and_type(serial, walk, box, str(value))
                walk.shot("Typed the %s" % key)
            if walk.final_first("Save the %s" % key, selectors=screens["save"]):
                applied.append(key)
                time.sleep(2)
            else:
                leave_app_screen(serial, walk, app, times=2)
                walk.home()
                return {"applied": [], "bioAfter": None}
        picture = str(args.get("pictureUrl") or "")
        if picture and not walk.rehearse:
            if is_iphone(serial):
                # Into Photos through Safari, then back to Edit profile.
                save_from_safari(serial, walk, picture)
                open_app(serial, app)
                walk.tap_first("Open the profile", selectors=screens["profile_tab"])
                time.sleep(2)
                walk.tap_first("Open Edit profile", selectors=screens["edit_profile"])
                time.sleep(2)
            else:
                data, extension = download_media(picture)
                put_in_gallery(serial, data, extension)
            walk.tap_first("Change the picture", selectors=screens["picture_row"])
            time.sleep(1.5)
            walk.tap_first("Choose from the gallery", selectors=screens["picture_library"])
            time.sleep(2)
            # The newest picture in the gallery is the one just put there.
            walk.tap_first("Pick the newest picture", selectors=screens["gallery_first"])
            time.sleep(1.5)
            # Instagram crops the picture first, behind Next; only Save or Done keeps it.
            tap_next_until(walk, "Crop the picture", screens["next"], screens["save"])
            if walk.final_first("Save the picture", selectors=screens["save"]):
                applied.append("picture")
                time.sleep(4)
        go_back(serial)
        time.sleep(2)
        bio_after = None
        if "bio" in applied:
            lines = screen_lines(device.dump_hierarchy(), screens["package"])
            wanted = " ".join(str(args.get("bio") or "").split())
            bio_after = wanted if wanted in lines else None
            walk.shot("Read the profile afterwards")
        walk.home()
        return {"applied": applied, "bioAfter": bio_after}
    return action


# ---------------------------------------------------------------------------
# Messages and comments. The rack reads each phone's notifications once a
# minute without opening an app, and tells Promo which app had a message or
# a comment, never its words. Promo then sends an inbox action, which taps
# that notification the way a person answers the buzz (Tyler, 16 Oct 2026:
# "if it goes straight to the DM wouldnt that be suspicious?"), reads the
# conversation or the comments, and spends a little time in the feed.

ALERT_KEEP = 500


def parse_app_notifications(output):
    """The notifications of the three apps in `dumpsys notification --noredact`:
    (app, key, channel and category, title, text)."""
    packages = dict((package, app) for app, package in APP_PACKAGES.items())
    found = []
    current = None
    for line in output.splitlines():
        stripped = line.strip()
        if stripped.startswith("NotificationRecord("):
            package = re.search(r"pkg=(\S+)", stripped)
            app = packages.get(package.group(1)) if package else None
            key = re.search(r"key=(\S+?):", stripped)
            meta = " ".join(re.findall(r"(?:channel|category|tag)=(\S+)", stripped))
            current = {"app": app, "key": key.group(1) if key else stripped[:80], "meta": meta, "title": "", "text": ""} if app else None
            if current:
                found.append(current)
        elif current and stripped.startswith("android.title="):
            current["title"] = re.sub(r"^android\.title=\w+ \((.*)\)$", r"\1", stripped)
        elif current and stripped.startswith("android.text="):
            current["text"] = re.sub(r"^android\.text=\w+ \((.*)\)$", r"\1", stripped)
    return found


COMMENT_ALERT = re.compile(r"\b(commented|replied to your comment|mentioned you in a comment)\b")
MESSAGE_ALERT = re.compile(r"\b(sent you a (message|chat|photo|video|reel|post)|messaged you|new message|new chat|wants to send you a message)\b")


def alert_kind(item):
    """"message", "comment" or None for one app notification. Reddit's comment
    replies are left to the reader browser, so Reddit only counts its chats
    and messages. Likes and follows are nothing."""
    words = plain("%s %s" % (item["title"], item["text"]))
    meta = plain(item["meta"])
    if item["app"] in ("instagram", "tiktok") and COMMENT_ALERT.search(words):
        return "comment"
    if MESSAGE_ALERT.search(words) or re.search(r"(direct|message|chat|\bmsg\b|\bim\b)", meta):
        return "message"
    return None


def new_alerts(output, seen):
    """The alerts not reported before: one per app and kind, each notification
    remembered by its key and words so it is reported once."""
    alerts = []
    for item in parse_app_notifications(output):
        kind = alert_kind(item)
        if not kind:
            continue
        mark = hashlib.sha256(("%s|%s|%s" % (item["key"], item["title"], item["text"])).encode("utf-8")).hexdigest()
        if mark in seen:
            continue
        seen[mark] = True
        alert = {"app": item["app"], "kind": kind}
        if alert not in alerts:
            alerts.append(alert)
    while len(seen) > ALERT_KEEP:
        seen.popitem(last=False)  # The oldest goes first.
    return alerts


_ALERTS = {}
_ALERTS_LOCK = threading.Lock()


def keep_alerts(serial, alerts):
    with _ALERTS_LOCK:
        waiting = _ALERTS.setdefault(serial, [])
        for alert in alerts:
            if alert not in waiting:
                waiting.append(alert)


def take_alerts(serial):
    with _ALERTS_LOCK:
        return _ALERTS.pop(serial, [])


def conversation_from_screen(hierarchy_xml, app, height=2400, width=1080):
    """One conversation as its screen shows it: its name from the top bar, and
    its lines, the account's own on the right."""
    packages = app_packages(app)
    root = ElementTree.fromstring(hierarchy_xml)
    thread = ""
    lines = []
    for node in root.iter("node"):
        if not own_node(node, packages):
            continue
        words = node_words(node)
        bounds = parse_bounds(node.get("bounds"))
        if not words or not bounds:
            continue
        middle_y = (bounds[1] + bounds[3]) / 2
        if middle_y < height * 0.12:
            if not thread and 1 <= len(words) <= 60 and plain(words) not in ("back", "call", "video call", "info", "audio call"):
                thread = words
            continue
        if middle_y > height * 0.9 or NOT_A_LINE.match(words) or is_text_box(node) or not_a_line(node, height):
            continue
        if node.get("text") is None or not (node.get("text") or "").strip():
            continue
        mine = (bounds[0] + bounds[2]) / 2 > width * 0.55
        lines.append({"from": "" if mine else thread, "text": words, "mine": mine})
    return {"thread": thread, "lines": lines}


AUTHOR_TEXT = re.compile(r"^([A-Za-z0-9._]{2,30})\s+(.+)$")


def comments_from_screen(hierarchy_xml, app, handle, height=2400):
    """The comments on a post's comments screen, by author, leaving out the
    account's own. The first line by the account is the caption, which says
    which post it is."""
    packages = app_packages(app)
    lines = []
    root = ElementTree.fromstring(hierarchy_xml)
    for node in root.iter("node"):
        if not own_node(node, packages):
            continue
        bounds = parse_bounds(node.get("bounds"))
        words = (node.get("text") or "").strip()
        if not words or not bounds or not (height * 0.1 < (bounds[1] + bounds[3]) / 2 < height * 0.9):
            continue
        if NOT_A_LINE.match(words) or plain(words) in ("reply", "see translation", "view replies", "hide replies") or not_a_line(node, height):
            continue
        lines.append(" ".join(words.split()))
    thread = ""
    comments = []
    index = 0
    own = (handle or "").lower()
    while index < len(lines):
        line = lines[index]
        author, text = None, None
        joined = AUTHOR_TEXT.match(line)
        if PLAIN_HANDLE.match(line) and index + 1 < len(lines) and not PLAIN_HANDLE.match(lines[index + 1]):
            author, text = line, lines[index + 1]
            index += 2
        elif joined:
            author, text = joined.group(1), joined.group(2)
            index += 1
        else:
            index += 1
            continue
        if author.lower() == own:
            if not thread:
                thread = text[:120]
            continue
        comments.append({"author": author, "text": text})
    return [dict(comment, thread=thread) for comment in comments]


NOT_A_MESSAGE = re.compile(r"\b(liked|follow|following|tagged you|went live|posted)\b")


def notification_for(hierarchy_xml, app, kind):
    """Where the shade shows the app's newest notification of this kind, or None.
    Each line belongs to the app named above it. A comment needs its words; a
    message is one that says so, or failing that the app's first line that is
    no comment, like or follow, since a direct message shows only its words."""
    name = plain(APP_NAMES[app])
    names = set(plain(other) for other in APP_NAMES.values())
    under = None
    fallback = None
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        words = plain(" ".join((node.get("text") or "").split()))
        bounds = parse_bounds(node.get("bounds"))
        if not words or not bounds:
            continue
        if words in names:
            under = words
            continue
        if under != name:
            continue
        if kind == "comment":
            if COMMENT_ALERT.search(words):
                return bounds
        elif MESSAGE_ALERT.search(words):
            return bounds
        elif fallback is None and not COMMENT_ALERT.search(words) and not NOT_A_MESSAGE.search(words):
            fallback = bounds
    return fallback if kind == "message" else None


def open_newest_notification(walk, app, kind):
    """Pulls the notification shade down and taps the app's newest notification
    of this kind. False when none is there."""
    device = walk.screen()
    try:
        device.open_notification()
    except Exception:  # A fake screen; the inbox is opened instead.
        return False
    time.sleep(1.5)
    bounds = notification_for(device.dump_hierarchy(), app, kind)
    if not bounds:
        go_back(walk.serial)
        return False
    walk.shot("Opened the notifications")
    press_bounds(walk, bounds)
    time.sleep(3)
    return True


def press_bounds(walk, bounds):
    """Presses a place read off the screen the way walk.press presses an element."""
    time.sleep(random.uniform(*LOOK_BEFORE_TAP_SECONDS))
    walk.check()
    x, y = tap_point(bounds)
    tap_at(walk.serial, walk.screen(), x, y)


def landed_on(device, selectors):
    """True when one of these shapes shows now: the notification led where it should."""
    return any(device(**selector).exists for selector in selectors)


def open_inbox(serial, walk, app):
    open_app(serial, app)
    if app == "reddit":
        walk.tap_first("Open the chats", selectors=app_screens(serial, "reddit")["chat"])
    else:
        walk.tap_first("Open the inbox", selectors=app_screens(serial, app)["inbox"])
    time.sleep(2)


REDDIT_CHAT = shapes(REDDIT, "(?i)^(chat|chats|inbox|messages)$")
REDDIT_MESSAGE_BOX = shapes(REDDIT, "(?i)^(message|send a message)( ?(…|\\.\\.\\.))?$") + field_in(REDDIT)
REDDIT_SEND = shapes(REDDIT, "(?i)^send$")

# Reddit's own buttons join APP_SCREENS so app_screens picks them by the
# phone's kind too: the Android app's by name, the iPhone app's by bundle id.
APP_SCREENS["reddit"] = {
    "package": REDDIT,
    "avatar": REDDIT_AVATAR,
    "profile_entry": REDDIT_PROFILE_ENTRY,
    "comment_box": REDDIT_COMMENT_BOX,
    "post_button": REDDIT_POST_BUTTON,
    "discard": REDDIT_DISCARD,
    "chat": REDDIT_CHAT,
    "message_box": REDDIT_MESSAGE_BOX,
    "send": REDDIT_SEND,
    "field": field_in(REDDIT),
}
APP_SCREENS[IOS_REDDIT] = {
    "package": IOS_REDDIT,
    "avatar": shapes(IOS_REDDIT, "(?i)^(open profile menu|profile menu|profile|account|user account|your profile|avatar|.*avatar.*)$")
    + [{"resourceIdMatches": "(?i).*(avatar|profile.?menu|user.?icon).*", "packageName": IOS_REDDIT}],
    "profile_entry": shapes(IOS_REDDIT, "(?i)^(profile|my profile|view profile)$"),
    "comment_box": shapes(IOS_REDDIT, "(?i)^(add a comment|join the conversation|add a reply)( ?(…|\\.\\.\\.))?$"),
    "post_button": shapes(IOS_REDDIT, "(?i)^(post|reply|comment)$"),
    "discard": [{"textMatches": "(?i)^(discard|discard comment|leave)$"}],
    "chat": shapes(IOS_REDDIT, "(?i)^(chat|chats|inbox|messages)$"),
    "message_box": shapes(IOS_REDDIT, "(?i)^(message|send a message)( ?(…|\\.\\.\\.))?$") + ios_field_in(IOS_REDDIT),
    "send": shapes(IOS_REDDIT, "(?i)^send$"),
    "field": ios_field_in(IOS_REDDIT),
}


def screens_for(app, serial=""):
    """The buttons an app's messages use on this phone; Reddit's chats have their own."""
    screens = app_screens(serial, app)
    if app == "reddit":
        return {"message_box": screens["message_box"], "send": screens["send"], "package": screens["package"]}
    return screens


def first_conversation(walk, app):
    """Opens the inbox's first conversation. False when the inbox is empty."""
    device = walk.screen()
    width, height = screen_size(device)
    root = ElementTree.fromstring(device.dump_hierarchy())
    package = package_for(walk.serial, app)
    for node in root.iter("node"):
        bounds = parse_bounds(node.get("bounds"))
        if not own_node(node, package) or not bounds or not is_row(node):
            continue
        if height * 0.18 < (bounds[1] + bounds[3]) / 2 < height * 0.85 and bounds[2] - bounds[0] > width * 0.7:
            x, y = tap_point(bounds)
            walk.check()
            tap_at(walk.serial, device, x, y)
            time.sleep(2)
            return True
    return False


def action_app_inbox(app):
    def action(serial, args, walk):
        """Reads what arrived. With `via` "notification" it taps the app's
        newest notification first; otherwise, or when there is none, it opens
        the app's inbox and the first conversation. Comments are read off the
        post the notification opens. A minute or so of feed afterwards.
        Nothing is pressed but the way in and Back."""
        kind = "comment" if args.get("kind") == "comment" else "message"
        device = walk.screen()
        device.screen_on()
        width, height = screen_size(device)
        # Promo names the account, so its own lines (the caption) are told apart.
        handle = str(args.get("handle") or "")
        reached = False
        if args.get("via") != "inbox" and not walk.rehearse:
            reached = open_newest_notification(walk, app, kind)
            # A notification that led somewhere else is left, and the way in
            # is the inbox or the activity, as with no notification at all.
            box = screens_for(app, serial)["message_box"] if kind == "message" else app_screens(serial, app)["comment_box"]
            if reached and not landed_on(device, box):
                go_back(serial)
                reached = False
        result = {"conversations": [], "comments": []}
        if kind == "comment":
            if not reached:
                open_app(serial, app)
                walk.tap_first("Open the activity", selectors=app_screens(serial, app)["activity"])
                time.sleep(2)
                walk.shot("Opened the activity")
                walk.home()
                return result
            result["comments"] = comments_from_screen(device.dump_hierarchy(), app, handle, height)
            walk.shot("Read the comments")
        else:
            if not reached:
                open_inbox(serial, walk, app)
                walk.shot("Opened the inbox")
                if walk.rehearse or not first_conversation(walk, app):
                    walk.home()
                    return result
            conversation = conversation_from_screen(device.dump_hierarchy(), app, height, width)
            walk.shot("Read the conversation")
            if conversation["thread"] and conversation["lines"]:
                result["conversations"].append(conversation)
        try:
            go_back(serial)
            time.sleep(1.5)
            if app != "reddit":
                browse_app_feed(serial, walk, random.uniform(*APP_READ_FEED_SECONDS))
            else:
                browse_feed(serial, walk, random.uniform(*APP_READ_FEED_SECONDS), 0, new_visit(), time.monotonic() + 120)
        except Exception as failure:  # The reading stands either way.
            log("The feed after reading %s on %s: %s" % (APP_NAMES[app], serial, short_words(failure)))
        walk.home()
        return result
    return action


def find_line(device, package, words):
    """An element on screen whose own words hold `words`, or None."""
    wanted = " ".join((words or "").split())[:60]
    if not wanted:
        return None
    element = device(textContains=wanted, packageName=package)
    return element if element.exists else None


def rows_named(hierarchy_xml, package, name):
    """Where the screen shows exactly this name, in the app's own views. An
    inbox row is told apart by its whole name, so "sam" never opens "samantha"
    or a chat whose last line reads "ask sam"."""
    wanted = plain(" ".join((name or "").split()))
    found = []
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        if not own_node(node, package):
            continue
        bounds = parse_bounds(node.get("bounds"))
        if bounds and wanted and plain(" ".join((node.get("text") or "").split())) == wanted:
            found.append(bounds)
    return found


def reply_under(hierarchy_xml, package, words, height):
    """Where the Reply of the comment holding `words` is: the first Reply below
    the comment's own words, close under them. None when the comment or its
    Reply is not on screen."""
    wanted = " ".join((words or "").split())[:60]
    comment = None
    replies = []
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        if not own_node(node, package):
            continue
        bounds = parse_bounds(node.get("bounds"))
        text = " ".join((node.get("text") or "").split())
        if not bounds or not text:
            continue
        if comment is None and wanted and wanted in text:
            comment = bounds
        elif plain(text) == "reply":
            replies.append(bounds)
    if comment is None:
        return None
    below = [bounds for bounds in replies if comment[3] - 5 <= bounds[1] <= comment[3] + height * 0.12]
    return min(below, key=lambda bounds: bounds[1]) if below else None


def times_shown(hierarchy_xml, package, text):
    """How many of the app's views show the words, the text box left out: words
    still sitting unsent in the box are not an answer that went out, and the
    same words said earlier in the chat each count once."""
    wanted = " ".join(text.split())[:60]
    if not wanted:
        return 0
    count = 0
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        if not own_node(node, package) or is_text_box(node):
            continue
        if any(wanted in " ".join((node.get(key) or "").split()) for key in ("text", "content-desc")):
            count += 1
    return count


def action_app_reply(app):
    def action(serial, args, walk):
        """Answers one conversation or one comment, once. A conversation is
        found by its name in the inbox; a comment through the app's activity,
        by its author and words, then its Reply. The words are typed with a
        person's rhythm and Send or Post pressed once; it counts as sent when
        the words show on screen within 20 seconds. A rehearsal opens the
        inbox and its first conversation, if any, finds the box and Send,
        and presses neither."""
        kind = "comment" if args.get("kind") == "comment" else "message"
        text = str(args.get("text") or "")
        thread = str(args.get("thread") or "")
        author = str(args.get("author") or "")
        quote = str(args.get("quote") or "")
        screens = screens_for(app, serial)
        package = package_for(serial, app)
        device = walk.screen()
        device.screen_on()
        if not walk.rehearse and not text:
            raise RuntimeError("reply: no words to send")

        if kind == "message":
            open_inbox(serial, walk, app)
            if walk.rehearse:
                if not first_conversation(walk, app):
                    walk.home()
                    return {"sent": False}
            else:
                rows = rows_named(device.dump_hierarchy(), package, thread)
                if len(rows) != 1:
                    walk.shot("Looked for the conversation")
                    raise StepFailed(
                        "Find the conversation",
                        "The conversation was not in the inbox." if not rows
                        else "Two conversations in the inbox have the same name, so neither was answered.",
                    )
                press_bounds(walk, rows[0])
                time.sleep(2)
            walk.shot("Opened the conversation")
            box = walk.find_first("Find the message box", selectors=screens["message_box"])
            send = screens["send"]
        else:
            open_app(serial, app)
            walk.tap_first("Open the activity", selectors=app_screens(serial, app)["activity"])
            time.sleep(2)
            if walk.rehearse:
                walk.shot("Opened the activity")
                walk.home()
                return {"sent": False}
            row = find_line(device, package, author)
            if row is None:
                raise StepFailed("Find the comment", "No comment by %s was in the activity." % author)
            walk.press(row)
            time.sleep(3)
            # The Reply under this comment's own words, never the first on screen.
            _, height = screen_size(device)
            reply = reply_under(device.dump_hierarchy(), package, quote, height)
            if reply is None:
                walk.shot("Looked for the comment")
                raise StepFailed("Find the comment", "The comment by %s, with its Reply, was not on the post's screen." % author)
            press_bounds(walk, reply)
            time.sleep(1.5)
            box = walk.find_first("Find the reply box", selectors=app_screens(serial, app)["comment_box"])
            send = app_screens(serial, app)["comment_send"]

        before = 0
        if not walk.rehearse:
            before = times_shown(device.dump_hierarchy(), package, text)
            walk.press(box)
            gaps = type_like_a_person(serial, device, text, walk.check)
            walk.shot("Typed the answer")
            log("answer typed: %d characters, gaps %.2f to %.2f seconds" % (len(text), min(gaps or [0]), max(gaps or [0])))
            time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))
        pressed = walk.final_first("Press Send", selectors=send)
        if not pressed:
            leave_app_screen(serial, walk, app, times=2)
            walk.home()
            return {"sent": False}
        sent = False
        waiting_until = time.time() + POST_LANDED_SECONDS
        while time.time() < waiting_until:
            time.sleep(1)
            try:
                if times_shown(device.dump_hierarchy(), package, text) > before:
                    sent = True
                    break
            except Exception:  # A screen caught mid-change; look again.
                continue
        walk.shot("Looked for the answer")
        if not sent:
            raise RuntimeError("reply: pressed Send but the words did not show within %d seconds. Check the app before sending again." % POST_LANDED_SECONDS)
        try:
            go_back(serial)
            time.sleep(1)
            if app != "reddit":
                browse_app_feed(serial, walk, random.uniform(*APP_FEED_AFTER_SECONDS))
        except Exception as failure:  # The answer is out either way.
            log("The feed after answering on %s: %s" % (serial, short_words(failure)))
        walk.home()
        return {"sent": True}
    return action


# The actions the daily self-test walks, with the arguments a rehearsal uses.
# The app actions join this list as they are written. The wipe never does:
# a rehearsal cannot press its last button, but nothing about a wipe is
# worth the risk. The comment's post is sent by Promo, a recent one found.
REHEARSALS = {
    "phone/android-version": {},
    # Read-only on an iPhone; on an Android it says so and stops.
    "phone/icloud-state": {},
    "reddit/state": {},
    "reddit/health": {},
    "reddit/comment": {"permalink": "", "text": "", "subreddit": ""},
    "reddit/inbox": {"kind": "message", "via": "inbox"},
    "reddit/reply_message": {"kind": "message", "thread": "", "author": "", "quote": "", "text": ""},
}
# Instagram's and TikTok's steps (phone farm file 06). The post walks a plain
# picture the rack makes, up to Share or Post; the profile walks the bio's box
# up to Save; neither presses its last button.
for _app in ("instagram", "tiktok"):
    REHEARSALS.update({
        "%s/health" % _app: {"postUrls": []},
        "%s/profile" % _app: {},
        "%s/post" % _app: {"mediaUrl": "", "mediaKind": "photo", "caption": ""},
        "%s/inbox" % _app: {"kind": "message", "via": "inbox", "handle": ""},
        "%s/reply" % _app: {"kind": "message", "thread": "", "author": "", "quote": "", "text": ""},
    })


def rehearsal_args(rehearsals, overrides):
    """Each rehearsal's arguments, with Promo's own for the ones it names.
    An action Promo names that is not rehearsed is left out."""
    merged = dict((name, dict(args)) for name, args in rehearsals.items())
    for name, args in (overrides or {}).items():
        if name in merged and isinstance(args, dict):
            merged[name].update(args)
    return merged


def action_self_test(serial, args, walk, rehearsals=None):
    """Walks every action in REHEARSALS up to just before its last button.

    A rehearsal that cannot find a step is that action broken. The pictures
    of a broken one are all kept, so the step it stopped at can be seen;
    a passed one keeps only its last. Promo may send arguments for some, as
    {"rehearsals": {name: args}}, such as a post to rehearse a comment on.
    """
    rehearsals = rehearsal_args(rehearsals or REHEARSALS, (args or {}).get("rehearsals"))
    lines = []
    for name in sorted(rehearsals):
        walk.check()
        rehearsal = Walk(serial, rehearse=True, cancelled=walk.cancelled, connect=walk.connect)
        rehearsal.device = walk.device
        try:
            ACTIONS[name](serial, dict(rehearsals[name]), rehearsal)
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


def medium_state(serial, args, walk):
    """Who the Medium app is signed in as, and its followers, off its own
    profile. When Medium joined it is not shown in the app, so Promo reads it
    from the account's public page in the reader browser instead."""
    try:
        walk.screen().screen_on()
        reading = read_app_profile(serial, walk, "medium")
        walk.home()
    except Cancelled:
        raise
    except Exception as failure:  # Not checked rather than signed out.
        log("Could not read who is signed in to Medium on %s: %s" % (serial, failure))
        return {"checked": False, "handle": None, "blocked": False, "reason": "", "joinedSeconds": None, "followers": None}
    return {"checked": True, "handle": reading["handle"], "blocked": False, "reason": "", "joinedSeconds": None, "followers": reading["followers"]}


MEDIUM_STORY_ID = re.compile(r"^[0-9a-f]{8,16}$")


def action_medium_respond(serial, args, walk):
    """Writes one response under a story in the Medium app, inside a visit.

    Before: a little of the app's home feed. Then the story by its link, read
    for a while, the responses button, the box, the words typed with a
    person's rhythm, and Respond pressed once. It counts as sent when the
    words show on screen. Medium's id for the response is not shown in the
    app, so it is "" here and Promo finds it from the reader browser, by the
    account's name and the opening words. A highlighted line is a browser
    step and is refused before anything opens.

    In a rehearsal nothing is typed: the story opens, the box opens, Respond
    is found and not pressed, and the screen is left. With no story sent, a
    rehearsal only opens the app.
    """
    story_id = str(args.get("storyId") or "").strip()
    text = str(args.get("text") or "").strip()
    if str(args.get("line") or "").strip():
        raise RuntimeError("respond: answering one highlighted line is done in a browser, not the Medium app")
    if story_id and not MEDIUM_STORY_ID.match(story_id):
        raise RuntimeError("respond: that is not a Medium story id")
    if not walk.rehearse and (not story_id or not text):
        raise RuntimeError("respond: a response needs its story and its words")
    device = walk.screen()
    device.screen_on()
    screens = app_screens(serial, "medium")
    package = package_for(serial, "medium")
    visit = new_visit()

    if not walk.rehearse:
        started = time.monotonic()
        try:
            open_app(serial, "medium")
            walk.shot("Opened Medium")
            browse_app_feed(serial, walk, random.uniform(*APP_READ_FEED_SECONDS))
        except Cancelled:
            raise
        except Exception as failure:  # The response still goes.
            visit["problems"].append("the feed before: %s" % short_words(failure))
        visit["beforeSeconds"] = int(time.monotonic() - started)

    if not story_id:
        open_app(serial, "medium")
        walk.shot("Opened Medium")
        walk.home()
        return {"responseId": "", "responseUrl": ""}

    walk.check()
    open_link(serial, "medium", "https://medium.com/p/%s" % story_id)
    walk.shot("Opened the story")
    if not walk.rehearse:
        read_post(serial, walk, len(" ".join(screen_lines(device.dump_hierarchy(), app_packages("medium")))), visit)
    walk.tap_first("Open the responses", selectors=screens["responses"])
    time.sleep(2)
    box = walk.find_first("Find the response box", selectors=screens["response_box"])
    before = 0
    if not walk.rehearse:
        before = times_shown(device.dump_hierarchy(), package, text)
        walk.press(box)
        gaps = type_like_a_person(serial, device, text, walk.check)
        walk.shot("Typed the response")
        log("medium response typed: %d characters, gaps %.2f to %.2f seconds" % (len(text), min(gaps or [0]), max(gaps or [0])))
        time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))
    pressed = walk.final_first("Press Respond", selectors=screens["respond"])
    if not pressed:
        leave_app_screen(serial, walk, "medium", times=3)
        walk.home()
        return {"responseId": "", "responseUrl": ""}
    waiting_until = time.time() + POST_LANDED_SECONDS
    shown = False
    while time.time() < waiting_until:
        time.sleep(1)
        try:
            if times_shown(device.dump_hierarchy(), package, text) > before:
                shown = True
                break
        except Exception:  # A screen caught mid-change; look again.
            continue
    walk.shot("Looked for the response")
    if not shown:
        raise RuntimeError("respond: Respond was pressed but the words did not show within %d seconds. It may already be on Medium; look before sending again." % POST_LANDED_SECONDS)
    try:
        browse_app_feed(serial, walk, random.uniform(*APP_FEED_AFTER_SECONDS))
    except Cancelled:
        raise
    except Exception as failure:  # It is on Medium already.
        visit["problems"].append("the feed after: %s" % short_words(failure))
    walk.home()
    return {"responseId": "", "responseUrl": "", "visit": visit}


def action_medium_warm_up(serial, args, walk):
    """A warming account's day in the Medium app: its home feed read for a few
    minutes. Nothing is written, clapped, highlighted or followed from a phone."""
    walk.screen().screen_on()
    open_app(serial, "medium")
    walk.shot("Opened Medium")
    if walk.rehearse:
        walk.home()
        return {"storiesRead": 0, "followed": [], "problems": []}
    browse_app_feed(serial, walk, random.uniform(150, 360))
    walk.home()
    return {"storiesRead": 0, "followed": [], "problems": []}


REHEARSALS.update({
    "medium/state": {},
    "medium/respond": {"storyId": "", "text": "", "line": "", "tags": []},
})


ACTIONS = {
    "phone/list": action_list,
    "phone/health": action_health,
    "phone/android-version": action_android_version,
    "phone/self-test": action_self_test,
    "phone/check-updates": action_check_updates,
    "phone/update-app": action_update_app,
    "phone/setup-check": action_setup_check,
    "phone/outside-address": action_outside_address,
    "phone/icloud-state": action_icloud_state,
    "phone/wipe": action_wipe,
    "reddit/state": action_reddit_state,
    "reddit/quick_state": action_reddit_quick_state,
    "reddit/health": action_reddit_health,
    "reddit/comment": action_reddit_comment,
    "reddit/inbox": action_app_inbox("reddit"),
    "reddit/reply_message": action_app_reply("reddit"),
}
ACTIONS.update({
    "medium/state": medium_state,
    "medium/quick_state": medium_state,
    "medium/respond": action_medium_respond,
    "medium/warm_up": action_medium_warm_up,
})
for _app in ("instagram", "tiktok"):
    ACTIONS.update({
        "%s/quick_state" % _app: action_app_quick_state(_app),
        "%s/health" % _app: action_app_health(_app),
        "%s/profile" % _app: action_app_profile(_app),
        "%s/post" % _app: action_app_post(_app),
        "%s/inbox" % _app: action_app_inbox(_app),
        "%s/reply" % _app: action_app_reply(_app),
    })


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
    ("medium", "suspended", [
        "your account has been suspended",
        "this account is under investigation or was found in violation of the medium rules",
    ]),
    ("medium", "confirm", ["verify it's you", "confirm it's you"]),
]

# A ban screen is a page of a few lines. A feed has many more.
BAN_SCREEN_MAX_LINES = 30


def screen_lines(hierarchy_xml, package=None):
    """The text on screen, in order, from the given app's own views only."""
    lines = []
    for node in ElementTree.fromstring(hierarchy_xml).iter("node"):
        if not own_node(node, package):
            continue
        # text and content-desc are Android's; label an iPhone's. An iPhone
        # node's value is what someone typed into a text box; on a switch it
        # is "1" or "0", which is no line anyone reads.
        keys = ("text", "content-desc", "label", "value") if is_text_box(node) else ("text", "content-desc", "label")
        for key in keys:
            text = " ".join((node.get(key) or "").split())
            if text and text not in lines:
                lines.append(text)
    return lines


def plain(text):
    """Lower case, with the curly apostrophe and iOS's non-breaking hyphen (as in its "Wi-Fi") made plain."""
    return text.lower().replace(u"’", "'").replace(u"\u2011", "-").replace(u"\u2010", "-")


def ban_screen_in(hierarchy_xml, app, package=None):
    """The ban screen showing, as {app, kind, words}, or None."""
    lines = screen_lines(hierarchy_xml, package or APP_PACKAGES.get(app))
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
        return ban_screen_in(connect_screen(serial).dump_hierarchy(), app, package_for(serial, app))
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
    "phone/setup-check": PLAY_STORE,
    "phone/wipe": "com.android.settings",
}
IOS_SCREEN_PACKAGES = {
    "phone/android-version": IOS_SETTINGS,
    "phone/check-updates": APP_STORE,
    "phone/update-app": APP_STORE,
    "phone/setup-check": IOS_SETTINGS,
    "phone/icloud-state": IOS_SETTINGS,
    "phone/wipe": IOS_SETTINGS,
}

_RESTARTED_AT = {}
_RESTART_WHY = {}
_RESTART_LOCK = threading.Lock()


def phone_answers(serial):
    """True when the phone answers right now: adb's echo on an Android, a live
    GET /status to WebDriverAgent on an iPhone. Nothing cached counts."""
    if is_iphone(serial):
        try:
            return bool(iphone_screen(serial).answers())
        except Exception:  # No driver beside the program: the phone counts as frozen.
            return False
    try:
        return shell(serial, "echo ok", timeout=10) == "ok"
    except (RuntimeError, subprocess.TimeoutExpired):
        return False


def restart_phone(serial, why):
    """Restarts a phone, at most once in half an hour, so a phone that keeps
    freezing is left for a person rather than restarted over and over.
    Returns (restarted, words): the words say why not, for Promo's answer."""
    with _RESTART_LOCK:
        if time.time() - _RESTARTED_AT.get(serial, 0) < RESTART_GAP_SECONDS:
            log("%s froze again within half an hour of a restart, so it is left for a person." % serial)
            return False, "The phone stopped answering again soon after a restart, so the rack left it for you."
        _RESTARTED_AT[serial] = time.time()
        _RESTART_WHY[serial] = why
    try:
        if is_iphone(serial):
            iphone.restart(serial)
        else:
            adb(["reboot"], serial=serial, timeout=20)
    except Exception as failure:  # adb's refusal, or the driver's.
        log("Could not restart %s: %s" % (serial, failure))
        return False, "The phone stopped answering, and the rack could not restart it (%s), so it is left for you." % short_words(failure)
    log("Restarted %s: %s" % (serial, why))
    return True, ""


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
        phone = {"serial": serial, "state": "restarting", "usb": "", "model": "", "android": ""}
        if is_iphone(serial):
            phone["kind"] = "iphone"
        phones.append(phone)
    return phones


def foreground_package(serial):
    """The app in front: Android's focused window, or on an iPhone the bundle
    WebDriverAgent names (the driver's active_app)."""
    if is_iphone(serial):
        try:
            return str(iphone_screen(serial).active_app() or "")
        except Exception:  # No answer is no app known.
            return ""
    try:
        found = re.search(r"mCurrentFocus=\S*\s+\S+\s+([A-Za-z0-9_.]+)/", shell(serial, "dumpsys window | grep mCurrentFocus", timeout=10))
    except (RuntimeError, subprocess.TimeoutExpired):
        return ""
    return found.group(1) if found else ""


def reopen_app(serial, package):
    if is_iphone(serial):
        device = iphone_screen(serial)
        device.app_stop(package)
        device.app_start(package)
        return
    shell(serial, "am force-stop %s" % package, timeout=15)
    shell(serial, "monkey -p %s -c android.intent.category.LAUNCHER 1" % package, timeout=15)


def action_package(name, serial=""):
    app = action_app(name)
    if is_iphone(serial):
        return APP_BUNDLES[app] if app else IOS_SCREEN_PACKAGES.get(name, "")
    return APP_PACKAGES[app] if app else SCREEN_PACKAGES.get(name, "")


def recover_frozen(serial, name):
    """What to do about an action that did not finish in time: (what was done, words)."""
    if not phone_answers(serial):
        restarted, why_not = restart_phone(serial, "It stopped answering during %s, so the rack restarted it." % name)
        if restarted:
            return "phone", "The phone stopped answering, so the rack restarted it. %s was not finished." % name
        return "", "%s %s was not finished." % (why_not, name)
    package = foreground_package(serial) or action_package(name, serial)
    if not package:
        return "", "%s did not finish in time." % name
    try:
        reopen_app(serial, package)
    except (RuntimeError, subprocess.TimeoutExpired) as failure:
        return "", "%s did not finish in time, and the app could not be closed: %s" % (name, failure)
    return "app", "The app stopped responding, so the rack closed it and opened it again. %s was not finished; nothing more was pressed." % name


def close_not_responding(serial, name):
    """Closes Android's "isn't responding" box if one is up, and opens the app again.
    Returns words for the answer, or empty when there was none. iOS shows no
    such box: a frozen app is simply gone, so there is nothing to close."""
    if is_iphone(serial):
        return ""
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
#
# The wall (phone farm part 57) rides on the same turns: Promo names the
# phones whose small picture it wants, and each gets one every 5 seconds,
# 270 pixels wide, marked "lane": "wall" beside the window's own frames.

SCREEN_GAP_SECONDS = 0.3
IDLE_SCREEN_GAP_SECONDS = 2
TEXT_GAP_SECONDS = 4
# An iPhone's texts are read by opening Messages on its screen, so less often.
IPHONE_TEXT_GAP_SECONDS = 6
# A texted code older than this is not shown.
TEXT_WINDOW_MS = 10 * 60 * 1000
CODE_PATTERN = re.compile(r"(?<![\d])(\d{4,8})(?![\d])")
# The wall: one small picture per phone this often, this wide, and turns
# this far apart when only the wall is open.
WALL_GAP_SECONDS = 5
WALL_WIDTH = 270
WALL_TURN_SECONDS = 1
# Promo holds a phone for 15 minutes after a tap with control on
# (src/server/phones/screens.ts). Control is read here as a tap from Promo
# within that time, which is all the reply says.
CONTROL_HOLD_SECONDS = 15 * 60
# How long after the last tap or key an iPhone's Messages is left alone, so
# a read never lands in the middle of someone typing on the phone.
TAP_QUIET_SECONDS = 20

KEYCODES = {
    "back": "KEYCODE_BACK",
    "home": "KEYCODE_HOME",
    "recents": "KEYCODE_APP_SWITCH",
    "enter": "KEYCODE_ENTER",
    "delete": "KEYCODE_DEL",
}


def screen_frame(device, wide=SCREENSHOT_WIDTH):
    """A picture of the screen, shrunk, with the phone's own size for placing taps."""
    image = device.screenshot()
    width, height = image.width, image.height
    if width > wide:
        image = image.resize((wide, round(height * wide / width)))
    buffer = io.BytesIO()
    image.convert("RGB").save(buffer, format="JPEG", quality=60)
    return buffer.getvalue(), width, height


def typed_text(text):
    """`input text`'s own spelling, quoted for the phone's shell: spaces are %s."""
    return "'%s'" % text.replace("'", "'\\''").replace(" ", "%s")


def apply_input(serial, item, size):
    width, height = size
    kind = item.get("kind")
    if is_iphone(serial):
        apply_iphone_input(iphone_screen(serial), item, size)
    elif kind == "tap":
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


def apply_iphone_input(device, item, size):
    """The window's taps on an iPhone, through the driver: the same key names,
    which it turns into the iPhone's own swipes for back and recents."""
    width, height = size
    kind = item.get("kind")
    if kind == "tap":
        device.click(round(item["x"] * width), round(item["y"] * height))
    elif kind == "swipe":
        device.swipe(
            round(item["x1"] * width), round(item["y1"] * height),
            round(item["x2"] * width), round(item["y2"] * height),
            duration=0.3,
        )
    elif kind == "text":
        device.send_keys(str(item.get("text", ""))[:500])
    elif kind == "key" and item.get("key") in KEYCODES:
        device.press(item["key"])


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


# A conversation row's time on the iPhone's Messages list: "Now" or a clock
# time today. Yesterday, a weekday or a date is older than ten minutes.
IOS_ROW_TIME = re.compile(r"(?i)^(now|(\d{1,2}):(\d{2})\s*(am|pm)?)$")


def ios_cells(hierarchy_xml):
    """The words in each cell of an iPhone list, in screen order. A cell's
    children carry them; a cell with none of its own has them joined in its
    label, "Reddit, Now, Your code is 482913"."""
    cells = []

    def visit(node):
        kind = node.get("type") or node.get("class") or ""
        if kind.endswith("Cell"):
            words = [text for text in (node_words(child) for child in node.iter() if child is not node) if text]
            if not words:
                words = [part.strip() for part in node_words(node).split(",") if part.strip()]
            if words:
                cells.append(words)
            return
        for child in node:
            visit(child)

    visit(ElementTree.fromstring(hierarchy_xml))
    return cells


def ios_row_time_ms(stamp, now_ms, local=time.localtime):
    """When a row marked "Now" or "9:41 AM" arrived, in ms. A clock time later
    than now is yesterday's."""
    found = IOS_ROW_TIME.match(stamp)
    if found.group(1).lower() == "now":
        return now_ms
    hour, minute, half = int(found.group(2)), int(found.group(3)), (found.group(4) or "").lower()
    if half == "pm" and hour < 12:
        hour += 12
    if half == "am" and hour == 12:
        hour = 0
    today = local(now_ms / 1000)
    at = int(time.mktime((today.tm_year, today.tm_mon, today.tm_mday, hour, minute, 0, 0, 0, -1)) * 1000)
    if at > now_ms + 60 * 1000:
        at -= 24 * 3600 * 1000
    return at


def messages_from_ios_screen(hierarchy_xml, now_ms, local=time.localtime):
    """The conversations on the iPhone's Messages list as (sender, preview,
    time in ms), only the rows from today, each a cell of sender, time and
    the preview lines."""
    messages = []
    for words in ios_cells(hierarchy_xml):
        at = next((index for index, text in enumerate(words) if IOS_ROW_TIME.match(text)), None)
        if at is None:
            continue
        rest = words[:at] + words[at + 1:]
        if not rest:
            continue
        messages.append((rest[0], " ".join(rest[1:]), ios_row_time_ms(words[at], now_ms, local)))
    return messages


def read_iphone_texted_code(serial):
    """Opens Messages on the iPhone, reads the newest code off its list, and
    goes home. iOS hands a computer neither the inbox nor the notifications,
    so the screen is the only way; the caller makes sure the window is
    watched with control on. Never while an action runs on the phone, since
    opening Messages would land in the middle of its steps."""
    if action_running_on(serial):
        return None
    now_ms = int(time.time() * 1000)
    device = iphone_screen(serial)
    try:
        device.app_start(IOS_MESSAGES)
        time.sleep(1.5)
        hierarchy = device.dump_hierarchy()
    finally:
        try:
            device.press("home")
        except Exception:  # The phone went away; nothing more to tidy.
            pass
    return newest_code(messages_from_ios_screen(hierarchy, now_ms), now_ms)


def read_texted_code(serial):
    """The newest code texted to the phone, from its inbox or, if Android refuses that, its notifications."""
    if is_iphone(serial):
        try:
            return read_iphone_texted_code(serial)
        except Exception as failure:  # No code read is no code shown.
            log("Could not read Messages on %s: %s" % (serial, short_words(failure)))
            return None
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
    state = {"wanted": [], "wall": [], "devices": {}, "sizes": {}, "texts_read_at": {}, "warned": set(), "wall_sent_at": {}, "control_at": {}}
    while True:
        try:
            gap = screen_turn(config, state)
        except Exception as failure:  # Anything unforeseen; the loop must outlive it.
            log("Screens stopped a turn: %s" % failure)
            gap = 10
        time.sleep(gap)


def may_read_texts(serial, control_at, now, control=None):
    """Android's inbox is read over USB whenever the window is open. An
    iPhone's Messages app has to be opened on its screen, so only while the
    watcher has control on, never under an action, and never within
    TAP_QUIET_SECONDS of a tap or key, since opening Messages and pressing
    Home would cut across whatever the person is typing. Promo's reply names
    the phones someone has control of (`control`); an older Promo that does
    not is read as a tap within the last 15 minutes."""
    if not is_iphone(serial):
        return True
    if action_running_on(serial):
        return False
    since_tap = now - control_at.get(serial, 0)
    if since_tap < TAP_QUIET_SECONDS:
        return False
    if control is not None:
        return serial in control
    return since_tap < CONTROL_HOLD_SECONDS


def take_frame(state, serial, lane, wide):
    """One picture of a phone for the frames list, or None when it gave none
    (said once in the log until it does again)."""
    devices, warned = state["devices"], state["warned"]
    try:
        device = devices.get(serial) or connect_screen(serial)
        devices[serial] = device
        jpeg, width, height = screen_frame(device, wide)
    except Exception as failure:  # A phone pulled out mid-picture; try again next turn.
        devices.pop(serial, None)
        if serial not in warned:
            log("No picture from %s: %s" % (serial, failure))
            warned.add(serial)
        return None
    warned.discard(serial)
    return {"serial": serial, "jpeg": base64.b64encode(jpeg).decode("ascii"), "width": width, "height": height, "lane": lane}


def screen_turn(config, state):
    """One turn: pictures and texted codes for the watched phones and a small
    picture for each phone on the wall, out; which phones to watch, which
    are on the wall, and the taps, back. Returns how long to wait."""
    devices, sizes, texts_read_at = state["devices"], state["sizes"], state["texts_read_at"]
    wall_sent_at = state.setdefault("wall_sent_at", {})
    control_at = state.setdefault("control_at", {})
    frames, texts = [], []
    now = time.time()
    for serial in state["wanted"]:
        frame = take_frame(state, serial, "window", SCREENSHOT_WIDTH)
        if frame:
            sizes[serial] = (frame["width"], frame["height"])
            frames.append(frame)
        gap = IPHONE_TEXT_GAP_SECONDS if is_iphone(serial) else TEXT_GAP_SECONDS
        if now - texts_read_at.get(serial, 0) > gap and may_read_texts(serial, control_at, now, state.get("control")):
            texts_read_at[serial] = time.time()
            code = read_texted_code(serial)
            if code:
                texts.append(dict(code, serial=serial))
    # The wall's pictures ride on whichever turn is due; a window's turns are never slowed for them.
    for serial in state.get("wall") or []:
        if now - wall_sent_at.get(serial, 0) < WALL_GAP_SECONDS:
            continue
        frame = take_frame(state, serial, "wall", WALL_WIDTH)
        if frame:
            wall_sent_at[serial] = now
            frames.append(frame)

    try:
        reply = call(config, "/api/rack/screen", {"frames": frames, "texts": texts})
    except (CallFailed, Refused) as failure:
        log("Screens: %s" % failure)
        return 10
    wanted = [serial for serial in reply.get("wanted") or [] if isinstance(serial, str)]
    wall = [serial for serial in reply.get("wall") or [] if isinstance(serial, str)]
    state["wanted"] = wanted
    state["wall"] = wall
    # Who has control, when Promo says; None keeps the older reading from taps.
    if "control" in reply:
        state["control"] = [serial for serial in reply.get("control") or [] if isinstance(serial, str)]
    else:
        state["control"] = None

    for serial, items in (reply.get("inputs") or {}).items():
        # Promo hands taps over only while control is on, so a tap is the
        # word that it is.
        control_at[serial] = time.time()
        if serial not in sizes:
            continue
        for item in items:
            try:
                apply_input(serial, item, sizes[serial])
            except (RuntimeError, subprocess.TimeoutExpired, KeyError, TypeError, ValueError) as failure:
                log("A tap on %s did not go through: %s" % (serial, failure))
    for serial in list(devices):
        if serial not in wanted and serial not in wall:
            devices.pop(serial, None)
    for serial in list(texts_read_at):
        if serial not in wanted:
            texts_read_at.pop(serial, None)
            control_at.pop(serial, None)
    for serial in list(wall_sent_at):
        if serial not in wall:
            wall_sent_at.pop(serial, None)
    if wanted:
        return SCREEN_GAP_SECONDS
    return WALL_TURN_SECONDS if wall else IDLE_SCREEN_GAP_SECONDS


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


def as_number(value, whole=True):
    try:
        return int(round(float(value))) if whole else float(value)
    except (TypeError, ValueError):
        return None


def vitals_from_driver(raw):
    """The driver's reading in the check-in's shape. The driver speaks the
    check-in's own key names; a few plainer ones are taken too. Signal is
    "not_reported": Apple's channel does not give it, and nothing is guessed."""
    raw = raw if isinstance(raw, dict) else {}

    def pick(*names):
        for name in names:
            if raw.get(name) is not None:
                return raw[name]
        return None

    apps = raw.get("apps")
    return {
        "batteryPercent": as_number(pick("batteryPercent", "battery")),
        "temperatureC": as_number(pick("temperatureC", "temperature"), whole=False),
        "storageUsedPercent": as_number(pick("storageUsedPercent", "storage")),
        "signal": str(raw.get("signal") or "not_reported"),
        "upSeconds": as_number(pick("upSeconds", "uptime")),
        "apps": dict((str(app), str(version)) for app, version in apps.items()) if isinstance(apps, dict) else None,
        "restartWhy": "",
    }


def iphone_vitals(serial):
    """The minute's reading of an iPhone, through the driver."""
    if iphone is None:
        raise RuntimeError("The iPhone driver (iphone.py) is not beside the program.")
    return vitals_from_driver(iphone.vitals(serial))


def iphone_app_versions(serial):
    """Each tracked app's version on an iPhone through the driver's
    app_versions(udid); None (not read) when the phone could not be asked."""
    versions = iphone.app_versions(serial)
    return dict((str(app), str(version)) for app, version in versions.items()) if isinstance(versions, dict) else None


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
    for phone in parse_devices(adb(["devices", "-l"], timeout=15)) + list_iphones_safely():
        serial = phone["serial"]
        if phone["state"] != "device" or now - state["read_at"].get(serial, 0) < VITALS_SECONDS:
            continue
        state["read_at"][serial] = now
        an_iphone = phone.get("kind") == "iphone"
        if an_iphone:
            _KINDS[serial] = "iphone"
        else:
            # The apps' notifications, read without opening an app; only which
            # app and whether it was a message or a comment go to Promo. An
            # iPhone hands a computer no notifications, so it has none here.
            try:
                keep_alerts(serial, new_alerts(shell(serial, "dumpsys notification --noredact", timeout=15), state["alerts"].setdefault(serial, collections.OrderedDict())))
            except Exception as failure:  # The vitals are still read this turn.
                log("Could not read the notifications on %s: %s" % (serial, failure))
        try:
            if an_iphone:
                reading = iphone_vitals(serial)
                if now - state["apps_at"].get(serial, 0) >= APPS_SECONDS:
                    reading["apps"] = iphone_app_versions(serial)
                    state["apps_at"][serial] = now
            else:
                reading = parse_vitals(shell(serial, VITALS_COMMAND, timeout=20))
                if now - state["apps_at"].get(serial, 0) >= APPS_SECONDS:
                    reading["apps"] = parse_app_versions(shell(serial, APPS_COMMAND, timeout=30))
                    state["apps_at"][serial] = now
        except Exception as failure:  # adb's refusal, or the driver's; three in a row is a frozen phone.
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
    state = {"read_at": {}, "apps_at": {}, "missed": {}, "alerts": {}}
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
    alerted = {}
    for phone in phones:
        reading = take_reading(phone["serial"]) if phone["state"] == "device" else None
        if reading:
            phone["vitals"] = taken[phone["serial"]] = reading
        alerts = take_alerts(phone["serial"]) if phone["state"] == "device" else []
        if alerts:
            phone["alerts"] = alerted[phone["serial"]] = alerts
    try:
        reply = call(config, "/api/rack/check-in", {
            "version": VERSION,
            "platform": platform_name(),
            "phones": phones,
            "rolledBack": note if isinstance(note, dict) else None,
            # When WebDriverAgent's signature runs out, so the bell can warn
            # the day before (part 49); null on a rack without iPhones.
            "wdaExpiresAt": wda_expires_at(),
        })
    except (CallFailed, Refused):
        # Not received, so the readings and alerts wait for the next check-in.
        for serial, reading in taken.items():
            put_back_reading(serial, reading)
        for serial, alerts in alerted.items():
            keep_alerts(serial, alerts)
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
    # The iPhone driver travels with the program, checked the same way, so
    # `import iphone` finds it beside the new version. A Promo from before
    # iPhones sends none, and the program is installed alone.
    driver = release.get("driver")
    if driver is not None:
        if not isinstance(driver, str) or sha256_hex(driver.encode("utf-8")) != release.get("driverSha256"):
            raise CallFailed("The download of %s's iPhone driver did not match its checksum." % latest)
    folder = os.path.join(HOME, "versions", latest)
    os.makedirs(folder, exist_ok=True)
    with open(os.path.join(folder, "promo_rack.py"), "w", encoding="utf-8") as handle:
        handle.write(source)
    if driver is not None:
        with open(os.path.join(folder, "iphone.py"), "w", encoding="utf-8") as handle:
            handle.write(driver)
    update_state(
        previous=VERSION,
        current=latest,
        pending={"version": latest, "since": time.time()},
        rolledBack=None,
    )
    log("Installed %s. Restarting on it." % latest)
    sys.exit(EXIT_SWITCH)


# The actions running now, so the program never switches version under one,
# and the phones they run on, so nothing else opens an app on one meanwhile.
_RUNNING = set()
_RUNNING_SERIALS = {}
_RUNNING_LOCK = threading.Lock()


def start_action(config, action):
    """Runs one action on a thread of its own, so another phone's can start meanwhile."""
    serial = str(action.get("serial") or "")
    with _RUNNING_LOCK:
        _RUNNING.add(action["id"])
        _RUNNING_SERIALS[serial] = _RUNNING_SERIALS.get(serial, 0) + 1

    def work():
        try:
            run_action(config, action)
        finally:
            with _RUNNING_LOCK:
                _RUNNING.discard(action["id"])
                left = _RUNNING_SERIALS.get(serial, 1) - 1
                if left > 0:
                    _RUNNING_SERIALS[serial] = left
                else:
                    _RUNNING_SERIALS.pop(serial, None)

    threading.Thread(target=work, name="action-%s" % action["id"][:8], daemon=True).start()


def actions_running():
    with _RUNNING_LOCK:
        return len(_RUNNING)


def action_running_on(serial):
    with _RUNNING_LOCK:
        return _RUNNING_SERIALS.get(serial, 0) > 0


# The rack's log inside Promo (phone farm part 61): when the reply to
# /api/rack/next says sendLog, the last lines of rack.log go to
# /api/rack/log, signed like every call, on a thread of their own so the
# action poll is not held up. Never the whole file, and never more than once
# at a time.
LOG_LINES = 300
LOG_LINE_CHARS = 2000
# How much of the file's end is read to find the last lines.
LOG_TAIL_BYTES = 2 * 1024 * 1024
_LOG_LOCK = threading.Lock()


def last_log_lines(path=None, count=LOG_LINES):
    """The last `count` lines of the log, each cut to LOG_LINE_CHARS. No file
    (Linux keeps the log in the journal) is no lines."""
    path = path or LOG_PATH
    try:
        with open(path, "rb") as handle:
            handle.seek(0, os.SEEK_END)
            size = handle.tell()
            start = max(0, size - LOG_TAIL_BYTES)
            handle.seek(start)
            text = handle.read().decode("utf-8", "replace")
    except OSError:
        return []
    lines = text.splitlines()
    if start > 0 and lines:
        lines = lines[1:]  # A line cut in half by where the read began.
    return [line[:LOG_LINE_CHARS] for line in lines[-count:]]


def send_log(config):
    if not _LOG_LOCK.acquire(False):
        return False
    try:
        call(config, "/api/rack/log", {"lines": last_log_lines()})
        return True
    except (CallFailed, Refused) as failure:
        log("Could not send the log to Promo: %s" % failure)
        return False
    finally:
        _LOG_LOCK.release()


def maybe_send_log(config, reply):
    """Starts the log post when the action poll's reply asks for it. Returns the thread, or None."""
    if not (isinstance(reply, dict) and reply.get("sendLog")):
        return None
    thread = threading.Thread(target=send_log, args=(config,), name="log", daemon=True)
    thread.start()
    return thread


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
            reply = call(config, "/api/rack/next", {})
            maybe_send_log(config, reply)
            work = reply.get("action")
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
