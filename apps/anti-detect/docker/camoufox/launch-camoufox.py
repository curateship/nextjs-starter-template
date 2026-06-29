#!/usr/bin/env python3
"""Launch Camoufox headful on Neko's X display.

The result is a real, fingerprint-spoofed Firefox window that Neko streams over
WebRTC and the human drives by hand. The script blocks forever to keep the
window open; supervisord restarts it (autorestart) if the user closes it.
"""
import os
import time

from camoufox.sync_api import Camoufox

# Build the proxy dict in Playwright format. Optional, but a real stealth test
# needs one (see README) — geoip below only engages when a proxy is present.
proxy = None
if os.environ.get("PROXY_SERVER"):
    proxy = {"server": os.environ["PROXY_SERVER"]}
    if os.environ.get("PROXY_USERNAME"):
        proxy["username"] = os.environ["PROXY_USERNAME"]
        proxy["password"] = os.environ.get("PROXY_PASSWORD", "")

start_url = os.environ.get("START_URL", "https://abrahamjuliot.github.io/creepjs/")

# headless=False  -> render to $DISPLAY (Neko's Xvfb), so the stream shows a window.
# persistent_context + user_data_dir -> cookies/storage survive container restarts.
# geoip=True      -> align timezone/locale/geolocation to the proxy exit IP.
# os=             -> seed a consistent fingerprint; BrowserForge fills the rest.
with Camoufox(
    headless=False,
    proxy=proxy,
    geoip=bool(proxy),
    humanize=True,
    os=os.environ.get("FP_OS", "windows"),
    persistent_context=True,
    user_data_dir="/data/profile",
) as context:
    # persistent_context yields a BrowserContext; reuse its page or open one.
    page = context.pages[0] if context.pages else context.new_page()
    page.goto(start_url)
    # Hand the window to the human via Neko and keep this process alive.
    while True:
        time.sleep(3600)
