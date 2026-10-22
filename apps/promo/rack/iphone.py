"""The iPhone side of the rack program: finding iPhones over USB and driving
one through WebDriverAgent, Apple's own test tool, the way uiautomator2
drives an Android.

Phone farm file 08 (parts 48, 49 and 50). `promo_rack.py` never speaks to an
iPhone except through this file, and this file never speaks to Promo.

How it fits:

- `list_iphones()` is the iPhone half of `promo_rack.list_phones()`: one dict
  per iPhone, in the same shape adb's phones use, with `"kind": "iphone"`.
- `IphoneScreen(udid)` is handed to `promo_rack.Walk` as its `device`. It
  answers the same calls a uiautomator2 device does, so every step walk
  works unchanged: `device(**selector)` finds an element, `device.click(x, y)`
  taps, `device.swipe(...)`, `device.screenshot()` returns a PIL image,
  `device.dump_hierarchy()` returns the screen as XML, `device.press("home")`,
  `device.app_start(bundle_id)`, `device.app_stop(bundle_id)`,
  `device.send_keys(text)`, `device.window_size()`, `device.answers()`.
- `vitals(udid)` is the iPhone half of the once-a-minute reading.
- `wda_expires_at()` is when the WebDriverAgent signature runs out, for the
  check-in. A free Apple ID signs it for 7 days (Tyler, 18 Oct 2026).

Tools on the rack computer:

- pymobiledevice3, Apple's USB channel from Python, for the list, the
  model, the iOS version, the time zone, battery, storage and uptime. It
  works on a Mac and on Linux (through usbmuxd).
- WebDriverAgent, built once by `install.sh` with Xcode and signed with the
  rack owner's Apple ID, for reading and tapping the screen. The rack
  starts it on each iPhone over USB with `xcodebuild test-without-building`
  and the built `.xctestrun`, and talks to it over HTTP through a USB
  tunnel that pymobiledevice3 opens (`usbmux forward`).

Element selectors, mapped from uiautomator2's words:

- `text` / `textMatches`: the element's label, name or value.
- `resourceId` / `resourceIdMatches`: the accessibility identifier (`name`).
- `className`: `android.widget.EditText` means a text field or text view;
  anything else is matched against the XCUIElementType name.
- `packageName`: the app the tree belongs to. WebDriverAgent gives the
  frontmost app's tree, so this only checks that app is in front.
- `description`: the label.

Units: WebDriverAgent measures the screen in points, and a screenshot comes
in pixels, two or three to a point. Everything this file hands out (bounds,
window size) and takes in (taps, swipes) is in pixels, the unit of the
screenshot, so `Walk.press` and the screen window land where they look.

Nothing here is proved except on a real iPhone: the tests stand in for
pymobiledevice3 and WebDriverAgent and prove the parts around them.
"""

import atexit
import base64
import glob
import io
import json
import os
import re
import socket
import subprocess
import sys
import threading
import time
import xml.etree.ElementTree as ElementTree
from datetime import datetime, timedelta
from urllib import error as urlerror
from urllib import request as urlrequest

OLDEST_IOS = 17

# WebDriverAgent listens on this port on the phone; the rack reaches it
# through a USB tunnel on a free local port, one per phone.
WDA_PORT = 8100
# The first start of WebDriverAgent on a phone takes xcodebuild up to a
# minute or so (it installs the runner, then boots it). Within this time the
# phone is reported as connected and a job that arrives waits for it.
DRIVER_START_GRACE_SECONDS = 90
# A driver that died, or never answered, is started again no sooner than
# this, so a dead signature does not run xcodebuild every 15 seconds.
DRIVER_RETRY_SECONDS = 120
HTTP_TIMEOUT_SECONDS = 30
STATUS_TIMEOUT_SECONDS = 3
WAIT_STEP_SECONDS = 0.5

# Apple's own model numbers, as lockdown's ProductType says them.
MODEL_NAMES = {
    "iPhone12,1": "iPhone 11",
    "iPhone12,3": "iPhone 11 Pro",
    "iPhone12,5": "iPhone 11 Pro Max",
    "iPhone12,8": "iPhone SE (2nd generation)",
    "iPhone13,1": "iPhone 12 mini",
    "iPhone13,2": "iPhone 12",
    "iPhone13,3": "iPhone 12 Pro",
    "iPhone13,4": "iPhone 12 Pro Max",
    "iPhone14,2": "iPhone 13 Pro",
    "iPhone14,3": "iPhone 13 Pro Max",
    "iPhone14,4": "iPhone 13 mini",
    "iPhone14,5": "iPhone 13",
    "iPhone14,6": "iPhone SE (3rd generation)",
    "iPhone14,7": "iPhone 14",
    "iPhone14,8": "iPhone 14 Plus",
    "iPhone15,2": "iPhone 14 Pro",
    "iPhone15,3": "iPhone 14 Pro Max",
    "iPhone15,4": "iPhone 15",
    "iPhone15,5": "iPhone 15 Plus",
    "iPhone16,1": "iPhone 15 Pro",
    "iPhone16,2": "iPhone 15 Pro Max",
    "iPhone17,1": "iPhone 16 Pro",
    "iPhone17,2": "iPhone 16 Pro Max",
    "iPhone17,3": "iPhone 16",
    "iPhone17,4": "iPhone 16 Plus",
    "iPhone17,5": "iPhone 16e",
}

# uiautomator2's Android class names and the XCUIElementType names they mean.
CLASS_NAMES = {
    "android.widget.EditText": (
        "XCUIElementTypeTextField",
        "XCUIElementTypeTextView",
        "XCUIElementTypeSecureTextField",
        "XCUIElementTypeSearchField",
    ),
    "android.widget.Button": ("XCUIElementTypeButton",),
    "android.widget.ImageButton": ("XCUIElementTypeButton",),
    "android.widget.TextView": ("XCUIElementTypeStaticText",),
    "android.widget.ImageView": ("XCUIElementTypeImage",),
    "android.widget.Switch": ("XCUIElementTypeSwitch",),
    "android.widget.CheckBox": ("XCUIElementTypeSwitch", "XCUIElementTypeCheckBox"),
    "android.widget.RadioButton": ("XCUIElementTypeRadioButton",),
    "android.widget.ScrollView": ("XCUIElementTypeScrollView", "XCUIElementTypeTable", "XCUIElementTypeCollectionView"),
}
SCROLLING_TYPES = ("XCUIElementTypeScrollView", "XCUIElementTypeTable", "XCUIElementTypeCollectionView")
CHECKABLE_TYPES = ("XCUIElementTypeSwitch", "XCUIElementTypeCheckBox", "XCUIElementTypeRadioButton")


class IphoneError(RuntimeError):
    """Something the iPhone or WebDriverAgent refused, in words a log can show."""


class _Refused(IphoneError):
    """WebDriverAgent answered with an error of its own, such as an invalid session."""

    def __init__(self, error, message):
        IphoneError.__init__(self, "%s: %s" % (error, message) if message else str(error))
        self.error = error or ""


class _NotTrusted(Exception):
    """The phone has not been told to trust this computer yet, or is locked."""


def log(message):
    stamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print("%s %s" % (stamp, message), flush=True)


# The same folder promo_rack.py uses; the two lines are copied so this file
# never imports it.
def _default_home():
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/PromoRack")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "promo-rack")


def rack_home():
    return os.environ.get("PROMO_RACK_HOME") or _default_home()


def wda_dir():
    return os.path.join(rack_home(), "WebDriverAgent")


def wda_json_path():
    return os.path.join(rack_home(), "wda.json")


def sign_hint():
    return "Run on the rack Mac: bash \"%s\"" % os.path.join(rack_home(), "wda.sh")


# ---------------------------------------------------------------------------
# pymobiledevice3: the list, each phone's values, battery and storage. Every
# call into it goes through one of these small functions so a test can stand
# a fake in, and an Android-only rack without the package keeps working.

_NO_TOOL_LOGGED = False


def _pymobiledevice3():
    """The pieces of pymobiledevice3 this file uses, or None when it is not
    installed, which is logged once."""
    global _NO_TOOL_LOGGED
    try:
        from pymobiledevice3 import exceptions, usbmux
        from pymobiledevice3.lockdown import create_using_usbmux
    except ImportError:
        if not _NO_TOOL_LOGGED:
            log("pymobiledevice3 is not installed, so no iPhone is looked for. Run the install command again to add it.")
            _NO_TOOL_LOGGED = True
        return None
    return {"exceptions": exceptions, "usbmux": usbmux, "create_using_usbmux": create_using_usbmux}


def _pairing_errors(tool):
    """The exceptions pymobiledevice3 raises while a phone is not yet trusted
    or is locked, whichever of them this version has."""
    names = (
        "NotTrustedError", "PairingError", "NotPairedError", "PasswordRequiredError",
        "UserDeniedPairingError", "PairingDialogResponsePendingError",
    )
    found = tuple(getattr(tool["exceptions"], name) for name in names if hasattr(tool["exceptions"], name))
    return found or (Exception,)


def _usb_udids():
    """The UDIDs of the iPhones on USB, in the order usbmux lists them."""
    tool = _pymobiledevice3()
    udids = []
    for device in tool["usbmux"].list_devices():
        if str(getattr(device, "connection_type", "USB")).upper() != "USB":
            continue
        serial = getattr(device, "serial", "")
        if serial and serial not in udids:
            udids.append(serial)
    return udids


def _open_lockdown(udid):
    """A lockdown connection to one phone. Asks the phone to trust this
    computer when it does not yet, which puts the Trust dialog on its screen,
    and raises _NotTrusted until the person taps Trust."""
    tool = _pymobiledevice3()
    try:
        return tool["create_using_usbmux"](serial=udid, autopair=True)
    except _pairing_errors(tool) as failure:
        raise _NotTrusted(str(failure))


def _close(lockdown):
    try:
        lockdown.close()
    except Exception:  # A fake, or a connection already gone.
        pass


def _read_lockdown(udid):
    """ProductType, iOS version and time zone from the phone's lockdown values."""
    lockdown = _open_lockdown(udid)
    try:
        values = getattr(lockdown, "all_values", None) or {}
        if not values:
            values = {
                key: lockdown.get_value(key=key)
                for key in ("ProductType", "ProductVersion", "TimeZone")
            }
        return {
            "productType": str(values.get("ProductType") or ""),
            "android": str(values.get("ProductVersion") or ""),
            "timezone": str(values.get("TimeZone") or ""),
        }
    finally:
        _close(lockdown)


def _diagnostics(lockdown):
    from pymobiledevice3.services.diagnostics import DiagnosticsService
    return DiagnosticsService(lockdown)


def _installation_proxy(lockdown):
    from pymobiledevice3.services.installation_proxy import InstallationProxyService
    return InstallationProxyService(lockdown)


# The apps whose versions Promo tracks, by the bundle id Apple knows them by.
TRACKED_APPS = {
    "com.reddit.Reddit": "reddit",
    "com.burbn.instagram": "instagram",
    "com.zhiliaoapp.musically": "tiktok",
    "com.atebits.Tweetie2": "x",
}

_NO_VERSIONS_LOGGED = set()


def app_versions(udid):
    """{"reddit": "2024.40.0", ...} for the tracked apps on the phone, read
    through Apple's installation proxy; an app not installed is left out.
    Never raises: None and one log line when the phone cannot be asked, so
    a phone that cannot be read never looks like one that lost its apps."""
    global _NO_VERSIONS_LOGGED
    try:
        lockdown = _open_lockdown(udid)
    except Exception as failure:
        if udid not in _NO_VERSIONS_LOGGED:
            log("Could not read app versions on iPhone %s: %s" % (udid, failure))
            _NO_VERSIONS_LOGGED.add(udid)
        return None
    try:
        apps = _installation_proxy(lockdown).get_apps(application_type="User", calculate_sizes=False)
    except Exception as failure:
        if udid not in _NO_VERSIONS_LOGGED:
            log("Could not read app versions on iPhone %s: %s" % (udid, failure))
            _NO_VERSIONS_LOGGED.add(udid)
        return None
    finally:
        _close(lockdown)
    _NO_VERSIONS_LOGGED.discard(udid)
    # Newer pymobiledevice3 answers {bundle id: info}; older ones a list of infos.
    records = list(apps.values()) if isinstance(apps, dict) else list(apps or [])
    versions = {}
    for record in records:
        if not isinstance(record, dict):
            continue
        name = TRACKED_APPS.get(str(record.get("CFBundleIdentifier") or ""))
        version = record.get("CFBundleShortVersionString") or record.get("CFBundleVersion")
        if name and version:
            versions[name] = str(version)
    return versions


def restart(udid):
    """Restarts the phone through Apple's diagnostics channel."""
    try:
        lockdown = _open_lockdown(udid)
    except _NotTrusted as failure:
        raise IphoneError("iPhone %s is not trusted or is locked, so it cannot be restarted: %s" % (udid, failure))
    except Exception as failure:
        raise IphoneError("iPhone %s could not be reached to restart it: %s" % (udid, failure))
    try:
        _diagnostics(lockdown).restart()
    except Exception as failure:
        raise IphoneError("iPhone %s refused the restart: %s" % (udid, failure))
    finally:
        _close(lockdown)
    with _LOCK:
        _SESSIONS.pop(udid, None)


def model_name(product_type):
    """Apple's model number as a person says it, or the number itself."""
    return MODEL_NAMES.get(product_type or "", product_type or "")


def ios_major(version):
    """17 from "17.6.1"; None when the version cannot be read."""
    found = re.match(r"^\s*(\d+)", str(version or ""))
    return int(found.group(1)) if found else None


# Each phone's model, iOS version and time zone, read once while it stays plugged in.
_VALUES = {}


def list_iphones():
    """One dict per iPhone plugged in, in the shape `promo_rack.parse_devices`
    uses: serial (the UDID), state, usb (empty: Apple does not say the port),
    model, android (the iOS version), timezone, kind "iphone".

    state is "device" when trusted and WebDriverAgent answers,
    "unauthorized" while the phone still asks Trust this computer,
    "too_old" under iOS 17, and "no_driver" when WebDriverAgent cannot be
    started or its signature has died.
    """
    if _pymobiledevice3() is None:
        return []
    try:
        udids = _usb_udids()
    except Exception as failure:  # usbmuxd down, or the package half installed.
        log("Could not list iPhones: %s" % failure)
        return []
    phones = []
    for udid in udids:
        phone = {"serial": udid, "state": "device", "usb": "", "model": "", "android": "", "timezone": "", "kind": "iphone"}
        try:
            values = _VALUES.get(udid) or _read_lockdown(udid)
        except _NotTrusted:
            phone["state"] = "unauthorized"
            phones.append(phone)
            continue
        except Exception as failure:  # One bad phone must not hide the others.
            log("Could not read iPhone %s: %s" % (udid, failure))
            continue
        _VALUES[udid] = values
        phone["model"] = model_name(values.get("productType"))
        phone["android"] = values.get("android") or ""
        phone["timezone"] = values.get("timezone") or ""
        major = ios_major(phone["android"])
        if major is not None and major < OLDEST_IOS:
            phone["state"] = "too_old"
        else:
            try:
                phone["state"] = driver_state(udid)
            except Exception as failure:  # Anything unforeseen in starting the driver.
                log("WebDriverAgent on %s: %s" % (udid, failure))
                phone["state"] = "no_driver"
        phones.append(phone)
    forget_missing(set(udids))
    return phones


def forget_missing(present):
    """Drops what was kept for phones no longer plugged in: their values,
    their session and their WebDriverAgent, whose tunnel is dead anyway."""
    for udid in list(_VALUES):
        if udid not in present:
            del _VALUES[udid]
    with _LOCK:
        for udid in list(_DRIVERS):
            if udid not in present:
                _stop_entry(_DRIVERS.pop(udid))
                _SESSIONS.pop(udid, None)


# ---------------------------------------------------------------------------
# The signature

def wda_expires_at():
    """When the WebDriverAgent signature runs out, as an ISO 8601 string with
    an offset, or None when it was never signed on this computer."""
    try:
        with open(wda_json_path()) as handle:
            record = json.load(handle)
        signed_at = str(record["signedAt"]).strip()
        days = float(record.get("days", 7))
    except (OSError, ValueError, KeyError, TypeError):
        return None
    if signed_at.endswith("Z"):
        signed_at = signed_at[:-1] + "+00:00"
    try:
        signed = datetime.fromisoformat(signed_at)
    except ValueError:
        return None
    if signed.tzinfo is None:
        signed = signed.astimezone()
    return (signed + timedelta(days=days)).isoformat()


# ---------------------------------------------------------------------------
# Vitals

def _percent(part, whole):
    if not whole:
        return None
    return max(0, min(100, int(round(100.0 * part / whole))))


def _battery_percent(battery):
    current = battery.get("CurrentCapacity")
    maximum = battery.get("MaxCapacity")
    if current is None:
        return None
    if maximum:
        return _percent(float(current), float(maximum))
    return max(0, min(100, int(round(float(current)))))


def _battery_temperature(battery):
    """AppleSmartBattery reports hundredths of a degree (2787 is 27.87 C)."""
    raw = battery.get("Temperature")
    if raw is None:
        return None
    raw = float(raw)
    if raw > 1000:
        return round(raw / 100.0, 1)
    if raw > 150:
        return round(raw / 10.0, 1)
    return round(raw, 1)


def _find_key(record, pattern):
    """The first value under a key matching the pattern, anywhere in a nest of dicts."""
    if isinstance(record, dict):
        for key, value in record.items():
            if re.search(pattern, str(key), re.I) and not isinstance(value, (dict, list)):
                return value
        for value in record.values():
            found = _find_key(value, pattern)
            if found is not None:
                return found
    elif isinstance(record, list):
        for value in record:
            found = _find_key(value, pattern)
            if found is not None:
                return found
    return None


def vitals(udid):
    """Battery (percent and temperature), storage used (percent), uptime in
    seconds. `signal` is "not_reported": Apple's channel does not give it."""
    reading = {
        "batteryPercent": None,
        "temperatureC": None,
        "storageUsedPercent": None,
        "signal": "not_reported",
        "upSeconds": None,
        "apps": None,
    }
    try:
        lockdown = _open_lockdown(udid)
    except Exception as failure:  # Unplugged, or not trusted yet: nothing can be read.
        log("No reading from iPhone %s: %s" % (udid, failure))
        return reading
    try:
        try:
            disk = lockdown.get_value(domain="com.apple.disk_usage") or {}
            total = float(disk.get("TotalDataCapacity") or 0)
            free = float(disk.get("TotalDataAvailable") or 0)
            reading["storageUsedPercent"] = _percent(total - free, total) if total else None
        except Exception as failure:
            log("No storage reading from iPhone %s: %s" % (udid, failure))
        diagnostics = None
        try:
            diagnostics = _diagnostics(lockdown)
        except Exception as failure:
            log("No diagnostics on iPhone %s: %s" % (udid, failure))
        if diagnostics is not None:
            try:
                battery = diagnostics.get_battery() or {}
                reading["batteryPercent"] = _battery_percent(battery)
                reading["temperatureC"] = _battery_temperature(battery)
            except Exception as failure:
                log("No battery reading from iPhone %s: %s" % (udid, failure))
            try:
                up = _find_key(diagnostics.info() or {}, r"^up.?time$")
                reading["upSeconds"] = int(float(up)) if up is not None else None
            except Exception:  # Apple's diagnostics do not always say; None is the honest answer.
                reading["upSeconds"] = None
    finally:
        _close(lockdown)
    return reading


# ---------------------------------------------------------------------------
# WebDriverAgent: started per phone with xcodebuild, reached through a USB
# tunnel, one session per phone.

_LOCK = threading.RLock()
# udid -> {"port", "started_at", "attempts", "process", "forward", "log", "gave_up"}
_DRIVERS = {}
# udid -> WebDriverAgent session id
_SESSIONS = {}


def _free_port():
    sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]
    finally:
        sock.close()


def xctestrun_path():
    """The file xcodebuild wrote when install.sh built WebDriverAgent, or None."""
    found = sorted(glob.glob(os.path.join(wda_dir(), "build", "Build", "Products", "WebDriverAgentRunner_iphoneos*.xctestrun")))
    return found[-1] if found else None


def _start_with_xcodebuild(udid, log_handle):
    """Starts WebDriverAgent on the phone from the build install.sh made.
    Runs until stopped; its output goes to the phone's wda log."""
    xctestrun = xctestrun_path()
    if not xctestrun:
        raise IphoneError("WebDriverAgent is not built on this computer. %s" % sign_hint())
    command = [
        "xcodebuild", "test-without-building",
        "-xctestrun", xctestrun,
        "-destination", "id=%s" % udid,
    ]
    return subprocess.Popen(command, stdout=log_handle, stderr=subprocess.STDOUT, cwd=wda_dir())


def _forward_with_pymobiledevice3(udid, local_port, log_handle):
    """A USB tunnel from a local port to WebDriverAgent's port on the phone."""
    command = [
        sys.executable, "-m", "pymobiledevice3", "usbmux", "forward",
        str(local_port), str(WDA_PORT), "--udid", udid,
    ]
    return subprocess.Popen(command, stdout=log_handle, stderr=subprocess.STDOUT)


# Swapped for fakes by the tests; swap for another way of starting it here.
START_DRIVER = _start_with_xcodebuild
START_FORWARD = _forward_with_pymobiledevice3


def _alive(process):
    return process is not None and process.poll() is None


def _stop_entry(entry):
    for key in ("process", "forward"):
        process = entry.get(key)
        if _alive(process):
            try:
                process.terminate()
            except Exception:
                pass
    handle = entry.get("log")
    if handle is not None:
        try:
            handle.close()
        except Exception:
            pass


def stop_drivers():
    """Stops every WebDriverAgent and tunnel this program started."""
    with _LOCK:
        for udid in list(_DRIVERS):
            _stop_entry(_DRIVERS.pop(udid))
        _SESSIONS.clear()


atexit.register(stop_drivers)


def _ensure_driver(udid):
    """The driver record for a phone, starting WebDriverAgent and its tunnel
    when there is none, or when the last one died and the retry wait is over."""
    with _LOCK:
        now = time.time()
        entry = _DRIVERS.get(udid)
        if entry is not None:
            if _alive(entry["process"]) and not entry["gave_up"]:
                return entry
            if now - entry["started_at"] < DRIVER_RETRY_SECONDS:
                return entry
            _stop_entry(entry)
            attempts = entry["attempts"]
        else:
            attempts = 0
        entry = {
            "port": _free_port(), "started_at": now, "attempts": attempts + 1,
            "process": None, "forward": None, "log": None, "gave_up": False, "ready": False,
        }
        _DRIVERS[udid] = entry
        _SESSIONS.pop(udid, None)
        # Written fresh on every start. Appending would grow it for good on a
        # phone whose signature is dead and is retried every two minutes.
        try:
            entry["log"] = open(os.path.join(rack_home(), "wda-%s.log" % udid), "wb")
        except OSError:
            entry["log"] = None
        output = entry["log"] if entry["log"] is not None else subprocess.DEVNULL
        try:
            entry["forward"] = START_FORWARD(udid, entry["port"], output)
            entry["process"] = START_DRIVER(udid, output)
            log("Starting WebDriverAgent on %s through port %d (try %d)." % (udid, entry["port"], entry["attempts"]))
        except Exception as failure:
            log("Could not start WebDriverAgent on %s: %s" % (udid, failure))
            entry["error"] = str(failure)
        return entry


def _status_ok(port):
    try:
        _http(port, "GET", "/status", timeout=STATUS_TIMEOUT_SECONDS)
        return True
    except IphoneError:
        return False


def driver_state(udid):
    """"device" when WebDriverAgent answers on the phone, or is still on its
    first start; "no_driver" when it died or never answered."""
    entry = _ensure_driver(udid)
    if _status_ok(entry["port"]):
        entry["ready"] = True
        return "device"
    entry["ready"] = False
    starting = _alive(entry["process"]) and time.time() - entry["started_at"] < DRIVER_START_GRACE_SECONDS
    if starting and entry["attempts"] == 1:
        return "device"
    if not starting:
        entry["gave_up"] = True
    return "no_driver"


def _port(udid):
    """The local port WebDriverAgent answers on, waiting out its start. Once
    it has answered, the port is handed back without asking again."""
    entry = _ensure_driver(udid)
    if entry.get("ready") and _alive(entry["process"]):
        return entry["port"]
    deadline = entry["started_at"] + DRIVER_START_GRACE_SECONDS
    while True:
        if _status_ok(entry["port"]):
            entry["ready"] = True
            return entry["port"]
        if not _alive(entry["process"]) or time.time() >= deadline:
            entry["gave_up"] = True
            why = entry.get("error") or "it did not answer"
            raise IphoneError("WebDriverAgent is not running on %s (%s). %s" % (udid, why, sign_hint()))
        time.sleep(1)


def _http(port, method, path, body=None, timeout=HTTP_TIMEOUT_SECONDS):
    """One call to WebDriverAgent. Returns its whole JSON answer; an answer
    that carries an error is raised as _Refused."""
    data = None
    if method == "POST":
        data = json.dumps(body if body is not None else {}).encode("utf-8")
    request = urlrequest.Request(
        "http://127.0.0.1:%d%s" % (port, path), data=data, method=method,
        headers={"Content-Type": "application/json", "Accept": "application/json"},
    )
    try:
        with urlrequest.urlopen(request, timeout=timeout) as answer:
            raw = answer.read()
    except urlerror.HTTPError as failure:
        raw = failure.read()
    except (urlerror.URLError, socket.timeout, OSError, ValueError) as failure:
        raise IphoneError("WebDriverAgent did not answer %s %s: %s" % (method, path, failure))
    try:
        parsed = json.loads(raw.decode("utf-8"))
    except (ValueError, UnicodeDecodeError):
        raise IphoneError("WebDriverAgent gave no JSON for %s %s: %s" % (method, path, raw[:200]))
    value = parsed.get("value") if isinstance(parsed, dict) else None
    if isinstance(value, dict) and value.get("error"):
        raise _Refused(value.get("error"), value.get("message"))
    return parsed


def _session_id(udid, fresh=False):
    """The WebDriverAgent session for a phone, made on first use and remade
    when WebDriverAgent says the old one is gone."""
    with _LOCK:
        if not fresh and udid in _SESSIONS:
            return _SESSIONS[udid]
    port = _port(udid)
    answer = _http(port, "POST", "/session", {"capabilities": {"alwaysMatch": {}}})
    value = answer.get("value") if isinstance(answer, dict) else None
    session = (value or {}).get("sessionId") if isinstance(value, dict) else None
    session = session or (answer.get("sessionId") if isinstance(answer, dict) else None)
    if not session:
        raise IphoneError("WebDriverAgent on %s opened no session: %s" % (udid, str(answer)[:200]))
    with _LOCK:
        _SESSIONS[udid] = session
    return session


def _invalid_session(failure):
    """WebDriverAgent's "invalid session id", or any error that says the session is gone."""
    error = failure.error.lower()
    return "invalid session" in error or ("session" in error and "not" in error)


def _call(udid, method, path, body=None, timeout=HTTP_TIMEOUT_SECONDS):
    """One call under the phone's session, retried once on a fresh session
    when WebDriverAgent says the old one is invalid."""
    session = _session_id(udid)
    try:
        return _http(_port(udid), method, "/session/%s%s" % (session, path), body, timeout)
    except _Refused as failure:
        if not _invalid_session(failure):
            raise
        session = _session_id(udid, fresh=True)
        return _http(_port(udid), method, "/session/%s%s" % (session, path), body, timeout)


def _value(answer):
    return answer.get("value") if isinstance(answer, dict) else answer


# ---------------------------------------------------------------------------
# The screen tree, in the shape promo_rack.py's Android readers expect.

def _number(text):
    try:
        return float(text)
    except (TypeError, ValueError):
        return 0.0


def convert_source(source_xml, scale, package=""):
    """WebDriverAgent's source XML as uiautomator XML: one <node> per element
    under <hierarchy>, with text, resource-id, class, package, content-desc
    and bounds in pixels, and label, name, value and type kept as they were."""
    root = ElementTree.fromstring(source_xml)
    hierarchy = ElementTree.Element("hierarchy", {"rotation": "0"})
    _convert_node(root, hierarchy, scale, package, 0)
    return ElementTree.tostring(hierarchy, encoding="unicode")


def _convert_node(source, parent, scale, package, index):
    attributes = source.attrib
    element_type = attributes.get("type") or source.tag
    label = attributes.get("label") or ""
    name = attributes.get("name") or ""
    value = attributes.get("value") or ""
    x, y = _number(attributes.get("x")), _number(attributes.get("y"))
    width, height = _number(attributes.get("width")), _number(attributes.get("height"))
    left, top = int(round(x * scale)), int(round(y * scale))
    right, bottom = int(round((x + width) * scale)), int(round((y + height) * scale))
    checkable = element_type in CHECKABLE_TYPES
    node = ElementTree.SubElement(parent, "node", {
        "index": str(index),
        "text": label or value or name,
        "resource-id": name,
        "class": element_type,
        "package": package or "",
        "content-desc": label,
        "label": label,
        "name": name,
        "value": value,
        "type": element_type,
        "enabled": attributes.get("enabled", "true"),
        "visible": attributes.get("visible", "true"),
        "checkable": "true" if checkable else "false",
        "checked": "true" if checkable and value in ("1", "true", "on") else "false",
        "scrollable": "true" if element_type in SCROLLING_TYPES else "false",
        "bounds": "[%d,%d][%d,%d]" % (left, top, right, bottom),
    })
    for child_index, child in enumerate(source):
        _convert_node(child, node, scale, package, child_index)


def parse_bounds(text):
    """"[l,t][r,b]" as the dict uiautomator2's element.info["bounds"] holds."""
    found = re.match(r"^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$", text or "")
    if not found:
        return {"left": 0, "top": 0, "right": 0, "bottom": 0}
    left, top, right, bottom = (int(part) for part in found.groups())
    return {"left": left, "top": top, "right": right, "bottom": bottom}


def _class_matches(wanted, element_type):
    names = CLASS_NAMES.get(wanted)
    if names:
        return element_type in names
    return element_type == wanted or element_type == "XCUIElementType" + wanted


def _truth(value):
    return "true" if value in (True, "true", "True", 1, "1") else "false"


def matches(node, selector):
    """True when one converted node answers every word of a uiautomator2 selector."""
    text, label, name = node.get("text", ""), node.get("content-desc", ""), node.get("resource-id", "")
    for key, wanted in selector.items():
        if key == "instance":
            continue
        if key == "text":
            ok = text == str(wanted)
        elif key == "textMatches":
            ok = re.fullmatch(str(wanted), text) is not None
        elif key == "textContains":
            ok = str(wanted) in text
        elif key == "textStartsWith":
            ok = text.startswith(str(wanted))
        elif key == "description":
            ok = label == str(wanted)
        elif key == "descriptionMatches":
            ok = re.fullmatch(str(wanted), label) is not None
        elif key == "descriptionContains":
            ok = str(wanted) in label
        elif key == "descriptionStartsWith":
            ok = label.startswith(str(wanted))
        elif key == "resourceId":
            ok = name == str(wanted)
        elif key == "resourceIdMatches":
            ok = re.fullmatch(str(wanted), name) is not None
        elif key == "className":
            ok = _class_matches(str(wanted), node.get("class", ""))
        elif key == "classNameMatches":
            ok = re.fullmatch(str(wanted), node.get("class", "")) is not None
        elif key == "packageName":
            ok = node.get("package", "") == str(wanted)
        elif key in ("scrollable", "checkable", "checked", "enabled"):
            ok = node.get(key, "false") == _truth(wanted)
        elif key == "index":
            ok = node.get("index") == str(wanted)
        else:
            raise IphoneError("The selector word %r has no iPhone meaning." % key)
        if not ok:
            return False
    return True


def find_nodes(nodes, selector):
    return [node for node in nodes if matches(node, selector)]


def nodes_of(hierarchy_xml):
    """Every node's attributes, in screen order."""
    return [dict(node.attrib) for node in ElementTree.fromstring(hierarchy_xml).iter("node")]


def _image_from_png(data):
    from PIL import Image
    image = Image.open(io.BytesIO(data))
    image.load()
    return image


# ---------------------------------------------------------------------------
# Touch: W3C actions, which WebDriverAgent takes at /actions. Points, not pixels.

def tap_actions(x, y):
    return {"actions": [{
        "type": "pointer", "id": "finger", "parameters": {"pointerType": "touch"},
        "actions": [
            {"type": "pointerMove", "duration": 0, "x": x, "y": y},
            {"type": "pointerDown", "button": 0},
            {"type": "pause", "duration": 60},
            {"type": "pointerUp", "button": 0},
        ],
    }]}


def swipe_actions(x1, y1, x2, y2, duration_ms, hold_ms=0):
    steps = [
        {"type": "pointerMove", "duration": 0, "x": x1, "y": y1},
        {"type": "pointerDown", "button": 0},
        {"type": "pause", "duration": 50},
        {"type": "pointerMove", "duration": int(duration_ms), "x": x2, "y": y2},
    ]
    if hold_ms:
        steps.append({"type": "pause", "duration": int(hold_ms)})
    steps.append({"type": "pointerUp", "button": 0})
    return {"actions": [{"type": "pointer", "id": "finger", "parameters": {"pointerType": "touch"}, "actions": steps}]}


class _Scroll(object):
    """`element.scroll.forward()` and friends, as uiautomator2 spells them:
    a swipe inside the element, the way a thumb scrolls a list."""

    def __init__(self, element):
        self.element = element

    @property
    def vert(self):
        return self

    def _swipe(self, start, end):
        bounds = self.element.info["bounds"]
        x = (bounds["left"] + bounds["right"]) / 2.0
        height = bounds["bottom"] - bounds["top"]
        self.element.screen.swipe(x, bounds["top"] + height * start, x, bounds["top"] + height * end, 0.4)
        return True

    def forward(self, steps=None):
        return self._swipe(0.75, 0.3)

    def backward(self, steps=None):
        return self._swipe(0.3, 0.75)

    def toBeginning(self, steps=None, max_swipes=10):
        for _ in range(max_swipes):
            self.backward()
        return True

    def toEnd(self, steps=None, max_swipes=10):
        for _ in range(max_swipes):
            self.forward()
        return True


class IphoneElement(object):
    """One element on an iPhone's screen, answering like a uiautomator2 element."""

    def __init__(self, screen, selector):
        self.screen = screen
        self.selector = dict(selector)

    def _find(self):
        found = find_nodes(self.screen._nodes(), self.selector)
        instance = int(self.selector.get("instance", 0) or 0)
        return found[instance] if len(found) > instance else None

    def _found(self):
        node = self._find()
        if node is None:
            raise IphoneError("Nothing on the screen matches %s." % json.dumps(self.selector))
        return node

    @property
    def exists(self):
        return self._find() is not None

    @property
    def info(self):
        """At least {"bounds": {"left", "top", "right", "bottom"}, "text": ...}."""
        node = self._found()
        info = dict(node)
        info["bounds"] = parse_bounds(node.get("bounds"))
        info["className"] = node.get("class", "")
        info["resourceName"] = node.get("resource-id", "")
        info["contentDescription"] = node.get("content-desc", "")
        info["packageName"] = node.get("package", "")
        return info

    @property
    def scroll(self):
        return _Scroll(self)

    def wait(self, timeout=10):
        deadline = time.time() + timeout
        while True:
            if self.exists:
                return True
            if time.time() >= deadline:
                return False
            time.sleep(WAIT_STEP_SECONDS)

    def click(self):
        bounds = self.info["bounds"]
        self.screen.click((bounds["left"] + bounds["right"]) / 2.0, (bounds["top"] + bounds["bottom"]) / 2.0)

    def get_text(self):
        return self._found().get("text", "")

    def set_text(self, text):
        self.click()
        time.sleep(0.3)
        self._erase()
        if text:
            self.screen.send_keys(text)

    def clear_text(self):
        self.click()
        time.sleep(0.3)
        self._erase()

    def _erase(self):
        """Backspaces over what the field holds. A text field's value is its
        contents; its label is the placeholder, which is not erased."""
        node = self._found()
        length = len(node.get("value") or "")
        if length:
            self.screen.send_keys("\b" * (length + 2))


class IphoneScreen(object):
    """One iPhone's screen through WebDriverAgent, answering like a uiautomator2 device."""

    def __init__(self, udid):
        self.udid = udid
        self._scale = None
        self._points = None

    def _call(self, method, path, body=None, timeout=HTTP_TIMEOUT_SECONDS):
        return _value(_call(self.udid, method, path, body, timeout))

    def __call__(self, **selector):
        return IphoneElement(self, selector)

    def active_app(self):
        """The bundle id of the app in front, or "" when WebDriverAgent cannot say."""
        try:
            return str((self._call("GET", "/wda/activeAppInfo") or {}).get("bundleId") or "")
        except Exception:  # Older WebDriverAgent, or nothing in front.
            return ""

    def answers(self):
        """True when WebDriverAgent on this phone answers GET /status right
        now, within STATUS_TIMEOUT_SECONDS. Nothing cached counts, so a
        driver that died since the last call says False. A phone whose
        driver was never started says False too."""
        with _LOCK:
            entry = _DRIVERS.get(self.udid)
        if entry is None:
            return False
        return _status_ok(entry["port"])

    def _nodes(self):
        return nodes_of(self.dump_hierarchy())

    def _size_in_points(self):
        if self._points is None:
            size = self._call("GET", "/window/size") or {}
            self._points = (float(size.get("width") or 0), float(size.get("height") or 0))
        return self._points

    def scale(self):
        """Pixels per point: WebDriverAgent says it, or the screenshot's width
        over the window's width says it."""
        if self._scale:
            return self._scale
        try:
            self._scale = float((self._call("GET", "/wda/screen") or {})["scale"])
        except Exception:
            width = self._size_in_points()[0]
            image = self.screenshot()
            self._scale = (image.width / width) if width else 1.0
        if not self._scale or self._scale <= 0:
            self._scale = 1.0
        return self._scale

    def click(self, x, y):
        scale = self.scale()
        self._call("POST", "/actions", tap_actions(x / scale, y / scale))

    def swipe(self, x1, y1, x2, y2, duration=0.3):
        self._swipe(x1, y1, x2, y2, duration)

    def _swipe(self, x1, y1, x2, y2, duration=0.3, hold=0):
        scale = self.scale()
        self._call("POST", "/actions", swipe_actions(
            x1 / scale, y1 / scale, x2 / scale, y2 / scale, duration * 1000, hold * 1000,
        ))

    def screenshot(self):
        """A PIL image of the screen, in the phone's own pixels."""
        encoded = self._call("GET", "/screenshot")
        if not isinstance(encoded, str) or not encoded:
            raise IphoneError("WebDriverAgent on %s gave no picture." % self.udid)
        return _image_from_png(base64.b64decode(encoded))

    def dump_hierarchy(self):
        """The screen as XML, each element a node with text, label, name,
        value, type and bounds attributes, so the same readers work."""
        source = self._call("GET", "/source?format=xml")
        if not isinstance(source, str) or not source.strip():
            raise IphoneError("WebDriverAgent on %s gave no screen tree." % self.udid)
        return convert_source(source, self.scale(), self.active_app())

    def window_size(self):
        width, height = self._size_in_points()
        scale = self.scale()
        return int(round(width * scale)), int(round(height * scale))

    def press(self, key):
        """"home", "back" (the swipe in from the left edge), "recents" (the
        swipe up and hold), "enter", "delete"."""
        if key == "home":
            self._call("POST", "/wda/homescreen")
        elif key == "back":
            width, height = self.window_size()
            self._swipe(2, height / 2.0, width * 0.4, height / 2.0, 0.3)
        elif key == "recents":
            width, height = self.window_size()
            self._swipe(width / 2.0, height - 1, width / 2.0, height * 0.55, 0.4, hold=0.6)
        elif key == "enter":
            self.send_keys("\n")
        elif key == "delete":
            self.send_keys("\b")
        else:
            raise IphoneError("An iPhone has no %r key." % key)

    def screen_on(self):
        """Wakes the screen. A phone with a passcode stays on its lock screen."""
        try:
            self._call("POST", "/wda/unlock", timeout=10)
        except IphoneError as failure:
            log("Could not wake %s: %s" % (self.udid, failure))

    def app_start(self, bundle_id):
        self._call("POST", "/wda/apps/launch", {"bundleId": bundle_id, "shouldWaitForQuiescence": False})

    def app_stop(self, bundle_id):
        self._call("POST", "/wda/apps/terminate", {"bundleId": bundle_id})

    def open_url(self, url):
        """Opens an address in Safari, or in the app that owns it."""
        self._call("POST", "/url", {"url": url})

    def send_keys(self, text, clear=False):
        """Types into the focused field, any letter or emoji. `clear` is
        uiautomator2's word for emptying the field first."""
        if clear:
            self.send_keys("\b" * 60)
        self._call("POST", "/wda/keys", {"value": list(str(text))})
