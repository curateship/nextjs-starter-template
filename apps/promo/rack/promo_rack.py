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
health and the comment, answering in the browser's own shapes. Taps land a
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

VERSION = "2026.10.14.3"

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
# Reddit's comment box sends with Post, Reply or Comment, depending on the version.
LAST_BUTTONS = ("post", "send", "share", "reply", "comment")


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
        shell(serial, "input keyevent KEYCODE_HOME", timeout=10)
    except (RuntimeError, subprocess.TimeoutExpired):
        pass


def go_back(serial):
    try:
        shell(serial, "input keyevent KEYCODE_BACK", timeout=10)
    except (RuntimeError, subprocess.TimeoutExpired):
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
    uiautomator2, which Android's own `input text` cannot type."""
    if character == "\n":
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
    if hasattr(device, "swipe_points"):
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
    """A node's own words: its text, or its description when it has no text."""
    return " ".join((node.get("text") or node.get("content-desc") or "").split())


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


def action_setup_check(serial, args, walk):
    """Everything the setup check reads off one phone (part 23)."""
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


def action_wipe(serial, args, walk):
    """Erases everything on the phone. Returns as soon as the erase is pressed;
    the phone restarts into its setup screens."""
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
    lines = screen_lines(hierarchy_xml, REDDIT)
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
    names = [plain(line) for line in screen_lines(hierarchy_xml, REDDIT)]
    found = ("u/%s" % handle).lower() in names or handle.lower() in names
    suspended = any(any(words in name for words in PROFILE_SUSPENDED) for name in names)
    return {"status": 200 if (found or suspended) else 0, "found": found, "suspended": suspended}


def handle_count(hierarchy_xml, handle):
    """How many lines on screen name the account: its comments in a thread."""
    if not handle:
        return 0
    wanted = (handle.lower(), "u/%s" % handle.lower())
    return sum(1 for line in screen_lines(hierarchy_xml, REDDIT) if plain(line).split(" ")[0] in wanted)


def comment_landed(hierarchy_xml, handle, before):
    names = [plain(line) for line in screen_lines(hierarchy_xml, REDDIT)]
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
        if node.get("package") not in (None, "", REDDIT):
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
    shell(serial, "monkey -p %s -c android.intent.category.LAUNCHER 1" % REDDIT)
    time.sleep(4)


POST_LINK = re.compile(r"^/r/[A-Za-z0-9_]+/comments/[A-Za-z0-9]+(/[A-Za-z0-9_%\-]*)*/?$")


def open_post_link(serial, permalink):
    shell(serial, "am start -a android.intent.action.VIEW -d 'https://www.reddit.com%s' -p %s" % (permalink.replace("'", ""), REDDIT))
    time.sleep(4)


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
    walk.tap_first("Open the account menu", selectors=REDDIT_AVATAR)
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
            walk.tap_first("Open your profile", selectors=REDDIT_PROFILE_ENTRY)
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
    for selector in REDDIT_DISCARD:
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
        read_post(serial, walk, len(" ".join(screen_lines(thread, REDDIT))), visit)
        thread = device.dump_hierarchy()
    before = handle_count(thread, handle)

    walk.tap_first("Open the comment box", selectors=REDDIT_COMMENT_BOX)
    if not walk.rehearse:
        gaps = type_like_a_person(serial, device, text, walk.check)
        walk.shot("Typed the comment")
        log("comment typed: %d characters, gaps %.2f to %.2f seconds" % (len(text), min(gaps or [0]), max(gaps or [0])))
        time.sleep(random.uniform(*BEFORE_SUBMIT_SECONDS))

    pressed = walk.final_first("Press Post", selectors=REDDIT_POST_BUTTON)
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


# The actions the daily self-test walks, with the arguments a rehearsal uses.
# The app actions join this list as they are written. The wipe never does:
# a rehearsal cannot press its last button, but nothing about a wipe is
# worth the risk. The comment's post is sent by Promo, a recent one found.
REHEARSALS = {
    "phone/android-version": {},
    "reddit/state": {},
    "reddit/health": {},
    "reddit/comment": {"permalink": "", "text": "", "subreddit": ""},
}


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


ACTIONS = {
    "phone/list": action_list,
    "phone/health": action_health,
    "phone/android-version": action_android_version,
    "phone/self-test": action_self_test,
    "phone/check-updates": action_check_updates,
    "phone/update-app": action_update_app,
    "phone/setup-check": action_setup_check,
    "phone/outside-address": action_outside_address,
    "phone/wipe": action_wipe,
    "reddit/state": action_reddit_state,
    "reddit/quick_state": action_reddit_quick_state,
    "reddit/health": action_reddit_health,
    "reddit/comment": action_reddit_comment,
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
    "phone/setup-check": PLAY_STORE,
    "phone/wipe": "com.android.settings",
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
