#!/usr/bin/env python3
"""Keeps Promo's rack program running, and undoes a bad update by itself.

The service the install command sets up starts this file, never the program
directly. It runs whichever version state.json names as current. After an
update, the new version has two minutes to check in with Promo. If it stops
first, or is still running without having checked in, this goes back to the
version before it, never tries that version again, and leaves a note the
program reports to Promo on its next check-in, so the Phones dashboard says
what happened.

This file is deliberately small and is not updated from Promo: it is the part
that has to keep working when a new version does not.

Commands:
  launcher.py run
  launcher.py pair --url URL --code CODE --program PATH [--name NAME]
  launcher.py selftest-rollback   (installs a version that cannot start, to
                                   watch the rollback happen)
"""

import argparse
import json
import os
import re
import shutil
import signal
import subprocess
import sys
import time

EXIT_SWITCH = 75
CHECK_IN_GRACE_SECONDS = 120
BROKEN_VERSION = "0.0.0-broken"


def default_home():
    if sys.platform == "darwin":
        return os.path.expanduser("~/Library/Application Support/PromoRack")
    base = os.environ.get("XDG_DATA_HOME") or os.path.expanduser("~/.local/share")
    return os.path.join(base, "promo-rack")


HOME = os.environ.get("PROMO_RACK_HOME") or default_home()
STATE_PATH = os.path.join(HOME, "state.json")


def log(message):
    print("%s launcher: %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), message), flush=True)


def load_state():
    try:
        with open(STATE_PATH, "r", encoding="utf-8") as handle:
            return json.load(handle)
    except (OSError, ValueError):
        return {}


def save_state(state):
    temporary = "%s.%d.tmp" % (STATE_PATH, os.getpid())
    with open(temporary, "w", encoding="utf-8") as handle:
        json.dump(state, handle, indent=2)
    os.replace(temporary, STATE_PATH)


def program_path(version):
    return os.path.join(HOME, "versions", version, "promo_rack.py")


def roll_back(bad, why):
    """Goes back to the version before `bad` and never offers `bad` again."""
    state = load_state()
    previous = state.get("previous")
    failed = [version for version in (state.get("failed") or []) if version != bad] + [bad]
    if not previous or not os.path.exists(program_path(previous)):
        log("%s failed (%s) and there is no earlier version to go back to." % (bad, why))
        state.update(pending=None, failed=failed)
        save_state(state)
        return False
    state.update(
        current=previous,
        previous=None,
        pending=None,
        failed=failed,
        rolledBack={
            "from": bad,
            "to": previous,
            "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "why": why,
        },
    )
    save_state(state)
    log("Went back to %s because %s %s." % (previous, bad, why))
    return True


def run():
    # A stop sent to the launcher, by the service manager or a person, stops
    # the program with it, so a second copy is never left running alone.
    running = {"process": None}

    def stop(signum, frame):
        process = running["process"]
        if process is not None and process.poll() is None:
            process.terminate()
            try:
                process.wait(timeout=10)
            except subprocess.TimeoutExpired:
                process.kill()
        raise SystemExit(0)

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)

    failures = 0
    while True:
        state = load_state()
        version = state.get("current")
        if not version or not os.path.exists(program_path(version)):
            log("No program to run. Run the install command from the Phones dashboard.")
            time.sleep(60)
            continue
        pending = state.get("pending") or {}
        watching = pending.get("version") == version
        since = float(pending.get("since") or time.time())

        started = time.time()
        process = subprocess.Popen([sys.executable, program_path(version), "run"])
        running["process"] = process
        rolled = False
        while process.poll() is None:
            time.sleep(2)
            if not watching:
                continue
            if load_state().get("checkedIn") == version:
                watching = False
                log("%s checked in. Keeping it." % version)
            elif time.time() - since > CHECK_IN_GRACE_SECONDS:
                process.terminate()
                try:
                    process.wait(timeout=10)
                except subprocess.TimeoutExpired:
                    process.kill()
                rolled = roll_back(version, "did not check in within two minutes")
                break

        if rolled:
            failures = 0
            continue
        code = process.returncode
        if code == EXIT_SWITCH:
            failures = 0
            continue
        if watching and load_state().get("checkedIn") != version:
            if roll_back(version, "stopped with code %s before it checked in" % code):
                failures = 0
                continue
        # A crash after a good start: start it again, waiting longer each time
        # it crashes quickly, up to a minute.
        failures = failures + 1 if time.time() - started < 60 else 1
        wait = min(60, 2 ** min(failures, 6))
        log("The program stopped with code %s. Starting it again in %d seconds." % (code, wait))
        time.sleep(wait)


def version_of(path):
    with open(path, "r", encoding="utf-8") as handle:
        found = re.search(r'^VERSION = "([^"]+)"', handle.read(), re.M)
    if not found:
        raise SystemExit("%s does not say which version it is." % path)
    return found.group(1)


def pair(url, code, program, name, driver=""):
    """Puts the downloaded program in place, with the iPhone driver beside it
    when one was downloaded, and lets it pair itself."""
    version = version_of(program)
    folder = os.path.dirname(program_path(version))
    os.makedirs(folder, exist_ok=True)
    shutil.copyfile(program, program_path(version))
    if driver and os.path.exists(driver):
        shutil.copyfile(driver, os.path.join(folder, "iphone.py"))
    command = [sys.executable, program_path(version), "pair", "--url", url, "--code", code]
    if name:
        command += ["--name", name]
    raise SystemExit(subprocess.call(command))


def selftest_rollback():
    """Switches to a version that stops at once, so the rollback can be watched."""
    state = load_state()
    current = state.get("current")
    if not current:
        raise SystemExit("This rack is not paired yet.")
    folder = os.path.dirname(program_path(BROKEN_VERSION))
    os.makedirs(folder, exist_ok=True)
    with open(program_path(BROKEN_VERSION), "w", encoding="utf-8") as handle:
        handle.write('VERSION = "%s"\nraise SystemExit("This version is broken on purpose.")\n' % BROKEN_VERSION)
    state.update(
        previous=current,
        current=BROKEN_VERSION,
        pending={"version": BROKEN_VERSION, "since": time.time()},
        failed=[version for version in (state.get("failed") or []) if version != BROKEN_VERSION],
    )
    save_state(state)
    print(
        "Switched to %s. The launcher should go back to %s within a minute, and the Phones dashboard "
        "says so after the next check-in." % (BROKEN_VERSION, current)
    )


def main():
    parser = argparse.ArgumentParser(description="Keeps Promo's rack program running.")
    commands = parser.add_subparsers(dest="command", required=True)
    commands.add_parser("run")
    pairing = commands.add_parser("pair")
    pairing.add_argument("--url", required=True)
    pairing.add_argument("--code", required=True)
    pairing.add_argument("--program", required=True)
    pairing.add_argument("--name", default="")
    pairing.add_argument("--driver", default="")
    commands.add_parser("selftest-rollback")
    arguments = parser.parse_args()
    os.makedirs(HOME, exist_ok=True)
    if arguments.command == "pair":
        pair(arguments.url, arguments.code, arguments.program, arguments.name, arguments.driver)
    elif arguments.command == "selftest-rollback":
        selftest_rollback()
    else:
        run()


if __name__ == "__main__":
    main()
