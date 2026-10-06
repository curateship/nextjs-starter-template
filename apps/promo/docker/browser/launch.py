#!/usr/bin/env python3
"""Launches Camoufox on Neko's display and lets the app drive it.

The browser itself knows nothing about any particular network. What it can be
asked to do comes from the `routines` package beside this file, one module per
network, and a request names both: `/reddit/search` runs the `search` routine
`routines/reddit.py` registered.

Anti-detect's launcher opens the browser and then sleeps forever, because a
human drives it over the video stream. Promo needs both: a person still signs
in by hand and clears a captcha over the stream, and the rest of the time the
app drives the same window.

So the Camoufox call below is anti-detect's, unchanged. What is new is
underneath it: a small HTTP server that accepts a named routine, and a loop on
this thread that runs it against the page.

**Why the loop.** Playwright's sync API is not thread-safe, and the browser was
opened on this thread. A request handler touching the page from its own thread
corrupts the connection, so a request only puts work on a queue and waits; this
thread does every page action, one at a time. One browser, one driver, no locks
to get wrong.
"""

import hashlib
import json
import os
import queue
import signal
import sys
import threading
import traceback
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from camoufox.fingerprints import generate_fingerprint
from camoufox.sync_api import Camoufox
from camoufox.utils import get_screen_cons

from routines import ROUTINES

# Where the command server listens inside the container. The app publishes it
# to 127.0.0.1 on the host and nowhere else.
COMMAND_PORT = int(os.environ.get("COMMAND_PORT", "7900"))

# Every request must carry this. Without it the port is a way to drive a
# signed-in Reddit account, so a missing token is a refusal to start rather
# than a warning.
COMMAND_TOKEN = os.environ.get("COMMAND_TOKEN", "").strip()
if not COMMAND_TOKEN:
    sys.exit("COMMAND_TOKEN is required. It is what stops anything else driving this browser.")

# A page action that has not finished in this long is abandoned, so one stuck
# navigation cannot wedge the queue for every later request.
WORK_TIMEOUT_SECONDS = 90

# Routines that are slow on purpose get longer. A comment is typed at a
# person's speed after reading the post: about two minutes for 900 characters,
# never more than four. The app waits a little longer than this.
ROUTINE_TIMEOUT_SECONDS = {"reddit.comment": 240}

work = queue.Queue()


class Handler(BaseHTTPRequestHandler):
    # The default logger writes a line per request to stderr, which fills the
    # container's log with noise the app already records.
    def log_message(self, *_args):
        pass

    def _reply(self, status, body):
        payload = json.dumps(body).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def _authorised(self):
        if self.headers.get("x-promo-token", "") == COMMAND_TOKEN:
            return True
        self._reply(401, {"error": "bad token"})
        return False

    def _run(self, routine, args):
        if routine not in ROUTINES:
            self._reply(404, {"error": "no routine named %s" % routine})
            return
        answer = queue.Queue(maxsize=1)
        work.put((routine, args, answer))
        limit = ROUTINE_TIMEOUT_SECONDS.get(routine, WORK_TIMEOUT_SECONDS)
        try:
            ok, result = answer.get(timeout=limit)
        except queue.Empty:
            self._reply(
                504,
                {"error": "%s did not finish within %d seconds" % (routine, limit)},
            )
            return
        self._reply(200 if ok else 500, result if ok else {"error": result})

    def do_GET(self):  # noqa: N802 - the base class names it
        if not self._authorised():
            return
        # A health check that says nothing about Reddit, so the app can tell
        # "the container is up" from "the browser can reach Reddit".
        if self.path == "/health":
            self._reply(200, {"ok": True})
            return
        # Which identity this browser launched with, as a short id, and
        # whether it was made on this launch. The app keeps the id so it can
        # tell a profile's machine changed.
        if self.path == "/identity":
            self._reply(200, {"id": IDENTITY_ID, "made": IDENTITY_MADE})
            return
        # One network's state, asked for as /reddit/state. Named rather than
        # bare, because a second network has a state of its own.
        routine = self.path.lstrip("/").replace("/", ".")
        if routine.endswith(".state"):
            self._run(routine, {})
            return
        self._reply(404, {"error": "no route %s" % self.path})

    def do_POST(self):  # noqa: N802 - the base class names it
        if not self._authorised():
            return
        # "/reddit/search" is the routine "reddit.search".
        routine = self.path.lstrip("/").replace("/", ".")
        length = int(self.headers.get("content-length") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            args = json.loads(raw or b"{}")
        except ValueError:
            self._reply(400, {"error": "the body was not JSON"})
            return
        if not isinstance(args, dict):
            self._reply(400, {"error": "the body must be an object"})
            return
        self._run(routine, args)


def serve():
    server = ThreadingHTTPServer(("0.0.0.0", COMMAND_PORT), Handler)
    server.serve_forever()


# Build the proxy dict in Playwright format. Optional, but a real stealth test
# needs one — geoip below only engages when a proxy is present.
proxy = None
if os.environ.get("PROXY_SERVER"):
    proxy = {"server": os.environ["PROXY_SERVER"]}
    if os.environ.get("PROXY_USERNAME"):
        proxy["username"] = os.environ["PROXY_USERNAME"]
        proxy["password"] = os.environ.get("PROXY_PASSWORD", "")

start_url = os.environ.get("START_URL", "https://www.reddit.com/")


# Where a profile's identity is kept: beside its cookies, in its own volume.
IDENTITY_FILE = "/data/profile/promo-identity.json"

# Left in this container once a requested renewal is done. Supervisord
# restarts the launcher if it crashes, with the same settings, so without this
# a crash would make yet another identity while the app kept the first one's
# id. The container's own /tmp goes with the container.
RENEWED_MARKER = "/tmp/promo-identity-renewed"


def load_identity():
    """The profile's identity: the one saved in its volume, or a new one.

    A profile is one machine. Left alone, Camoufox draws a new screen, graphics
    card and font list on every launch: measured on 6 Oct 2026, one profile
    launched three times read 1536x864, 1536x864 and 1920x1080, an AMD, an
    Intel and an AMD card, and 42, 39 and 39 fonts. So the identity is made
    once and handed back on every later launch.

    Camoufox salts every draw it makes from a fingerprint (fonts, graphics
    card, media devices, audio) with that fingerprint itself, so the same
    fingerprint gives the same machine. A new one goes through JSON before use,
    so the first launch is handed exactly what later launches read back.

    It is kept as a file in the profile's own volume rather than passed in by
    the app: it measured about 400KB, mostly the list of media types the
    machine plays, far past what a container's settings can carry. Kept with
    the cookies, it lives and dies with them, which is right: a new volume is
    a new machine. FP_NEW_IDENTITY asks for a fresh one on purpose.

    The clock and the languages are not part of it. They follow the proxy's
    country at every launch, through geoip below.
    """
    fresh = os.environ.get("FP_NEW_IDENTITY", "") == "1" and not os.path.exists(RENEWED_MARKER)
    if not fresh and os.path.exists(IDENTITY_FILE):
        with open(IDENTITY_FILE, "r", encoding="utf-8") as saved:
            text = saved.read()
        return json.loads(text), hashlib.sha256(text.encode("utf-8")).hexdigest(), False
    made = generate_fingerprint(
        os=os.environ.get("FP_OS", "windows"),
        screen=get_screen_cons(False),
    )
    text = json.dumps(made, default=str, sort_keys=True)
    with open(IDENTITY_FILE, "w", encoding="utf-8") as saved:
        saved.write(text)
    if fresh:
        open(RENEWED_MARKER, "w").close()
    return json.loads(text), hashlib.sha256(text.encode("utf-8")).hexdigest(), True


IDENTITY, IDENTITY_ID, IDENTITY_MADE = load_identity()


def stop_gently(_signum, _frame):
    """Leaves the `with` block below, which closes Firefox properly.

    The app closes a browser by asking Docker to stop it and waiting ten
    seconds before removing it. Docker's ask arrives here as SIGTERM, and
    Python's default answer to it is to die on the spot. Firefox writes cookies
    to disk on a delay, so dying on the spot seconds after a sign-in could lose
    the sign-in. Raising SystemExit instead unwinds through Camoufox's own
    close, which saves the profile first. A routine's `except Exception` does
    not catch it, so it gets out from the middle of a page action too.
    """
    raise SystemExit(0)


signal.signal(signal.SIGTERM, stop_gently)

# headless=False  -> render to $DISPLAY (Neko's Xvfb), so the stream shows a window.
# persistent_context + user_data_dir -> cookies/storage survive container restarts,
#                                      which is what makes one hand sign-in last.
# geoip=True      -> align timezone/locale/geolocation to the proxy exit IP.
# fingerprint=    -> this profile's own identity, the same on every launch.
# humanize=True   -> the cursor travels like a hand on a mouse.
with Camoufox(
    headless=False,
    proxy=proxy,
    geoip=bool(proxy),
    humanize=True,
    os=os.environ.get("FP_OS", "windows"),
    fingerprint=IDENTITY,
    persistent_context=True,
    user_data_dir="/data/profile",
) as context:
    page = context.pages[0] if context.pages else context.new_page()
    # Not fatal. A tab the profile reopened can interrupt this first load, and
    # a slow proxy can time it out; either used to crash the launcher and
    # restart the whole browser. The window works without it.
    try:
        page.goto(start_url)
    except Exception:  # noqa: BLE001 - logged, and the browser carries on
        traceback.print_exc()

    threading.Thread(target=serve, daemon=True).start()
    print("command server listening on %d" % COMMAND_PORT, flush=True)

    # The driver. Every page action in the whole app happens on this line.
    while True:
        routine, args, answer = work.get()
        try:
            result = ROUTINES[routine](page, args)
            answer.put((True, result))
        except Exception as error:  # noqa: BLE001 - reported, never swallowed
            # The whole traceback goes to the container log; the app gets the
            # one sentence, because that is what ends up in front of a person.
            traceback.print_exc()
            answer.put((False, str(error) or error.__class__.__name__))
