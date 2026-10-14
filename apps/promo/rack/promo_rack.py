#!/usr/bin/env python3
"""Promo's rack program: the only thing that touches the phones.

It runs on the computer the phones are plugged into, at home. It dials out to
Promo, so no port is ever opened at the house. Every 15 seconds it tells Promo
which phones adb can see, and every few seconds it asks for the next action.
Only the actions named in ACTIONS below are ever run; any other name is
refused. Every message both ways is signed with the key this rack was given
when it was paired, and a reply without the right signature is thrown away.

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
import time
import urllib.error
import urllib.request
import xml.etree.ElementTree as ElementTree

VERSION = "2026.10.13.1"

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


# Each phone's model and Android version, read once while it stays plugged in.
_PROPS = {}


def list_phones():
    phones = parse_devices(adb(["devices", "-l"], timeout=15))
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
# The named actions. Each takes the phone's serial and its arguments, and
# returns (result, screenshots), screenshots being JPEG bytes.

def action_list(serial, args):
    return {"phones": list_phones()}, []


def action_health(serial, args):
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
    }, []


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


def action_android_version(serial, args):
    """Opens Settings at About phone and reads the Android version off the screen.

    A test of the whole path: the rack reaching the phone, the phone opening an
    app, and the screen being read. The version Android itself reports is read
    too, so the answer can be checked against it.
    """
    from_system = shell(serial, "getprop ro.build.version.release")
    device = connect_screen(serial)
    device.screen_on()
    shell(serial, "am start -a android.settings.DEVICE_INFO_SETTINGS")
    time.sleep(2)
    found = None
    # Pixels list it on About phone. Samsungs keep it one screen in, under
    # Software information. Either may need a scroll first.
    for attempt in range(4):
        found = version_beside_label(device.dump_hierarchy())
        if found:
            break
        if attempt == 0 and device(text="Software information").exists:
            device(text="Software information").click()
            time.sleep(1.5)
            continue
        scroller = device(scrollable=True)
        if scroller.exists:
            scroller.scroll.forward()
            time.sleep(1)
    shots = [screenshot_jpeg(device)]
    shell(serial, "input keyevent KEYCODE_HOME")
    if not found:
        raise RuntimeError(
            "Settings opened, but no Android version was found on its screen. Android itself says %s." % from_system
        )
    return {"fromScreen": found, "fromSystem": from_system, "match": found == from_system}, shots


ACTIONS = {
    "phone/list": action_list,
    "phone/health": action_health,
    "phone/android-version": action_android_version,
}


# ---------------------------------------------------------------------------
# The loop

def platform_name():
    if sys.platform == "darwin":
        return ("macOS %s" % platform.mac_ver()[0]).strip()
    return platform.system() or sys.platform


def check_in(config):
    state = load_state()
    note = state.get("rolledBack")
    reply = call(config, "/api/rack/check-in", {
        "version": VERSION,
        "platform": platform_name(),
        "phones": list_phones(),
        "rolledBack": note if isinstance(note, dict) else None,
    })
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


def run_action(config, action):
    name = action.get("action", "")
    handler = ACTIONS.get(name)
    shots = []
    if handler is None:
        ok, result, error = False, None, "This rack does not know the action %s." % name
    else:
        try:
            result, shots = handler(action.get("serial", ""), action.get("args") or {})
            ok, error = True, ""
        except Exception as failure:  # The answer goes back to Promo either way.
            ok, result, error = False, None, str(failure) or failure.__class__.__name__
    log("%s on %s: %s" % (name, action.get("serial", ""), "done" if ok else error))
    call(config, "/api/rack/result", {
        "id": action["id"],
        "ok": ok,
        "result": result,
        "error": error,
        "screenshots": [base64.b64encode(shot).decode("ascii") for shot in shots],
    })


def run():
    config = read_json(CONFIG_PATH, None)
    if not config:
        log("This rack is not paired. Run the install command from the Phones dashboard.")
        sys.exit(1)
    log("Promo rack %s started, talking to %s." % (VERSION, config["url"]))
    interval = DEFAULT_CHECK_IN_SECONDS
    last_check_in = 0.0
    while True:
        current = load_state().get("current")
        if current and current != VERSION:
            log("Switching to %s." % current)
            sys.exit(EXIT_SWITCH)
        try:
            if time.time() - last_check_in >= interval:
                reply = check_in(config)
                last_check_in = time.time()
                interval = int(reply.get("checkInSeconds") or DEFAULT_CHECK_IN_SECONDS)
                latest = reply.get("latestVersion")
                if latest and latest != VERSION and latest not in (load_state().get("failed") or []):
                    install_update(config, latest)
            work = call(config, "/api/rack/next", {}).get("action")
            if work:
                run_action(config, work)
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
